/**
 * LabPanel — run a Reality Lab evaluation (baseline vs alternatives),
 * then read the persisted advisory opportunities. The Lab proposes and
 * never acts (INVARIANTS #21); INSUFFICIENT_EVIDENCE/REJECT surface
 * honestly with the policy's reasons.
 */
import { useState } from "react";
import { useAdcos } from "../state.tsx";
import { Card, Chip, EmptyState, Field, Row } from "../ui.tsx";

function EvaluationForm() {
  const { run } = useAdcos();
  const [id, setId] = useState("");
  const [intent, setIntent] = useState("connectivity.cost.reduction");
  const [baselineCost, setBaselineCost] = useState("120");
  const [altStrategy, setAltStrategy] = useState("pooled-provider-plan");
  const [altCost, setAltCost] = useState("80");
  const [altReliability, setAltReliability] = useState("0.92");
  const [confidence, setConfidence] = useState("0.7");
  const [assumptions, setAssumptions] = useState("measured window only");

  return (
    <Card title="Run a Lab evaluation">
      <p className="adcos-muted mb-3 text-xs">
        Deterministic baseline vs alternative comparison. Confidence below the policy
        floor yields INSUFFICIENT_EVIDENCE — shown as-is, never padded.
      </p>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run("Lab evaluation", {
            method: "runLabEvaluation",
            input: {
              id: id.trim(),
              intent: intent.trim(),
              baseline: {
                strategy: "baseline-status-quo",
                cost: Number(baselineCost) || 0,
                reliability: 0.9,
              },
              alternatives: [
                {
                  strategy: altStrategy.trim(),
                  cost: Number(altCost) || 0,
                  reliability: Number(altReliability) || 0,
                },
              ],
              selectedStrategy: altStrategy.trim(),
              confidence: Number(confidence) || 0,
              assumptions: assumptions.split(";").map((a) => a.trim()).filter(Boolean),
            },
          });
        }}
      >
        <Field label="Evaluation id">
          <input className="adcos-input" value={id} onChange={(e) => setId(e.target.value)} required placeholder="eval-1" />
        </Field>
        <Field label="Intent">
          <input className="adcos-input" value={intent} onChange={(e) => setIntent(e.target.value)} required />
        </Field>
        <Field label="Baseline cost">
          <input className="adcos-input" type="number" value={baselineCost} onChange={(e) => setBaselineCost(e.target.value)} />
        </Field>
        <Field label="Alternative strategy">
          <input className="adcos-input" value={altStrategy} onChange={(e) => setAltStrategy(e.target.value)} required />
        </Field>
        <Field label="Alternative cost">
          <input className="adcos-input" type="number" value={altCost} onChange={(e) => setAltCost(e.target.value)} />
        </Field>
        <Field label="Alternative reliability (0-1)">
          <input className="adcos-input" type="number" step="0.01" min="0" max="1" value={altReliability} onChange={(e) => setAltReliability(e.target.value)} />
        </Field>
        <Field label="Confidence (0-1)">
          <input className="adcos-input" type="number" step="0.01" min="0" max="1" value={confidence} onChange={(e) => setConfidence(e.target.value)} />
        </Field>
        <Field label="Assumptions (semicolon separated)">
          <input className="adcos-input" value={assumptions} onChange={(e) => setAssumptions(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <button className="adcos-btn-primary" type="submit">Run evaluation</button>
        </div>
      </form>
    </Card>
  );
}

export function LabPanel() {
  const { view } = useAdcos();
  const opportunities = view?.opportunities ?? [];

  return (
    <>
      <EvaluationForm />
      <Card title={`Advisory opportunities (${opportunities.length})`}>
        {opportunities.length === 0 ? (
          <EmptyState>No persisted opportunities yet.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {opportunities.map((o) => (
              <li key={o.id} className="rounded-lg border border-zinc-800/80 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="adcos-mono text-zinc-100">{o.id}</span>
                  <Chip>{Math.round(o.confidence * 100)}% confidence</Chip>
                </div>
                <Row label="Intent" value={o.id} />
                <Row label="Recommendation" value={o.recommendation ?? "—"} />
                <Row label="Confidence" value={o.confidence.toFixed(2)} />
                <p className="adcos-muted mt-2 text-[11px]">
                  Advisory only — the Lab proposes; Organizations and purchases act through
                  their own consent and authorization gates.
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
