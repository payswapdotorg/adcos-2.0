/**
 * AboutPanel — product identity and the honest capability statement.
 */
import { Card, Notice, Row } from "../ui.tsx";
import {
  ADCOS_PAYMENT_NOTICE,
  PRODUCT_NAME,
  PRODUCT_TAGLINE,
  PRODUCT_WEB_VERSION,
} from "../../contract.js";

export function AboutPanel() {
  return (
    <>
      <Card title={`${PRODUCT_NAME} — ${PRODUCT_TAGLINE}`}>
        <Row label="Product" value={`${PRODUCT_NAME} (${PRODUCT_TAGLINE})`} />
        <Row label="App version" value={`v${PRODUCT_WEB_VERSION}`} />
        <Row label="Repository" value="payswapdotorg/adcos-2.0" />
        <Row label="Domain runtime" value="SurfacesService (public contract) in the desktop main process" />
        <Row label="Persistence" value="durable JSONL state log (write-before-ack, restart-safe)" />
      </Card>

      <Card title="What this app is">
        <p className="text-sm leading-relaxed text-zinc-300">
          This desktop application is the ADCOS product surface: local journeys through
          the real, merged ADCOS domain — resource enrollment and consent, Reality Lab
          evaluations, organization founding and membership, group purchasing with the
          order lifecycle, and the operator/developer role views. Every panel reads and
          writes through the same public contract the domain packages expose; nothing is
          simulated in the UI.
        </p>
      </Card>

      <Card title="Honest capability statement">
        <Notice>
          Per the repository README: the ADCOS specifications do not imply that the
          referenced capabilities are already implemented. This app demonstrates the
          merged domain logic with local persisted state; it does not claim live
          provider forwarding, physical-device cooperation, or payment settlement.
        </Notice>
        <div className="mt-3 space-y-2">
          <Notice tone="warn">{ADCOS_PAYMENT_NOTICE}</Notice>
          <Notice tone="warn">
            Live provider/hardware evidence is the P4-W2 work order and is
            BLOCKED-ON-OPERATOR (ADR-0004 / roadmap): provider offers recorded here are
            manual evidence entries, not live integrations.
          </Notice>
        </div>
      </Card>

      <Card title="Isolation">
        <p className="text-sm leading-relaxed text-zinc-300">
          The app is product-locked: it loads only the ADCOS product surface. The
          inherited ZCode substrate application is not bundled and is unreachable by
          construction.
        </p>
      </Card>
    </>
  );
}
