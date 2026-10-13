import * as net from "node:net";
import {
  decodeFrame,
  encodeFrame,
  DEFAULT_MAX_FRAME_BYTES,
  type WireFrame,
} from "./wire-protocol.js";

// ============================================================================
// TCP wire transport — moves coordination frames between two runtimes over a
// real network socket (node:net is legal in the adapters layer ONLY).
//
// The listener is a dumb wire: it decodes frames strictly and hands them to
// the endpoint's receive pipeline (validateEnvelope + replay guard BEFORE
// dispatch, durable inbox lifecycle on receipt). The client correlates
// ENVELOPE/ACK/REJECT by frameId and fails pending sends on connection loss,
// so re-send behavior is owned by the outbox's retry/dead-letter semantics.
// ============================================================================

export interface TransportError extends Error {
  readonly transportFailure: true;
}

/** Mark an error as a transport failure (connection lost / refused / timed out). */
export function asTransportError(message: string, cause?: Error): TransportError {
  const error: TransportError = Object.assign(new Error(message), {
    name: "TransportError",
    transportFailure: true as const,
    ...(cause !== undefined ? { cause } : {}),
  });
  return error;
}

export function isTransportError(error: unknown): error is TransportError {
  return error instanceof Error && (error as TransportError).transportFailure === true;
}

export interface ListenerOptions {
  /** Hard cap on one encoded frame line; an over-long line destroys the socket. */
  maxFrameBytes?: number;
}

/**
 * TCP listener: accepts connections, splits the byte stream on newlines,
 * decodes each line strictly, and forwards ENVELOPE frames to the handler.
 * The handler's response (ACK/REJECT) is written back on the same socket.
 * Any protocol violation destroys the connection — never partially trusted.
 */
export class TcpTransportListener {
  private server: net.Server | null = null;
  private readonly sockets = new Set<net.Socket>();
  private readonly maxFrameBytes: number;
  port = 0;

  constructor(
    private readonly onEnvelope: (
      frame: Extract<WireFrame, { type: "ENVELOPE" }>,
    ) => Promise<WireFrame>,
    options?: ListenerOptions,
  ) {
    this.maxFrameBytes = options?.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES;
  }

  /** Start listening. Port 0 = kernel-assigned; the bound port is set on start. */
  listen(port: number, host = "127.0.0.1"): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => {
        this.attach(socket);
      });
      server.on("error", (error) => {
        reject(asTransportError(`listener error: ${error.message}`, error));
      });
      server.listen(port, host, () => {
        this.server = server;
        const address = server.address();
        this.port = typeof address === "object" && address !== null ? address.port : port;
        resolve();
      });
    });
  }

  /** Stop listening; existing sockets are destroyed (models a partition). */
  close(): Promise<void> {
    return new Promise((resolve) => {
      const server = this.server;
      this.server = null;
      for (const socket of this.sockets) {
        socket.destroy();
      }
      this.sockets.clear();
      if (server === null) {
        resolve();
        return;
      }
      server.close(() => {
        resolve();
      });
    });
  }

  get listening(): boolean {
    return this.server !== null;
  }

  private attach(socket: net.Socket): void {
    this.sockets.add(socket);
    socket.once("close", () => {
      this.sockets.delete(socket);
    });
    socket.setEncoding("utf8");
    let buffer = "";
    const handleLine = (line: string): void => {
      if (line.length === 0) {
        return;
      }
      let frame: WireFrame;
      try {
        if (line.length > this.maxFrameBytes) {
          throw new Error(`frame of ${line.length} bytes exceeds limit ${this.maxFrameBytes}`);
        }
        frame = decodeFrame(line);
      } catch {
        // Fail closed: a bad frame poisons the stream; destroy, never guess.
        socket.destroy();
        return;
      }
      if (frame.type === "ENVELOPE") {
        void this.onEnvelope(frame)
          .then((response) => {
            if (!socket.destroyed) {
              socket.write(encodeFrame(response));
            }
          })
          .catch(() => {
            socket.destroy();
          });
        return;
      }
      // A listener never expects ACK/REJECT from a peer on a fresh connection;
      // treat as protocol noise and fail closed.
      socket.destroy();
    };
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (buffer.length > this.maxFrameBytes) {
          socket.destroy();
          return;
        }
        handleLine(line);
        if (socket.destroyed) {
          return;
        }
        newlineIndex = buffer.indexOf("\n");
      }
      if (buffer.length > this.maxFrameBytes) {
        socket.destroy();
      }
    });
    socket.on("error", () => {
      socket.destroy();
    });
  }
}

export interface ClientOptions {
  /** How long a send waits for its ACK/REJECT before failing (ms). */
  ackTimeoutMs?: number;
  maxFrameBytes?: number;
}

interface PendingSend {
  resolve: (frame: WireFrame) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * TCP client: lazily connects, sends ENVELOPE frames, and resolves each send
 * with the correlated ACK/REJECT frame. Connection loss (error/close/ack
 * timeout) rejects all pending sends with a TransportError so the caller's
 * outbox can apply retry/dead-letter semantics — a pending send never hangs
 * silently.
 */
export class TcpTransportClient {
  private socket: net.Socket | null = null;
  private buffer = "";
  private readonly pending = new Map<string, PendingSend>();
  private readonly ackTimeoutMs: number;
  private readonly maxFrameBytes: number;

  constructor(
    private readonly host = "127.0.0.1",
    private readonly port: number,
    options?: ClientOptions,
  ) {
    this.ackTimeoutMs = options?.ackTimeoutMs ?? 5_000;
    this.maxFrameBytes = options?.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES;
  }

  private connect(): Promise<void> {
    if (this.socket !== null && !this.socket.destroyed && this.socket.writable) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const socket = net.connect(this.port, this.host);
      socket.setEncoding("utf8");
      const failOnce = (error: Error): void => {
        socket.destroy();
        reject(asTransportError(`connect failed: ${error.message}`, error));
      };
      socket.once("error", failOnce);
      socket.once("connect", () => {
        socket.off("error", failOnce);
        this.socket = socket;
        this.attach(socket);
        resolve();
      });
    });
  }

  private attach(socket: net.Socket): void {
    socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      let newlineIndex = this.buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = this.buffer.slice(0, newlineIndex);
        this.buffer = this.buffer.slice(newlineIndex + 1);
        newlineIndex = this.buffer.indexOf("\n");
        if (line.length === 0) {
          continue;
        }
        let frame: WireFrame;
        try {
          frame = decodeFrame(line);
        } catch {
          // Garbage from the receiver: treat the connection as lost.
          this.failAllPending(asTransportError("receiver sent a malformed frame"));
          socket.destroy();
          return;
        }
        const pending = this.pending.get(frame.frameId);
        if (pending !== undefined) {
          this.pending.delete(frame.frameId);
          clearTimeout(pending.timer);
          pending.resolve(frame);
        }
      }
    });
    socket.once("error", (error) => {
      this.failAllPending(asTransportError(`connection error: ${error.message}`, error));
      socket.destroy();
    });
    socket.once("close", () => {
      this.failAllPending(asTransportError("connection lost"));
      this.socket = null;
    });
  }

  private failAllPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  /**
   * Send a frame and await the correlated response. Rejects with a
   * TransportError on connection loss, connect failure, or ack timeout.
   */
  async sendFrame(frame: WireFrame): Promise<WireFrame> {
    await this.connect();
    const socket = this.socket;
    if (socket === null || socket.destroyed || !socket.writable) {
      throw asTransportError("not connected");
    }
    return new Promise<WireFrame>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(frame.frameId);
        reject(
          asTransportError(`ack timeout after ${this.ackTimeoutMs}ms (frameId ${frame.frameId})`),
        );
      }, this.ackTimeoutMs);
      this.pending.set(frame.frameId, { resolve, reject, timer });
      socket.write(encodeFrame(frame), (error) => {
        if (error) {
          this.pending.delete(frame.frameId);
          clearTimeout(timer);
          reject(asTransportError(`write failed: ${error.message}`, error));
        }
      });
    });
  }

  /** Destroy the connection (pending sends fail with a TransportError). */
  close(): void {
    this.failAllPending(asTransportError("client closed"));
    if (this.socket !== null) {
      this.socket.destroy();
      this.socket = null;
    }
  }
}
