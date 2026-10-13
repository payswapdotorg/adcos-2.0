import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import {
  TcpTransportListener,
  TcpTransportClient,
  isTransportError,
} from "../src/adapters/transport/tcp-transport.js";
import {
  encodeFrame,
  decodeFrame,
  WireProtocolError,
  createFrameId,
} from "../src/adapters/transport/wire-protocol.js";
import * as net from "node:net";

// ============================================================================
// Wire-level transport tests: real TCP sockets on 127.0.0.1 (loopback is a
// real network interface — frames go through the kernel TCP stack, the JSONL
// framing, and the strict fail-closed decoder). Endpoint semantics live in
// coordination-endpoint.test.ts; this file exercises the raw wire.
// ============================================================================

const envelope = {
  schema: { major: 1, minor: 2, patch: 0 },
  eventId: "evt-wire-1",
  sender: "inst-a",
  receiver: "inst-b",
  scope: "device.forwarding",
  issuedAt: 1_700_000_000_000,
};

describe("wire-protocol codec", () => {
  it("round-trips ACK, REJECT and ENVELOPE frames", () => {
    const frames = [
      { type: "ACK", frameId: createFrameId("t"), messageId: "msg-1" },
      {
        type: "REJECT",
        frameId: createFrameId("t"),
        failures: [{ code: "REPLAY", detail: "dup" }],
      },
      { type: "ENVELOPE", frameId: createFrameId("t"), envelope },
    ] as const;
    for (const frame of frames) {
      const line = encodeFrame(frame);
      assert.ok(line.endsWith("\n"));
      assert.deepEqual(decodeFrame(line.trimEnd()), frame);
    }
  });

  it("fails closed on malformed JSON, unknown types, and missing correlation ids", () => {
    assert.throws(() => decodeFrame("not json"), WireProtocolError);
    assert.throws(() => decodeFrame('{"type":"BOMB"}'), WireProtocolError);
    assert.throws(() => decodeFrame('{"type":"ACK"}'), WireProtocolError);
    assert.throws(
      () => decodeFrame('{"type":"ACK","frameId":"","messageId":"m"}'),
      WireProtocolError,
    );
    assert.throws(
      () => decodeFrame('{"type":"ENVELOPE","frameId":"f","envelope":{"noEventId":true}}'),
      WireProtocolError,
    );
    assert.throws(
      () => decodeFrame('{"type":"REJECT","frameId":"f","failures":[]}'),
      WireProtocolError,
    );
  });
});

describe("TcpTransportListener + TcpTransportClient (real TCP loopback)", () => {
  const cleanups: (() => void)[] = [];

  after(() => {
    for (const cleanup of cleanups) cleanup();
  });

  it("carries an ENVELOPE frame and its correlated ACK response", async () => {
    const listener = new TcpTransportListener(async (frame) => ({
      type: "ACK",
      frameId: frame.frameId,
      messageId: `msg-${String((frame.envelope as { eventId: string }).eventId)}`,
    }));
    cleanups.push(() => listener.close());
    await listener.listen(0);
    const client = new TcpTransportClient("127.0.0.1", listener.port, { ackTimeoutMs: 2000 });
    cleanups.push(() => client.close());
    const frameId = createFrameId("test");
    const response = await client.sendFrame({ type: "ENVELOPE", frameId, envelope });
    assert.equal(response.type, "ACK");
    assert.equal(response.frameId, frameId);
    assert.equal(response.messageId, "msg-evt-wire-1");
  });

  it("carries a REJECT response with failure codes", async () => {
    const listener = new TcpTransportListener(async (frame) => ({
      type: "REJECT",
      frameId: frame.frameId,
      failures: [{ code: "OUT_OF_SCOPE", detail: `scope not allowed` }],
    }));
    cleanups.push(() => listener.close());
    await listener.listen(0);
    const client = new TcpTransportClient("127.0.0.1", listener.port, { ackTimeoutMs: 2000 });
    cleanups.push(() => client.close());
    const frameId = createFrameId("test");
    const response = await client.sendFrame({ type: "ENVELOPE", frameId, envelope });
    assert.equal(response.type, "REJECT");
    assert.equal(response.failures[0]?.code, "OUT_OF_SCOPE");
  });

  it("destroys the connection on a malformed frame line (fail closed, never trusted)", async () => {
    let received = 0;
    const listener = new TcpTransportListener(async (frame) => {
      received += 1;
      return { type: "ACK", frameId: frame.frameId, messageId: "m" };
    });
    cleanups.push(() => listener.close());
    await listener.listen(0);
    const socket = net.connect(listener.port, "127.0.0.1");
    cleanups.push(() => socket.destroy());
    socket.write("this is not a frame\n");
    await new Promise<void>((resolve) => socket.once("close", () => resolve()));
    assert.equal(received, 0);
  });

  it("fails a pending send as a TransportError when the ack times out (no silent hang)", async () => {
    const listener = new TcpTransportListener(async (frame) => {
      // Receive but never respond: models a black-holed connection.
      void frame;
      return new Promise<never>(() => {});
    });
    cleanups.push(() => listener.close());
    await listener.listen(0);
    const client = new TcpTransportClient("127.0.0.1", listener.port, { ackTimeoutMs: 120 });
    cleanups.push(() => client.close());
    await assert.rejects(
      () => client.sendFrame({ type: "ENVELOPE", frameId: createFrameId("t"), envelope }),
      (error: unknown) => isTransportError(error) && /ack timeout/.test(error.message),
    );
  });

  it("fails a pending send as a TransportError when the listener is killed mid-send", async () => {
    let release: (value: Promise<never>) => void = () => {};
    const gate = new Promise<never>((_resolve, reject) => {
      release = reject;
    });
    const listener = new TcpTransportListener(async (frame) => {
      void frame;
      await gate; // never resolves; the socket is killed underneath it
      return { type: "ACK", frameId: "unused", messageId: "unused" };
    });
    await listener.listen(0);
    const client = new TcpTransportClient("127.0.0.1", listener.port, { ackTimeoutMs: 5000 });
    const pending = client.sendFrame({ type: "ENVELOPE", frameId: createFrameId("t"), envelope });
    await new Promise<void>((resolve) => setTimeout(resolve, 60));
    release(new Error("gate released"));
    await listener.close();
    await assert.rejects(
      () => pending,
      (error: unknown) => isTransportError(error),
    );
  });
});
