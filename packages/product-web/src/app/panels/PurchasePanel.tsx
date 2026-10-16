/**
 * PurchasePanel — group purchases: open a request, receive a provider
 * offer, commit/withdraw, and advance the order lifecycle. Money is an
 * opaque typed reference (ADR-0004): the stepper attaches reference
 * evidence at PLACE_ORDER and NEVER claims live settlement.
 */
import { useState } from "react";
import { useAdcos } from "../state.tsx";
import { Card, Chip, EmptyState, Field, Notice, Row } from "../ui.tsx";
import { ADCOS_PAYMENT_NOTICE } from "../../contract.js";
import type { GroupPurchaseCard } from "@adcos/surfaces";

function OpenForm() {
  const { run } = useAdcos();
  const [id, setId] = useState("");
  const [intent, setIntent] = useState("connectivity.group-plan");
  const [organization, setOrganization] = useState("");
  const [threshold, setThreshold] = useState("2");
  const [expiryMinutes, setExpiryMinutes] = useState("60");

  return (
    <Card title="Open a group purchase request">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run("open group purchase", {
            method: "openGroupPurchase",
            input: {
              id: id.trim(),
              intent: intent.trim(),
              organization: organization.trim(),
              requirements: { quantity: 1 },
              threshold: Number(threshold) || 1,
              expiresAt: Date.now() + (Number(expiryMinutes) || 60) * 60_000,
            },
          });
        }}
      >
        <Field label="Request id">
          <input className="adcos-input" value={id} onChange={(e) => setId(e.target.value)} required placeholder="req-1" />
        </Field>
        <Field label="Intent">
          <input className="adcos-input" value={intent} onChange={(e) => setIntent(e.target.value)} required />
        </Field>
        <Field label="Organization">
          <input className="adcos-input" value={organization} onChange={(e) => setOrganization(e.target.value)} required placeholder="org-1" />
        </Field>
        <Field label="Threshold (participants)">
          <input className="adcos-input" type="number" min={1} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </Field>
        <Field label="Expires in (minutes)">
          <input className="adcos-input" type="number" min={1} value={expiryMinutes} onChange={(e) => setExpiryMinutes(e.target.value)} />
        </Field>
        <div className="flex items-end sm:col-span-2">
          <button className="adcos-btn-primary" type="submit">Open request</button>
        </div>
      </form>
    </Card>
  );
}

function OfferForm({ requests }: { requests: readonly GroupPurchaseCard[] }) {
  const { run } = useAdcos();
  const [request, setRequest] = useState("");
  const [supplier, setSupplier] = useState("provider-a");
  const [perMemberCost, setPerMemberCost] = useState("40");
  const [totalCost, setTotalCost] = useState("80");

  return (
    <Card title="Receive a provider offer">
      <p className="adcos-muted mb-3 text-xs">
        Offers are recorded evidence from a supplier&apos;s public terms (no live
        provider integration — provider proof is P4-W2 / BLOCKED-ON-OPERATOR).
      </p>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const target = request || requests[0]?.requestId;
          if (target === undefined) return;
          const per = Number(perMemberCost) || 0;
          const total = Number(totalCost) || 0;
          void run("receive offer", {
            method: "receiveOffer",
            offer: {
              id: `offer-${target}-${Date.now()}`,
              request: target,
              supplier: supplier.trim(),
              product: "group-connectivity-plan",
              capability: "tether/4g",
              region: "accra",
              quantity: 1,
              perMemberCost: per,
              totalCost: total,
              recurringCharges: [{ amount: per, frequency: "monthly", description: "pooled plan" }],
              oneTimeCharges: [{ amount: Math.max(total - per, 0), description: "setup" }],
              term: "12 months",
              limitations: ["fair-use"],
              expiry: Date.now() + 86_400_000,
              provenance: "manual-entry:supplier-terms",
            },
          });
        }}
      >
        <Field label="Request">
          <select className="adcos-input" value={request} onChange={(e) => setRequest(e.target.value)}>
            {requests.map((r) => (
              <option key={r.requestId} value={r.requestId}>{r.requestId}</option>
            ))}
          </select>
        </Field>
        <Field label="Supplier">
          <input className="adcos-input" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </Field>
        <Field label="Per-member cost">
          <input className="adcos-input" type="number" value={perMemberCost} onChange={(e) => setPerMemberCost(e.target.value)} />
        </Field>
        <Field label="Total cost">
          <input className="adcos-input" type="number" value={totalCost} onChange={(e) => setTotalCost(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <button className="adcos-btn" type="submit" disabled={requests.length === 0}>Record offer</button>
        </div>
      </form>
    </Card>
  );
}

const ORDER_EVENTS = [
  "AUTHORIZE",
  "PLACE_ORDER",
  "CONFIRM_CONTRACT",
  "MARK_FULFILLED",
  "RECONCILE",
  "OPEN_DISPUTE",
] as const;

function PurchaseItem({ purchase }: { purchase: GroupPurchaseCard }) {
  const { run } = useAdcos();
  const [allocation, setAllocation] = useState("1");
  const progress = Math.min(purchase.committedParticipants, purchase.threshold);

  return (
    <li className="rounded-lg border border-zinc-800/80 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="adcos-mono text-zinc-100">{purchase.requestId}</span>
        <Chip state={purchase.state} />
        {purchase.orderState !== undefined && <Chip state={purchase.orderState} />}
        <span className="adcos-muted text-[11px]">{purchase.organization ?? "—"}</span>
      </div>

      {/* Threshold progress */}
      <div className="mb-2">
        <div className="mb-1 flex justify-between text-[11px]">
          <span className="adcos-muted">Threshold progress</span>
          <span className="text-zinc-300">{purchase.committedParticipants}/{purchase.threshold} committed</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${purchase.threshold === 0 ? 0 : (progress / purchase.threshold) * 100}%` }}
          />
        </div>
      </div>

      <Row label="My commitment" value={purchase.myCommitmentId ?? "—"} />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run("commit", {
              method: "commitToPurchase",
              input: { requestId: purchase.requestId, allocation: { share: Number(allocation) || 1 } },
            });
          }}
        >
          <input
            aria-label="Allocation share"
            className="adcos-input w-20 px-2 py-1 text-xs"
            type="number"
            min={1}
            value={allocation}
            onChange={(e) => setAllocation(e.target.value)}
          />
          <button className="adcos-btn px-3 py-1.5 text-xs" type="submit">Commit</button>
        </form>
        {purchase.myCommitmentId !== undefined && (
          <button
            type="button"
            className="adcos-btn px-3 py-1.5 text-xs"
            onClick={() =>
              void run("withdraw commitment", {
                method: "withdrawCommitment",
                commitmentId: purchase.myCommitmentId ?? "",
              })
            }
          >
            Withdraw
          </button>
        )}
      </div>

      {/* Order lifecycle stepper */}
      {purchase.orderState !== undefined && (
        <div className="mt-3 border-t border-zinc-800/60 pt-3">
          <p className="adcos-label mb-2">Order lifecycle</p>
          <div className="flex flex-wrap gap-1.5">
            {ORDER_EVENTS.map((event) => (
              <button
                key={event}
                type="button"
                className="adcos-btn px-2.5 py-1 text-[11px]"
                onClick={() =>
                  void run(event, {
                    method: "advancePurchaseOrder",
                    input: {
                      requestId: purchase.requestId,
                      event,
                      // PLACE_ORDER attaches opaque reference evidence (ADR-0004).
                      paymentReference:
                        event === "PLACE_ORDER"
                          ? {
                              id: `payref-${purchase.requestId}`,
                              type: "opaque",
                              authority: "authorized-financial-authority (role, unselected rail)",
                              created: Date.now(),
                              settled: false,
                            }
                          : undefined,
                      usageEvidenceComplete: event === "RECONCILE" ? true : undefined,
                    },
                  })
                }
              >
                {event}
              </button>
            ))}
          </div>
          <p className="adcos-muted mt-2 text-[10px] leading-relaxed">{ADCOS_PAYMENT_NOTICE}</p>
        </div>
      )}
    </li>
  );
}

export function PurchasePanel() {
  const { view } = useAdcos();
  const purchases = view?.groupPurchases ?? [];

  return (
    <>
      <Notice tone="warn">{ADCOS_PAYMENT_NOTICE}</Notice>
      <OpenForm />
      {purchases.length > 0 && <OfferForm requests={purchases} />}
      <Card title={`Group purchases (${purchases.length})`}>
        {purchases.length === 0 ? (
          <EmptyState>No requests yet — open one above.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {purchases.map((p) => (
              <PurchaseItem key={p.requestId} purchase={p} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
