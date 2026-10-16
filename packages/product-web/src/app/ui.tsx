/**
 * ui.tsx — small shared presentational primitives for the ADCOS product
 * panels. Semantic chip colors are fixed so explicit states (INVARIANTS #5)
 * are always visually distinct — never masked as success.
 */
import type { ReactNode } from "react";

export function Card({
  title,
  children,
  aside,
}: {
  title?: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="adcos-card p-4">
      {(title !== undefined || aside !== undefined) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

const CHIP_TONES: Record<string, string> = {
  // healthy / constructive
  SHARED: "border-emerald-700/60 text-emerald-300 bg-emerald-950/40",
  OPT_IN: "border-emerald-700/60 text-emerald-300 bg-emerald-950/40",
  OPEN: "border-emerald-700/60 text-emerald-300 bg-emerald-950/40",
  ACTIVE: "border-emerald-700/60 text-emerald-300 bg-emerald-950/40",
  AUTHORIZED: "border-emerald-700/60 text-emerald-300 bg-emerald-950/40",
  ORDERED: "border-emerald-700/60 text-emerald-300 bg-emerald-950/40",
  CONTRACTED: "border-emerald-700/60 text-emerald-300 bg-emerald-950/40",
  FULFILLED: "border-emerald-700/60 text-emerald-300 bg-emerald-950/40",
  RECONCILED: "border-emerald-700/60 text-emerald-300 bg-emerald-950/40",
  THRESHOLD_MET: "border-emerald-700/60 text-emerald-300 bg-emerald-950/40",
  // paused / transitional
  PAUSED: "border-amber-600/60 text-amber-300 bg-amber-950/40",
  NOT_SHARED: "border-zinc-600 text-zinc-300 bg-zinc-900/60",
  PENDING: "border-amber-600/60 text-amber-300 bg-amber-950/40",
  INVITED: "border-amber-600/60 text-amber-300 bg-amber-950/40",
  COMMITMENT_OPEN: "border-amber-600/60 text-amber-300 bg-amber-950/40",
  OFFER_RECEIVED: "border-amber-600/60 text-amber-300 bg-amber-950/40",
  // unknown/stale — always visible as themselves
  UNKNOWN: "border-fuchsia-700/60 text-fuchsia-300 bg-fuchsia-950/40",
  STALE: "border-fuchsia-700/60 text-fuchsia-300 bg-fuchsia-950/40",
  DEGRADED: "border-orange-600/60 text-orange-300 bg-orange-950/40",
  // terminal / failure
  REVOKED: "border-rose-700/60 text-rose-300 bg-rose-950/40",
  EXPIRED: "border-rose-700/60 text-rose-300 bg-rose-950/40",
  FAILED: "border-rose-700/60 text-rose-300 bg-rose-950/40",
  REJECTED: "border-rose-700/60 text-rose-300 bg-rose-950/40",
  TERMINATED: "border-rose-700/60 text-rose-300 bg-rose-950/40",
  DISPUTED: "border-rose-700/60 text-rose-300 bg-rose-950/40",
  CANCELLED: "border-rose-700/60 text-rose-300 bg-rose-950/40",
  WITHDRAWN: "border-rose-700/60 text-rose-300 bg-rose-950/40",
};

export function Chip({ state, children }: { state?: string; children?: ReactNode }) {
  const key = state ?? "";
  const tone = CHIP_TONES[key] ?? "border-zinc-600 text-zinc-300 bg-zinc-900/60";
  return <span className={`adcos-chip ${tone}`}>{children ?? state ?? "—"}</span>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="adcos-label mb-1 block">{label}</span>
      {children}
    </label>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="adcos-muted rounded-lg border border-dashed border-zinc-800 px-4 py-6 text-center text-sm">
      {children}
    </p>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn"; children: ReactNode }) {
  const cls =
    tone === "warn"
      ? "border-amber-700/50 bg-amber-950/30 text-amber-200"
      : "border-zinc-700/60 bg-zinc-900/40 text-zinc-300";
  return (
    <p className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${cls}`}>{children}</p>
  );
}

export function AppliedTag({ applied, reason }: { applied: boolean; reason?: string }) {
  return applied ? (
    <Chip state="SHARED">applied</Chip>
  ) : (
    <span title={reason ?? ""} className="adcos-chip border-rose-700/60 bg-rose-950/40 text-rose-300">
      refused
    </span>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-zinc-800/60 py-1.5 last:border-0">
      <span className="adcos-muted text-xs">{label}</span>
      <span className="text-right text-xs text-zinc-200">{value}</span>
    </div>
  );
}
