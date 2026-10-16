/**
 * RoleViewsPanel — the operator cross-tenant aggregate and the developer
 * contract surface, both REAL role-gated service views. A non-operator
 * principal receives the service's refusal and it is displayed as-is.
 */
import { useEffect, useState } from "react";
import { adcos } from "../../bridge.js";
import { Card, Chip, EmptyState, Row } from "../ui.tsx";
import type { DeveloperView, OperatorView } from "@adcos/surfaces";

function OperatorCard() {
  const [state, setState] = useState<
    { ok: true; view: OperatorView } | { ok: false; reason: string } | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    void adcos({ method: "operatorView" }).then((outcome) => {
      if (cancelled) return;
      if (!outcome.ok) {
        setState({ ok: false, reason: outcome.error });
        return;
      }
      const { applied, reason, view } = outcome.data;
      if (!applied || view === undefined) {
        setState({ ok: false, reason: reason ?? "role refused" });
        return;
      }
      setState({ ok: true, view });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === null) return <Card title="Operator view"><EmptyState>Loading…</EmptyState></Card>;
  if (!state.ok) {
    return (
      <Card title="Operator view">
        <EmptyState>
          Refused by the domain service — <span className="adcos-mono">{state.reason}</span>.
          Switch to an operator principal in Identity to read this view.
        </EmptyState>
      </Card>
    );
  }
  const v = state.view;
  return (
    <Card title={`Operator view — ${v.principal}`}>
      <p className="adcos-label mb-2">Fleet</p>
      <Row label="Total resources" value={v.fleet.total} />
      <Row label="Revoked" value={v.fleet.revoked} />
      <div className="mb-3 mt-1 flex flex-wrap gap-1.5">
        {Object.entries(v.fleet.byStatus).map(([status, count]) => (
          <Chip key={status} state={status}>
            {status}: {count}
          </Chip>
        ))}
      </div>
      <p className="adcos-label mb-2">Organizations ({v.organizations.length})</p>
      {v.organizations.length === 0 ? (
        <EmptyState>No organizations.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {v.organizations.map((o) => (
            <li key={o.organization} className="rounded-lg border border-zinc-800/80 p-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="adcos-mono text-zinc-100">{o.organization}</span>
                <span className="adcos-muted text-[11px]">{o.totalMemberships} memberships</span>
              </div>
              {o.requests.map((r) => (
                <Row
                  key={r.requestId}
                  label={`${r.requestId} · ${r.committedParticipants}/${r.threshold}`}
                  value={
                    <span className="flex gap-1">
                      <Chip state={r.evaluation} />
                      {r.orderState !== undefined && <Chip state={r.orderState} />}
                    </span>
                  }
                />
              ))}
            </li>
          ))}
        </ul>
      )}
      <p className="adcos-label mb-1 mt-3">Authority boundaries</p>
      <p className="adcos-muted text-[11px] leading-relaxed">{v.authorityBoundaries.join(" · ")}</p>
    </Card>
  );
}

function DeveloperCard() {
  const [state, setState] = useState<
    { ok: true; view: DeveloperView } | { ok: false; reason: string } | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    void adcos({ method: "developerView" }).then((outcome) => {
      if (cancelled) return;
      if (!outcome.ok) {
        setState({ ok: false, reason: outcome.error });
        return;
      }
      const { applied, reason, view } = outcome.data;
      if (!applied || view === undefined) {
        setState({ ok: false, reason: reason ?? "role refused" });
        return;
      }
      setState({ ok: true, view });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === null) return <Card title="Developer view"><EmptyState>Loading…</EmptyState></Card>;
  if (!state.ok) {
    return (
      <Card title="Developer view">
        <EmptyState>
          Refused by the domain service — <span className="adcos-mono">{state.reason}</span>.
        </EmptyState>
      </Card>
    );
  }
  const v = state.view;
  return (
    <Card title={`Developer view — ${v.principal}`}>
      <p className="adcos-label mb-2">Contract families</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {v.contractFamilies.map((c) => (
          <Chip key={c.schema}>{c.schema}</Chip>
        ))}
      </div>
      <p className="adcos-label mb-2">Version compatibility</p>
      {v.versionCompatibility.map((vc) => (
        <Row key={vc.version} label={vc.version} value={vc.compatibleWith.join(", ") || "—"} />
      ))}
      <p className="adcos-label mb-2 mt-3">Composed surfaces</p>
      {v.composedSurfaces.map((s) => (
        <Row key={s.package} label={s.package} value={s.exports.join(", ") || "—"} />
      ))}
      <p className="adcos-label mb-2 mt-3">Boundaries</p>
      <p className="adcos-muted text-[11px] leading-relaxed">{v.boundaries.join(" · ")}</p>
    </Card>
  );
}

export function RoleViewsPanel() {
  return (
    <>
      <OperatorCard />
      <DeveloperCard />
    </>
  );
}
