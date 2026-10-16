/**
 * state.ts — the app-level store over the bridge. One provider supplies
 * the session, the customer view, the durability stats and a `run` helper
 * that executes bridge commands, surfaces transport errors and refreshes
 * the affected projections. All data comes from the REAL domain service
 * in the desktop main process; nothing is invented client-side.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { adcos } from "../bridge.js";
import type { AdcosPrincipal, AdcosSession } from "../contract.js";
import type { CustomerView } from "@adcos/surfaces";

export interface AdcosState {
  session: AdcosSession | null;
  principals: readonly AdcosPrincipal[];
  view: CustomerView | null;
  error: string | null;
  busy: boolean;
  refresh: () => Promise<void>;
  run: (label: string, request: Parameters<typeof adcos>[0]) => Promise<void>;
}

const Ctx = createContext<AdcosState | null>(null);

export function AdcosProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdcosSession | null>(null);
  const [principals, setPrincipals] = useState<readonly AdcosPrincipal[]>([]);
  const [view, setView] = useState<CustomerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [sessionOut, principalsOut, viewOut] = await Promise.all([
        adcos({ method: "session" }),
        adcos({ method: "listPrincipals" }),
        adcos({ method: "customerView" }),
      ]);
      if (!sessionOut.ok) throw new Error(sessionOut.error);
      if (!principalsOut.ok) throw new Error(principalsOut.error);
      if (!viewOut.ok) throw new Error(viewOut.error);
      setSession(sessionOut.data);
      setPrincipals(principalsOut.data.principals);
      setView(viewOut.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (label: string, request: Parameters<typeof adcos>[0]) => {
      setBusy(true);
      try {
        const outcome = await adcos(request);
        if (!outcome.ok) {
          setError(`${label}: ${outcome.error}`);
          return;
        }
        const data = outcome.data as { applied?: boolean; reason?: string };
        if (data.applied === false) {
          // An honest domain refusal (e.g. mandate missing, request expired)
          // is not a transport error — show the reason, keep state fresh.
          setError(`${label}: ${data.reason ?? "refused by the domain service"}`);
        } else {
          setError(null);
        }
        await refresh();
      } catch (e) {
        setError(`${label}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const value = useMemo(
    () => ({ session, principals, view, error, busy, refresh, run }),
    [session, principals, view, error, busy, refresh, run],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdcos(): AdcosState {
  const ctx = useContext(Ctx);
  if (ctx === null) {
    throw new Error("useAdcos requires <AdcosProvider>");
  }
  return ctx;
}
