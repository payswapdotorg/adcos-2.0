import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { Schemas } from "../src/index.js";

// Golden-path validation: ONE valid fixture for every exported schema family.
// The coverage assertion guarantees no family is silently skipped.

const now = 1_700_000_000_000;
const schemaVersion = { major: 1, minor: 2, patch: 0 };

const envelope = {
  schema: schemaVersion,
  eventId: "evt-1001",
  commandId: "cmd-53",
  sender: "inst-alice",
  receiver: "inst-bob",
  scope: "device.forwarding",
  issuedAt: now,
  expiresAt: now + 3_600_000,
  correlationId: "corr-7",
  causationId: "cause-9",
  idempotencyKey: "idem-42",
  payloadDigest: "sha256:0f2a",
  authorizationRef: "authz-1",
  delegationRef: "deleg-2",
  policyEpoch: 7,
  signature: "sig-zzz",
};

const labComparisonEvidence = {
  id: "lab-1",
  intent: "intent-1",
  baseline: "baseline-status-quo",
  alternatives: ["alt-sharenet", "alt-unicom"],
  noChange: { cost: 100, reliability: 0.9, utilization: 0.4 },
  selected: {
    strategy: "alt-sharenet",
    cost: 80,
    reliability: 0.95,
    utilization: 0.6,
    confidence: 0.8,
    assumptions: ["price-stable-30d"],
  },
  comparison: { costDelta: -20 },
  evaluatedAt: now,
  expiresAt: now + 604_800_000,
};

const fixtures: Record<string, unknown> = {
  ResourceProjectionReference: {
    id: "res-1",
    owner: "prin-alice",
    device: "dev-1",
    type: "phone",
    capability: "forwarding-v1",
    modes: ["local", "relay"],
    limits: { maxSessions: 2 },
    status: "DEGRADED",
    freshness: now,
    evidence: ["obs-1"],
    revoked: false,
  },
  InstanceIdentityReference: {
    id: "inst-1",
    principal: "prin-alice",
    device: "dev-1",
    type: "USER",
    capabilities: ["forwarding"],
  },
  CapabilityObservation: {
    declared: {
      capability: "forwarding-v1",
      version: "1.0.0",
      schedule: { start: now, end: now + 3_600_000, timezone: "Africa/Accra" },
      limits: { maxSessions: 2 },
      beneficiaries: ["prin-bob"],
    },
    observed: {
      capability: "forwarding-v1",
      version: "1.0.0",
      status: "STALE",
      freshness: now,
      evidence: ["obs-1"],
    },
    evidenceClass: "OBSERVATION",
  },
  SchemaVersion: schemaVersion,
  Envelope: envelope,
  TaskLease: {
    deadline: now + 60_000,
    retryBudget: 3,
    cancellationDeadline: now + 30_000,
    cancellationReason: "shutdown",
  },
  Delegation: {
    id: "deleg-1",
    principal: "prin-alice",
    delegate: "prin-bob",
    scope: "device.forwarding",
    issuedAt: now,
    expiresAt: now + 3_600_000,
    attenuation: { maxDurationSeconds: "3600" },
    revoked: false,
    revocationReason: "rotated",
  },
  EventLifecycle: {
    state: "PROCESSING",
    attempts: 1,
    lastAttemptAt: now,
    nextRetryAt: now + 1_000,
    maxRetries: 3,
    ackState: "PENDING",
  },
  Message: {
    id: "msg-1",
    envelope,
    payload: { kind: "forward" },
    lifecycle: { state: "PENDING", attempts: 0, maxRetries: 3 },
    createdAt: now,
    updatedAt: now,
  },
  OrganizationCandidate: {
    id: "orgc-1",
    name: "Accra Forwarding Co-op",
    description: "pooled connectivity",
    principals: ["prin-alice", "prin-bob"],
    requirements: { region: "GH" },
    capacity: { maxMembers: 10 },
    expiresAt: now + 86_400_000,
  },
  OrganizationMembership: {
    id: "mem-1",
    organization: "org-1",
    principal: "prin-alice",
    state: "MEMBER",
    role: "admin",
    joinedAt: now,
    expiresAt: now + 86_400_000,
    revoked: false,
    revocationReason: "rotated",
  },
  OrganizationMandate: {
    id: "mand-1",
    organization: "org-1",
    principal: "prin-alice",
    scope: "group.purchase",
    permissions: ["offer:read", "commitment:write"],
    issuedAt: now,
    expiresAt: now + 86_400_000,
    revoked: false,
  },
  GroupPurchaseRequest: {
    id: "gpr-1",
    intent: "intent-1",
    organization: "org-1",
    requirements: { product: "data-bundle" },
    participants: ["prin-alice", "prin-bob"],
    threshold: 3,
    expiresAt: now + 86_400_000,
  },
  GroupPurchaseOffer: {
    id: "gpo-1",
    request: "gpr-1",
    supplier: "teleco-x",
    product: "data-bundle-10gb",
    capability: "data-plan-v2",
    region: "GH",
    quantity: 10,
    perMemberCost: 12.5,
    totalCost: 125,
    recurringCharges: [{ amount: 12.5, frequency: "monthly", description: "per member" }],
    oneTimeCharges: [{ amount: 5, description: "activation" }],
    term: "12-months",
    limitations: ["fair-use"],
    expiry: now + 172_800_000,
    provenance: "unicom-listing",
  },
  GroupPurchaseCommitment: {
    id: "gpc-1",
    request: "gpr-1",
    offer: "gpo-1",
    participant: "prin-alice",
    allocation: { lines: 1 },
    acceptedAt: now,
    expiresAt: now + 86_400_000,
    revoked: false,
  },
  LabComparisonEvidence: labComparisonEvidence,
  OpportunityEvidence: {
    id: "opp-1",
    intent: "intent-1",
    evidence: labComparisonEvidence,
    confidence: 0.8,
    cost: 80,
    benefit: 20,
    risk: 0.1,
    recommendation: "switch",
    expiresAt: now + 604_800_000,
  },
  Status: {
    state: "UNKNOWN",
    code: "E-PENDING",
    message: "awaiting observation",
    freshness: now,
    retryAfter: 30,
    reconcile: true,
  },
  PaymentReference: {
    id: "pay-1",
    type: "mobile-money",
    authority: "authorized-psp",
    created: now,
    expires: now + 604_800_000,
    amount: 125,
    currency: "GHS",
    settled: false,
  },
  ShareNetPort: {
    endpoint: "https://sharenet.local/api",
    capabilities: ["forwarding", "measurement"],
    auth: { provider: "oauth2", credentials: { client: "abc" } },
  },
  AdcosPort: {
    version: schemaVersion,
    capabilities: ["resources:read"],
    endpoints: { resources: "/api/resources" },
    auth: { methods: ["oauth2"], scopes: ["resources:read"] },
  },
  Versioned: { schemaVersion },
};

describe("Complete validation (golden path)", () => {
  it("covers every object-form schema family registered in Schemas", () => {
    const objectFamilies = Object.entries(Schemas)
      .filter(([, schema]) => schema instanceof z.ZodObject)
      .map(([name]) => name)
      .sort();
    assert.deepEqual(Object.keys(fixtures).sort(), objectFamilies);
  });

  for (const name of Object.keys(fixtures)) {
    it(`parses a valid ${name}`, () => {
      const schema = Schemas[name as keyof typeof Schemas];
      const result = schema.safeParse(fixtures[name]);
      assert.equal(result.success, true);
    });
  }
});

describe("Enum vocabularies", () => {
  it("EvidenceClass accepts each declared value and rejects others", () => {
    for (const value of Schemas.EvidenceClass.options) {
      assert.equal(Schemas.EvidenceClass.safeParse(value).success, true);
    }
    assert.equal(Schemas.EvidenceClass.safeParse("NOT_A_CLASS").success, false);
  });

  it("AckState accepts each declared value and rejects others", () => {
    for (const value of Schemas.AckState.options) {
      assert.equal(Schemas.AckState.safeParse(value).success, true);
    }
    assert.equal(Schemas.AckState.safeParse("DONE").success, false);
  });

  it("MembershipState accepts each declared value and rejects others", () => {
    for (const value of Schemas.MembershipState.options) {
      assert.equal(Schemas.MembershipState.safeParse(value).success, true);
    }
    assert.equal(Schemas.MembershipState.safeParse("ACTIVE").success, false);
  });

  it("GroupPurchaseState accepts each declared value and rejects others", () => {
    for (const value of Schemas.GroupPurchaseState.options) {
      assert.equal(Schemas.GroupPurchaseState.safeParse(value).success, true);
    }
    assert.equal(Schemas.GroupPurchaseState.safeParse("PENDING").success, false);
  });
});
