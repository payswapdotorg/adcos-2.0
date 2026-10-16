/**
 * OrganizationsPanel — memberships, founding from persisted Lab pursuit
 * evidence (founder consent required — false until explicitly given),
 * membership events and invites. Mandates authorize group commitments;
 * missing mandates fail closed and the reason is shown.
 */
import { useState } from "react";
import { useAdcos } from "../state.tsx";
import { Card, Chip, EmptyState, Field, Notice } from "../ui.tsx";

function FormationForm() {
  const { run, session } = useAdcos();
  const [organization, setOrganization] = useState("");
  const [pursuitEvidenceId, setPursuitEvidenceId] = useState("");
  const [founders, setFounders] = useState("");
  const [authorityScope, setAuthorityScope] = useState("group.purchase");
  const [minFounders, setMinFounders] = useState("1");
  const [mandateScope, setMandateScope] = useState("group.purchase");

  return (
    <Card title="Found an organization (from Lab pursuit evidence)">
      <p className="adcos-muted mb-3 text-xs">
        Founding derives from a persisted Lab opportunity (PURSUE verdict) with explicit
        founder consent — consent is false until recorded. Initial mandates stay within
        the organization authority scope.
      </p>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const me = session?.principal ?? "";
          const founderList = founders
            .split(",")
            .map((f) => f.trim())
            .filter(Boolean);
          const candidates = (founderList.length > 0 ? founderList : [me]).map((principal) => ({
            principal,
            consent: principal === me,
            consentRecordedAt: principal === me ? Date.now() : undefined,
          }));
          void run("form organization", {
            method: "formOrganization",
            input: {
              organization: organization.trim(),
              pursuitEvidenceId: pursuitEvidenceId.trim(),
              candidates,
              minFounders: Number(minFounders) || 1,
              authorityScope: authorityScope.trim(),
              initialMandates: [
                {
                  principal: me,
                  scope: mandateScope.trim(),
                  permissions: ["commit", "withdraw"],
                },
              ],
            },
          });
        }}
      >
        <Field label="Organization id">
          <input className="adcos-input" value={organization} onChange={(e) => setOrganization(e.target.value)} required placeholder="org-1" />
        </Field>
        <Field label="Pursuit evidence id (Lab opportunity: `<eval-id>-opportunity`)">
          <input className="adcos-input" value={pursuitEvidenceId} onChange={(e) => setPursuitEvidenceId(e.target.value)} required placeholder="eval-1-opportunity" />
        </Field>
        <Field label="Founders (comma separated; you consent as founder)">
          <input className="adcos-input" value={founders} onChange={(e) => setFounders(e.target.value)} placeholder="ada@local" />
        </Field>
        <Field label="Minimum founders">
          <input className="adcos-input" type="number" min={1} value={minFounders} onChange={(e) => setMinFounders(e.target.value)} />
        </Field>
        <Field label="Authority scope">
          <input className="adcos-input" value={authorityScope} onChange={(e) => setAuthorityScope(e.target.value)} />
        </Field>
        <Field label="Initial mandate scope (for you)">
          <input className="adcos-input" value={mandateScope} onChange={(e) => setMandateScope(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <button className="adcos-btn-primary" type="submit">Found organization</button>
        </div>
      </form>
    </Card>
  );
}

function MembershipForms() {
  const { run } = useAdcos();
  const [org, setOrg] = useState("");
  const [invitePrincipal, setInvitePrincipal] = useState("");
  const [memberPrincipal, setMemberPrincipal] = useState("");
  const [memberOrg, setMemberOrg] = useState("");

  return (
    <Card title="Membership events">
      <div className="grid gap-4 sm:grid-cols-2">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run("invite member", {
              method: "inviteMember",
              input: { organization: org.trim(), principal: invitePrincipal.trim() },
            });
          }}
        >
          <Field label="Organization">
            <input className="adcos-input" value={org} onChange={(e) => setOrg(e.target.value)} required placeholder="org-1" />
          </Field>
          <Field label="Invite principal">
            <input className="adcos-input" value={invitePrincipal} onChange={(e) => setInvitePrincipal(e.target.value)} required placeholder="grace@local" />
          </Field>
          <button className="adcos-btn" type="submit">Invite</button>
        </form>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run("membership event", {
              method: "applyMembershipEvent",
              input: {
                organization: memberOrg.trim(),
                principal: memberPrincipal.trim(),
                event: "ACCEPT_INVITE",
              },
            });
          }}
        >
          <Field label="Organization">
            <input className="adcos-input" value={memberOrg} onChange={(e) => setMemberOrg(e.target.value)} required placeholder="org-1" />
          </Field>
          <Field label="Member principal">
            <input className="adcos-input" value={memberPrincipal} onChange={(e) => setMemberPrincipal(e.target.value)} required placeholder="grace@local" />
          </Field>
          <button className="adcos-btn" type="submit">Accept invite (ACCEPT_INVITE)</button>
        </form>
      </div>
      <p className="adcos-muted mt-3 text-[11px]">
        Lifecycle events follow the membership machine (INVITED → ACTIVE → … → REVOKED
        terminal); REVOKED is terminal and expiry fails closed.
      </p>
    </Card>
  );
}

export function OrganizationsPanel() {
  const { view } = useAdcos();
  const memberships = view?.organizations ?? [];

  return (
    <>
      <Notice>
        Organization actions run through the REAL organizations domain: founding
        requires Lab pursuit evidence and founder consent; membership management
        requires a mandate covering <span className="adcos-mono">group.membership</span>.
      </Notice>
      <FormationForm />
      <MembershipForms />
      <Card title={`My memberships (${memberships.length})`}>
        {memberships.length === 0 ? (
          <EmptyState>No memberships yet.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {memberships.map((m) => (
              <li key={`${m.organization}:${m.role}`} className="flex items-center gap-2 rounded-lg border border-zinc-800/80 px-3 py-2">
                <span className="adcos-mono text-zinc-100">{m.organization}</span>
                <Chip state={m.state} />
                <span className="adcos-muted text-[11px]">{m.role}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
