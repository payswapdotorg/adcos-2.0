/**
 * ResourcesPanel — enrollment, the consent machine (OPT_IN/OPT_OUT/PAUSE/
 * RESUME; NOT_SHARED requires a fresh OPT_IN), observation input and the
 * share-state doctrine (REVOKED > PAUSED > SHARED) with the raw status
 * surfaced as-is.
 */
import { useState } from "react";
import { useAdcos } from "../state.tsx";
import { Card, Chip, EmptyState, Field, Row } from "../ui.tsx";
import type { ResourceCard } from "@adcos/surfaces";

const STATUS_VALUES = ["UNKNOWN", "STALE", "DEGRADED", "FAILED", "REJECTED", "TERMINATED"] as const;

function EnrollForm() {
  const { run } = useAdcos();
  const [id, setId] = useState("");
  const [device, setDevice] = useState("");
  const [type, setType] = useState("phone");
  const [capability, setCapability] = useState("");
  const [modes, setModes] = useState("hotspot");
  const [limit, setLimit] = useState("10");

  return (
    <Card title="Enroll a resource">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run("enroll resource", {
            method: "enrollResource",
            input: {
              id: id.trim(),
              device: device.trim(),
              type: type.trim(),
              capability: capability.trim(),
              modes: modes.split(",").map((m) => m.trim()).filter(Boolean),
              limits: { concurrent: Number(limit) || 0 },
            },
          });
        }}
      >
        <Field label="Resource id">
          <input className="adcos-input" value={id} onChange={(e) => setId(e.target.value)} required placeholder="res-ada-1" />
        </Field>
        <Field label="Device">
          <input className="adcos-input" value={device} onChange={(e) => setDevice(e.target.value)} required placeholder="device-1" />
        </Field>
        <Field label="Type">
          <input className="adcos-input" value={type} onChange={(e) => setType(e.target.value)} required />
        </Field>
        <Field label="Capability">
          <input className="adcos-input" value={capability} onChange={(e) => setCapability(e.target.value)} required placeholder="tether/4g" />
        </Field>
        <Field label="Modes (comma separated)">
          <input className="adcos-input" value={modes} onChange={(e) => setModes(e.target.value)} />
        </Field>
        <Field label="Concurrent limit">
          <input className="adcos-input" type="number" min={0} value={limit} onChange={(e) => setLimit(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <button className="adcos-btn-primary" type="submit">Enroll</button>
        </div>
      </form>
    </Card>
  );
}

function ObserveForm({ resources }: { resources: readonly ResourceCard[] }) {
  const { run } = useAdcos();
  const [resourceId, setResourceId] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_VALUES)[number]>("UNKNOWN");
  const [freshness, setFreshness] = useState("");

  return (
    <Card title="Record a capability observation">
      <p className="adcos-muted mb-3 text-xs">
        Observed status beats declared capability (evidence doctrine). UNKNOWN/STALE/
        DEGRADED stay visible as themselves.
      </p>
      <form
        className="grid gap-3 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          const target = resourceId || resources[0]?.resourceId;
          if (target === undefined) return;
          void run("observe", {
            method: "observe",
            resourceId: target,
            input: {
              status,
              freshness: freshness.trim() === "" ? undefined : Number(freshness),
              declaredVersion: "1",
            },
          });
        }}
      >
        <Field label="Resource">
          <select className="adcos-input" value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
            {resources.map((r) => (
              <option key={r.resourceId} value={r.resourceId}>{r.resourceId}</option>
            ))}
          </select>
        </Field>
        <Field label="Observed status">
          <select className="adcos-input" value={status} onChange={(e) => setStatus(e.target.value as (typeof STATUS_VALUES)[number])}>
            {STATUS_VALUES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Freshness (epoch ms, optional)">
          <input className="adcos-input" type="number" value={freshness} onChange={(e) => setFreshness(e.target.value)} />
        </Field>
        <div className="sm:col-span-3">
          <button className="adcos-btn" type="submit" disabled={resources.length === 0}>Record observation</button>
        </div>
      </form>
    </Card>
  );
}

function ResourceItem({ resource }: { resource: ResourceCard }) {
  const { run } = useAdcos();
  return (
    <li className="rounded-lg border border-zinc-800/80 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="adcos-mono text-zinc-100">{resource.resourceId}</span>
        <Chip state={resource.share} />
        <Chip state={resource.status} />
        <span className="adcos-muted text-[11px]">{resource.type} · {resource.capability}</span>
      </div>
      <Row label="Freshness" value={resource.freshness === undefined ? "—" : new Date(resource.freshness).toLocaleString()} />
      <div className="mt-2 flex flex-wrap gap-2">
        {(["OPT_IN", "OPT_OUT", "PAUSE", "RESUME"] as const).map((event) => (
          <button
            key={event}
            type="button"
            className="adcos-btn px-3 py-1.5 text-xs"
            onClick={() =>
              void run(event, { method: "consent", resourceId: resource.resourceId, event })
            }
          >
            {event}
          </button>
        ))}
        <button
          type="button"
          className="adcos-btn px-3 py-1.5 text-xs text-rose-300"
          onClick={() =>
            void run("revoke", { method: "revokeResource", resourceId: resource.resourceId })
          }
        >
          REVOKE
        </button>
      </div>
    </li>
  );
}

export function ResourcesPanel() {
  const { view } = useAdcos();
  const resources = view?.resources ?? [];

  return (
    <>
      <EnrollForm />
      {resources.length > 0 && <ObserveForm resources={resources} />}
      <Card title={`My resources (${resources.length})`}>
        {resources.length === 0 ? (
          <EmptyState>No enrolled resources yet — enroll one above.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {resources.map((r) => (
              <ResourceItem key={r.resourceId} resource={r} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
