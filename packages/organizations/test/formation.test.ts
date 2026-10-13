import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  foundOrganization,
  scopeCovers,
  amendMandate,
  dissolveOrganization,
  mandateCovers,
  advanceMembership,
} from "../src/contract.js";
import type {
  OrganizationMembership,
  OrganizationMandate,
  GroupPurchaseCommitment,
  ConsentRecord,
  FoundingInput,
} from "../src/contract.js";

const now = 1_700_000_000_000;

// SYNTHETIC FIXTURES — principals, evidence and commitments below are test
// inputs only; nothing claims real identities or live offers exist.

const founding = (overrides: Partial<FoundingInput> = {}): FoundingInput => ({
  organization: "org-1",
  pursuitEvidenceId: "opp-1",
  pursuitVerdict: "PURSUE",
  pursuitExpiresAt: now + 604_800_000,
  candidates: [
    { principal: "prin-alice", consent: true, consentRecordedAt: now - 1000 },
    { principal: "prin-bob", consent: true, consentRecordedAt: now - 2000 },
    { principal: "prin-carol", consent: true, consentRecordedAt: now - 3000 },
  ],
  minFounders: 2,
  authorityScope: "group.purchase",
  initialMandates: [
    { principal: "prin-alice", scope: "group.purchase.offers", permissions: ["offer:read"] },
    { principal: "prin-bob", scope: "group.purchase", permissions: ["commitment:write"] },
    { principal: "prin-carol", scope: "group.purchase", permissions: ["commitment:read"] },
  ],
  now,
  ...overrides,
});

describe("foundOrganization (founding from a Lab PURSUE verdict)", () => {
  it("gathers candidates → consent → formation with initial mandates", () => {
    const r = foundOrganization(founding());
    assert.equal(r.state, "FORMED");
    assert.deepEqual(r.founders, ["prin-alice", "prin-bob", "prin-carol"]);
    assert.equal(r.memberships.length, 3);
    for (const m of r.memberships) {
      assert.equal(m.state, "MEMBER");
      assert.equal(m.role, "founder");
      assert.equal(m.organization, "org-1");
      assert.equal(m.joinedAt, now);
    }
    assert.equal(r.mandates.length, 3);
    const bobMandate = r.mandates.find((m) => m.principal === "prin-bob");
    assert.equal(bobMandate?.scope, "group.purchase");
    assert.equal(bobMandate?.id, "org-1-mand-prin-bob");
    assert.ok(r.notes.some((n) => n.includes("not legal incorporation, not blanket authority")));
  });

  it("records the PURSUE evidence id as provenance", () => {
    const r = foundOrganization(founding());
    assert.equal(r.pursuitEvidenceId, "opp-1");
  });

  it("non-PURSUE verdicts cannot found — the Lab proposes, consent decides", () => {
    for (const verdict of ["REJECT", "INSUFFICIENT_EVIDENCE"] as const) {
      const r = foundOrganization(founding({ pursuitVerdict: verdict }));
      assert.equal(r.state, "FORMATION_FAILED");
      assert.match(r.notes[r.notes.length - 1] ?? "", /cannot found/);
    }
  });

  it("stale pursuit evidence fails closed", () => {
    const r = foundOrganization(founding({ pursuitExpiresAt: now - 1 }));
    assert.equal(r.state, "FORMATION_FAILED");
    assert.match(r.notes[r.notes.length - 1] ?? "", /expired — re-evaluate/);
  });

  it("a candidate pool below the minimum viable membership fails closed", () => {
    const r = foundOrganization(
      founding({
        candidates: [{ principal: "prin-alice", consent: true, consentRecordedAt: now }],
      }),
    );
    assert.equal(r.state, "FORMATION_FAILED");
    assert.match(r.notes[r.notes.length - 1] ?? "", /below minimum viable founding membership 2/);
  });

  it("missing founder consent stays CONSENT_PENDING — never a silent formation", () => {
    const r = foundOrganization(
      founding({
        candidates: [
          { principal: "prin-alice", consent: true, consentRecordedAt: now - 1000 },
          { principal: "prin-bob", consent: false },
        ],
      }),
    );
    assert.equal(r.state, "CONSENT_PENDING");
    assert.deepEqual(r.consentGaps, ["prin-bob"]);
    assert.equal(r.memberships.length, 0);
    assert.equal(r.mandates.length, 0);
    assert.ok(r.notes.some((n) => n.includes("nothing is committed without consent")));
  });

  it("undated or future-dated consent records do not count as consent", () => {
    const undated = foundOrganization(
      founding({
        candidates: [
          { principal: "prin-alice", consent: true },
          { principal: "prin-bob", consent: true, consentRecordedAt: now + 5000 },
        ],
      }),
    );
    assert.equal(undated.state, "CONSENT_PENDING");
    assert.ok(undated.notes.some((n) => n.includes("no record date — not counted")));
    assert.ok(undated.notes.some((n) => n.includes("future-dated — not counted")));
  });

  it("mandate/founder mismatches fail closed", () => {
    const noMandate = foundOrganization(
      founding({
        initialMandates: [
          { principal: "prin-alice", scope: "group.purchase", permissions: ["offer:read"] },
          { principal: "prin-bob", scope: "group.purchase", permissions: ["offer:read"] },
        ],
      }),
    );
    assert.equal(noMandate.state, "FORMATION_FAILED");
    assert.match(
      noMandate.notes[noMandate.notes.length - 1] ?? "",
      /prin-carol' has no initial mandate/,
    );

    const foreignTarget = foundOrganization(
      founding({
        initialMandates: [
          { principal: "prin-alice", scope: "group.purchase", permissions: ["offer:read"] },
          { principal: "prin-bob", scope: "group.purchase", permissions: ["offer:read"] },
          { principal: "prin-zed", scope: "group.purchase", permissions: ["offer:read"] },
        ],
      }),
    );
    assert.equal(foreignTarget.state, "FORMATION_FAILED");
    assert.match(
      foreignTarget.notes[foreignTarget.notes.length - 1] ?? "",
      /targets a principal that has not consented/,
    );
  });

  it("mandate scopes outside the organization authority scope fail closed", () => {
    const r = foundOrganization(
      founding({
        initialMandates: [
          { principal: "prin-alice", scope: "group.purchase", permissions: ["offer:read"] },
          { principal: "prin-bob", scope: "network.admin", permissions: ["admin:all"] },
          { principal: "prin-carol", scope: "group.purchase", permissions: ["offer:read"] },
        ],
      }),
    );
    assert.equal(r.state, "FORMATION_FAILED");
    assert.match(
      r.notes[r.notes.length - 1] ?? "",
      /outside the organization authority scope 'group.purchase'/,
    );
  });
});

describe("scopeCovers (prefix semantics, consistent with mandateCovers)", () => {
  it("matches the merged mandateCovers semantics for revocation-free mandates", () => {
    const mandate: OrganizationMandate = {
      id: "mand-1",
      organization: "org-1",
      principal: "prin-alice",
      scope: "group.purchase",
      permissions: ["offer:read"],
      issuedAt: now,
      revoked: false,
    };
    for (const scope of [
      "group.purchase",
      "group.purchase.offers",
      "group.purchasing",
      "group",
      "other.scope",
    ]) {
      assert.equal(
        scopeCovers(mandate.scope, scope),
        mandateCovers(mandate, scope, now),
        `scopeCovers must agree with mandateCovers on '${scope}'`,
      );
    }
  });
});

const baseMandate: OrganizationMandate = {
  id: "mand-1",
  organization: "org-1",
  principal: "prin-alice",
  scope: "group.purchase",
  permissions: ["offer:read", "commitment:write"],
  issuedAt: now - 10_000,
  expiresAt: now + 86_400_000,
  revoked: false,
};

const consent = (principal: string, overrides: Partial<ConsentRecord> = {}): ConsentRecord => ({
  principal,
  consent: true,
  recordedAt: now - 500,
  ...overrides,
});

describe("amendMandate (explicit member-consent rules)", () => {
  it("narrowing a mandate needs only the principal's consent", () => {
    const r = amendMandate({
      mandate: baseMandate,
      amendment: {
        scope: "group.purchase.offers",
        permissions: ["offer:read"],
        reason: "limit to offer reading",
      },
      amendmentId: "mand-1-v2",
      activeMembers: ["prin-alice", "prin-bob", "prin-carol"],
      consents: [consent("prin-alice")],
      maxConsentAgeMs: 60_000,
      now,
    });
    assert.equal(r.applied, true);
    assert.equal(r.classification, "NARROWING");
    assert.equal(r.mandate?.id, "mand-1-v2");
    assert.equal(r.mandate?.scope, "group.purchase.offers");
    assert.deepEqual(r.mandate?.permissions, ["offer:read"]);
    assert.deepEqual(r.consentsConsidered, ["prin-alice"]);
  });

  it("widening a mandate requires unanimous active-member consent", () => {
    const amendment = {
      amendment: {
        permissions: ["offer:read", "commitment:write", "order:place"],
        reason: "add ordering",
      },
      amendmentId: "mand-1-v2",
      activeMembers: ["prin-alice", "prin-bob", "prin-carol"],
      maxConsentAgeMs: 60_000,
      now,
    } as const;
    const denied = amendMandate({
      mandate: baseMandate,
      ...amendment,
      consents: [consent("prin-alice"), consent("prin-bob")],
    });
    assert.equal(denied.applied, false);
    assert.equal(denied.classification, "WIDENING");
    assert.match(denied.reason ?? "", /missing: prin-carol/);

    const allowed = amendMandate({
      mandate: baseMandate,
      ...amendment,
      consents: [consent("prin-alice"), consent("prin-bob"), consent("prin-carol")],
    });
    assert.equal(allowed.applied, true);
    assert.equal(allowed.classification, "WIDENING");
    assert.deepEqual(allowed.consentsConsidered, ["prin-alice", "prin-bob", "prin-carol"]);
  });

  it("scope widening and expiry extension are WIDENING", () => {
    const scopeWider = amendMandate({
      mandate: baseMandate,
      amendment: { scope: "group", reason: "broader scope" },
      amendmentId: "mand-1-v2",
      activeMembers: ["prin-alice"],
      consents: [consent("prin-alice")],
      maxConsentAgeMs: 60_000,
      now,
    });
    assert.equal(scopeWider.classification, "WIDENING");
    assert.equal(scopeWider.applied, true); // single active member, unanimous
    assert.equal(scopeWider.mandate?.scope, "group");

    const expiryExtended = amendMandate({
      mandate: baseMandate,
      amendment: { expiresAt: now + 172_800_000, reason: "extend expiry" },
      amendmentId: "mand-1-v2",
      activeMembers: ["prin-alice"],
      consents: [consent("prin-alice")],
      maxConsentAgeMs: 60_000,
      now,
    });
    assert.equal(expiryExtended.classification, "WIDENING");
  });

  it("stale, refused, and future-dated consents are not counted", () => {
    const r = amendMandate({
      mandate: baseMandate,
      amendment: { permissions: ["offer:read"], reason: "narrow" },
      amendmentId: "mand-1-v2",
      activeMembers: ["prin-alice"],
      consents: [
        consent("prin-alice", { recordedAt: now - 999_999 }),
        consent("prin-alice", { consent: false }),
        consent("prin-alice", { recordedAt: now + 500 }),
      ],
      maxConsentAgeMs: 60_000,
      now,
    });
    assert.equal(r.applied, false);
    assert.deepEqual(r.consentsConsidered, []);
    assert.ok(r.notes.some((n) => n.includes("stale")));
    assert.ok(r.notes.some((n) => n.includes("refusal")));
    assert.ok(r.notes.some((n) => n.includes("future-dated")));
  });

  it("revoked or expired mandates cannot be amended", () => {
    const revoked = amendMandate({
      mandate: { ...baseMandate, revoked: true },
      amendment: { permissions: ["offer:read"], reason: "narrow" },
      amendmentId: "mand-1-v2",
      activeMembers: ["prin-alice"],
      consents: [consent("prin-alice")],
      maxConsentAgeMs: 60_000,
      now,
    });
    assert.equal(revoked.applied, false);
    assert.match(revoked.reason ?? "", /revoked/);

    const expired = amendMandate({
      mandate: { ...baseMandate, expiresAt: now - 1 },
      amendment: { permissions: ["offer:read"], reason: "narrow" },
      amendmentId: "mand-1-v2",
      activeMembers: ["prin-alice"],
      consents: [consent("prin-alice")],
      maxConsentAgeMs: 60_000,
      now,
    });
    assert.equal(expired.applied, false);
    assert.match(expired.reason ?? "", /expired/);
  });

  it("widening with no active members recorded fails closed", () => {
    const r = amendMandate({
      mandate: baseMandate,
      amendment: { scope: "group", reason: "widen" },
      amendmentId: "mand-1-v2",
      activeMembers: [],
      consents: [consent("prin-alice")],
      maxConsentAgeMs: 60_000,
      now,
    });
    assert.equal(r.applied, false);
    assert.match(r.reason ?? "", /no active members were recorded/);
  });
});

const membership = (
  principal: string,
  overrides: Partial<OrganizationMembership> = {},
): OrganizationMembership => ({
  id: `mem-${principal}`,
  organization: "org-1",
  principal,
  state: "MEMBER",
  role: "member",
  joinedAt: now - 5000,
  revoked: false,
  ...overrides,
});

const commitment = (
  id: string,
  participant: string,
  overrides: Partial<GroupPurchaseCommitment> = {},
): GroupPurchaseCommitment => ({
  id,
  request: "gpr-1",
  offer: "gpo-1",
  participant,
  allocation: { lines: 1 },
  acceptedAt: now - 1000,
  revoked: false,
  ...overrides,
});

describe("dissolveOrganization (dissolution/termination paths)", () => {
  const formed = foundOrganization(founding());

  it("closes memberships through the merged machine and dispositions every commitment", () => {
    const r = dissolveOrganization({
      organization: "org-1",
      formation: formed,
      memberships: [
        membership("prin-alice"),
        membership("prin-bob"),
        membership("prin-carol", { state: "SUSPENDED" }),
      ],
      commitments: [
        commitment("gpc-1", "prin-alice"),
        commitment("gpc-2", "prin-bob", { expiresAt: now - 1 }),
        commitment("gpc-3", "prin-carol", { revoked: true }),
        commitment("gpc-4", "prin-foreign"),
      ],
      consents: [consent("prin-alice"), consent("prin-bob"), consent("prin-carol")],
      maxConsentAgeMs: 60_000,
      now,
    });
    assert.equal(r.applied, true);
    assert.equal(r.state, "DISSOLVED");
    // Suspended members do not vote, but their memberships still close.
    assert.ok(r.notes.some((n) => n.includes("suspended members")));
    for (const m of r.memberships) {
      assert.equal(m.state, "REVOKED");
      assert.equal(m.revoked, true);
      assert.equal(m.revocationReason, "organization dissolved");
    }
    // Every commitment got an explicit disposition; none was transferred.
    assert.deepEqual(
      r.commitmentDispositions.map((d) => [d.commitment, d.disposition]),
      [
        ["gpc-1", "MARKED_UNUSABLE"],
        ["gpc-2", "EXPIRED"],
        ["gpc-3", "ALREADY_CLOSED"],
        ["gpc-4", "OUT_OF_AUTHORITY"],
      ],
    );
    assert.ok(
      r.commitmentDispositions
        .find((d) => d.commitment === "gpc-1")
        ?.reason.includes("never transferred"),
    );
    assert.ok(
      r.commitmentDispositions
        .find((d) => d.commitment === "gpc-4")
        ?.reason.includes("not wound down by this organization"),
    );
  });

  it("dissolution requires unanimous active-member consent (fail-closed)", () => {
    const r = dissolveOrganization({
      organization: "org-1",
      formation: formed,
      memberships: [membership("prin-alice"), membership("prin-bob")],
      commitments: [],
      consents: [consent("prin-alice")],
      maxConsentAgeMs: 60_000,
      now,
    });
    assert.equal(r.applied, false);
    assert.equal(r.state, "FORMED");
    assert.match(r.reason ?? "", /missing: prin-bob/);
    assert.deepEqual(r.commitmentDispositions, []);
  });

  it("an already-dissolved organization is terminal", () => {
    const dissolvedOnce = dissolveOrganization({
      organization: "org-1",
      formation: formed,
      memberships: [membership("prin-alice")],
      commitments: [],
      consents: [consent("prin-alice")],
      maxConsentAgeMs: 60_000,
      now,
    });
    const r = dissolveOrganization({
      organization: "org-1",
      formation: { ...formed, state: "DISSOLVED" },
      memberships: dissolvedOnce.memberships,
      commitments: [],
      consents: [consent("prin-alice")],
      maxConsentAgeMs: 60_000,
      now,
    });
    assert.equal(r.applied, false);
    assert.match(r.reason ?? "", /already dissolved/);
  });

  it("unformed organizations cannot dissolve", () => {
    const failed = foundOrganization(founding({ pursuitVerdict: "REJECT" }));
    const r = dissolveOrganization({
      organization: "org-1",
      formation: failed,
      memberships: [membership("prin-alice")],
      commitments: [],
      consents: [consent("prin-alice")],
      maxConsentAgeMs: 60_000,
      now,
    });
    assert.equal(r.applied, false);
    assert.match(r.reason ?? "", /only a formed organization can dissolve/);
  });

  it("memberships of other organizations are not touched (authority boundary)", () => {
    const r = dissolveOrganization({
      organization: "org-1",
      formation: formed,
      memberships: [membership("prin-alice"), membership("prin-zed", { organization: "org-2" })],
      commitments: [],
      consents: [consent("prin-alice")],
      maxConsentAgeMs: 60_000,
      now,
    });
    assert.equal(r.applied, true);
    assert.ok(r.notes.some((n) => n.includes("belongs to org-2 — not touched")));
  });

  it("post-dissolution memberships are terminal in the merged machine", () => {
    const r = dissolveOrganization({
      organization: "org-1",
      formation: formed,
      memberships: [membership("prin-alice")],
      commitments: [],
      consents: [consent("prin-alice")],
      maxConsentAgeMs: 60_000,
      now,
    });
    const closed = r.memberships[0];
    assert.ok(closed !== undefined);
    const after = advanceMembership(closed, "RESUME", now);
    assert.equal(after.applied, false);
    assert.match(after.reason ?? "", /revoked \(terminal state\)/);
  });
});
