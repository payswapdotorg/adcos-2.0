import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonlInboxStore } from "../src/adapters/jsonl-inbox-store.js";
import { validateEnvelope, createEnvelopeReplayGuard } from "../src/contract.js";
import type { Message } from "@adcos/contracts";

const now = 1_700_000_000_000;

const message = (id: string, idempotencyKey: string): Message => ({
  id,
  envelope: {
    schema: { major: 1, minor: 2, patch: 0 },
    eventId: `evt-${id}`,
    sender: "inst-alice",
    receiver: "inst-bob",
    scope: "device.forwarding",
    issuedAt: now - 500,
    idempotencyKey,
  },
  payload: { kind: "forward" },
  lifecycle: { state: "PENDING", attempts: 0, maxRetries: 3 },
  createdAt: now - 500,
  updatedAt: now - 500,
});

const ctx = {
  allowedScopes: ["device.forwarding"],
  currentPolicyEpoch: 0,
  knownSenders: ["inst-alice"],
  requireKnownSender: true,
  maxPayloadDigestLength: 64,
  now,
};

describe("JsonlInboxStore (durable inbox/outbox)", () => {
  const dir = mkdtempSync(join(tmpdir(), "adcos-inbox-"));

  it("persists validated messages across restarts (new store, same file)", () => {
    const path = join(dir, "inbox-a.jsonl");
    const store = new JsonlInboxStore(path);
    const guard = createEnvelopeReplayGuard();

    for (const id of ["msg-1", "msg-2", "msg-3"]) {
      const candidate = message(id, `op-${id}`);
      const validation = validateEnvelope(candidate.envelope, ctx, guard);
      assert.equal(validation.accepted, true);
      store.append(candidate);
    }
    assert.equal(store.list().length, 3);

    // "restart": a brand-new store instance reading the same file
    const restarted = new JsonlInboxStore(path);
    assert.equal(restarted.stats().loaded, 3);
    assert.equal(restarted.stats().tornLines, 0);
    assert.deepEqual(
      restarted.list().map((m) => m.id),
      ["msg-1", "msg-2", "msg-3"],
    );
    // replay guard state is process-local: the DURABLE layer never fakes
    // replay protection — that is the coordination layer's runtime concern.
  });

  it("reports and skips a torn tail line instead of trusting it", () => {
    const path = join(dir, "inbox-b.jsonl");
    writeFileSync(
      path,
      `${JSON.stringify(message("msg-1", "op-1"))}\n{"id":"msg-2","envelope":`,
      "utf8",
    );
    const store = new JsonlInboxStore(path);
    assert.equal(store.stats().loaded, 1);
    assert.equal(store.stats().tornLines, 1);
    assert.equal(store.list()[0].id, "msg-1");
  });

  it("treats a missing file as an empty inbox (fresh start)", () => {
    const store = new JsonlInboxStore(join(dir, "missing.jsonl"));
    assert.deepEqual(store.stats(), { loaded: 0, tornLines: 0 });
    assert.deepEqual(store.list(), []);
  });

  it("survives write-then-reload cycles (append after restart)", () => {
    const path = join(dir, "inbox-c.jsonl");
    const first = new JsonlInboxStore(path);
    first.append(message("msg-1", "op-1"));
    const second = new JsonlInboxStore(path);
    second.append(message("msg-2", "op-2"));
    const third = new JsonlInboxStore(path);
    assert.equal(third.stats().loaded, 2);
    assert.deepEqual(
      third.list().map((m) => m.id),
      ["msg-1", "msg-2"],
    );
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
});
