/**
 * IdentityPanel — local demo identities + roles + durability of the
 * persisted state. NO auth theater: identities are honestly labeled as
 * local; role views are gated by the REAL service configuration.
 */
import { useAdcos } from "../state.tsx";
import { Card, Chip, EmptyState, Row } from "../ui.tsx";

export function IdentityPanel() {
  const { session, principals, run } = useAdcos();

  return (
    <>
      <Card title="Current identity">
        {session === null ? (
          <EmptyState>Loading session…</EmptyState>
        ) : (
          <>
            <Row label="Principal" value={<span className="adcos-mono">{session.principal}</span>} />
            <Row
              label="Roles"
              value={
                <span className="flex gap-1">
                  {session.roles.map((r) => (
                    <Chip key={r}>{r}</Chip>
                  ))}
                </span>
              }
            />
            <Row label="Product version" value={`ADCOS ${session.productVersion}`} />
          </>
        )}
      </Card>

      <Card title="Switch identity (local demo identities)">
        <p className="adcos-muted mb-3 text-xs">
          These are locally configured principals, not authenticated accounts. Tenant
          isolation is enforced by the domain service: each principal sees only its own
          rows. Operator/developer views are additionally role-gated.
        </p>
        {principals.length === 0 ? (
          <EmptyState>No identities configured.</EmptyState>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {principals.map((p) => (
              <li key={p.principal}>
                <button
                  type="button"
                  className="adcos-btn w-full text-left"
                  onClick={() => void run("switch identity", { method: "switchPrincipal", principal: p.principal })}
                >
                  <span className="adcos-mono block text-zinc-100">{p.principal}</span>
                  <span className="adcos-muted block text-[11px]">{p.note}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Persisted state (durable JSONL store)">
        {session === null ? (
          <EmptyState>Loading durability…</EmptyState>
        ) : (
          <>
            <Row label="Restored snapshots" value={session.persistence.snapshots} />
            <Row
              label="Torn tail lines (reported, not trusted)"
              value={session.persistence.tornLines}
            />
            <p className="adcos-muted mt-2 text-[11px]">
              Commands append durably before they are acknowledged (write-before-ack);
              restarts fold the log back into state.
            </p>
          </>
        )}
      </Card>
    </>
  );
}
