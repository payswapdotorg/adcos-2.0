/**
 * App.tsx — the ADCOS product shell: identity header, panel navigation,
 * and the honest runtime-required notice when the desktop bridge is
 * absent. Panels render REAL persisted state through the bridge only.
 */
import { useState } from "react";
import { AdcosProvider, useAdcos } from "./state.tsx";
import { AboutPanel } from "./panels/AboutPanel.tsx";
import { IdentityPanel } from "./panels/IdentityPanel.tsx";
import { LabPanel } from "./panels/LabPanel.tsx";
import { OrganizationsPanel } from "./panels/OrganizationsPanel.tsx";
import { PurchasePanel } from "./panels/PurchasePanel.tsx";
import { ResourcesPanel } from "./panels/ResourcesPanel.tsx";
import { RoleViewsPanel } from "./panels/RoleViewsPanel.tsx";
import {
  ADCOS_PAYMENT_NOTICE,
  PRODUCT_NAME,
  PRODUCT_TAGLINE,
  PRODUCT_WEB_VERSION,
} from "../contract.js";
import { hasAdcosBridge } from "../bridge.js";

type PanelId =
  | "identity"
  | "resources"
  | "lab"
  | "organizations"
  | "purchase"
  | "roles"
  | "about";

const PANELS: { id: PanelId; label: string; hint: string }[] = [
  { id: "identity", label: "Identity", hint: "local demo identities · roles" },
  { id: "resources", label: "My resources", hint: "enrollment · consent · observation" },
  { id: "lab", label: "Reality Lab", hint: "evaluations · opportunities" },
  { id: "organizations", label: "Organizations", hint: "founding · membership · mandates" },
  { id: "purchase", label: "Group purchase", hint: "offers · commitments · order lifecycle" },
  { id: "roles", label: "Role views", hint: "operator aggregate · developer contracts" },
  { id: "about", label: "About", hint: "product identity · honest capabilities" },
];

function Shell() {
  const [panel, setPanel] = useState<PanelId>("identity");
  const { session, error, busy } = useAdcos();

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <nav aria-label="Product panels" className="flex w-60 shrink-0 flex-col border-r border-[var(--adcos-line)] bg-[var(--adcos-panel)]">
        <div className="border-b border-[var(--adcos-line)] px-5 py-5">
          <div className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-3 w-3 rounded-[4px] bg-emerald-500" />
            <span className="text-base font-semibold tracking-tight text-zinc-50">
              {PRODUCT_NAME}
            </span>
          </div>
          <p className="adcos-muted mt-0.5 text-xs">{PRODUCT_TAGLINE}</p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {PANELS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPanel(p.id)}
              aria-current={panel === p.id ? "page" : undefined}
              className={`mb-1 w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                panel === p.id
                  ? "border-emerald-800/60 bg-emerald-950/30"
                  : "border-transparent hover:border-zinc-800 hover:bg-zinc-900/60"
              }`}
            >
              <span className="block text-sm font-medium text-zinc-100">{p.label}</span>
              <span className="adcos-muted block text-[11px]">{p.hint}</span>
            </button>
          ))}
        </div>
        <div className="border-t border-[var(--adcos-line)] px-5 py-3">
          <p className="adcos-muted text-[11px]">
            v{PRODUCT_WEB_VERSION} ·{" "}
            {session ? `${session.principal} (${session.roles.join(", ")})` : "…"}
          </p>
          {busy && <p className="mt-1 text-[11px] text-emerald-400">working…</p>}
        </div>
      </nav>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-[var(--adcos-line)] px-6 py-3">
          <h1 className="text-sm font-semibold text-zinc-100">
            {PANELS.find((p) => p.id === panel)?.label}
          </h1>
          <span className="adcos-muted text-xs">
            {PANELS.find((p) => p.id === panel)?.hint}
          </span>
          <span className="ml-auto adcos-chip border-amber-700/60 bg-amber-950/40 text-[10px] text-amber-300" title={ADCOS_PAYMENT_NOTICE}>
            payments: opaque refs · BLOCKED-ON-OPERATOR (ADR-0004)
          </span>
        </header>

        {error !== null && (
          <div role="alert" className="border-b border-rose-900/60 bg-rose-950/40 px-6 py-2">
            <p className="text-xs text-rose-300">{error}</p>
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="mx-auto max-w-3xl space-y-4">
            {panel === "identity" && <IdentityPanel />}
            {panel === "resources" && <ResourcesPanel />}
            {panel === "lab" && <LabPanel />}
            {panel === "organizations" && <OrganizationsPanel />}
            {panel === "purchase" && <PurchasePanel />}
            {panel === "roles" && <RoleViewsPanel />}
            {panel === "about" && <AboutPanel />}
          </div>
        </main>
      </div>
    </div>
  );
}

/** Honest interstitial when opened outside the desktop runtime. */
function RuntimeRequired() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="adcos-card max-w-md p-6 text-center">
        <div className="mb-3 flex justify-center">
          <span aria-hidden className="inline-block h-4 w-4 rounded-[5px] bg-emerald-500" />
        </div>
        <h1 className="text-lg font-semibold text-zinc-50">
          {PRODUCT_NAME} — {PRODUCT_TAGLINE}
        </h1>
        <p className="adcos-muted mt-3 text-sm leading-relaxed">
          This is the ADCOS product surface. The domain service (the real SurfacesService
          over the durable JSONL store) runs in the ADCOS desktop application&apos;s main
          process — open it there.
        </p>
        <p className="adcos-muted mt-3 text-xs">{ADCOS_PAYMENT_NOTICE}</p>
      </div>
    </div>
  );
}

export function App() {
  if (!hasAdcosBridge()) {
    return <RuntimeRequired />;
  }
  return (
    <AdcosProvider>
      <Shell />
    </AdcosProvider>
  );
}
