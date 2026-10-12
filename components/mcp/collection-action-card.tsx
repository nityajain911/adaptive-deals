import { Card } from "@/components/ui";
import { formatINR } from "@/domain/money";
import type { McpConnectionStatus } from "@/mcp/config";
import type { McpActionIntent, McpActionReceipt } from "@/mcp/intents";
import { paymentLinkPreflight } from "@/lib/mcp-capability-map";
import { McpCapabilityMap } from "./capability-map";
import { ApproveAndCreateButton, PrepareMcpButton, RefreshMcpStatusButton } from "./mcp-action-buttons";

const REASON: Record<Exclude<McpConnectionStatus, { connected: true }>["reason"], string> = {
  not_configured: "No Razorpay MCP server is configured in this environment.",
  missing_key: "A Razorpay test key is not set.",
  missing_secret: "The Razorpay test key secret is not set.",
  unrecognised_key: "The Razorpay key is not a test key, so it was not used.",
  live_key_refused: "A live Razorpay key was refused. Only rzp_test_ keys are accepted.",
};

export function McpCollectionActionCard({ receipt = null, simulatedCollection, connection = { connected: false, reason: "not_configured" }, intent = null }: { receipt?: McpActionReceipt | null; simulatedCollection: boolean; connection?: McpConnectionStatus; intent?: McpActionIntent | null }) {
  if (receipt?.outcome === "succeeded") return <Card className="space-y-2 p-5" data-testid="mcp-collection-card">
    <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">Razorpay action</div>
    <h2 className="text-[17px] font-semibold text-ink">Created through Razorpay MCP · Test mode</h2>
    <p className="text-[13px] text-ink-2">Payment Link {receipt.externalId} · status {receipt.externalStatus}</p>
    {receipt.shortUrl ? <a href={receipt.shortUrl} className="text-[13px] font-semibold text-blue hover:underline">Open test Payment Link →</a> : null}
    <RefreshMcpStatusButton intentId={receipt.intentId} />
  </Card>;
  if (receipt?.outcome === "unknown") return <Card className="space-y-2 border-[#f7dfb4] p-5" data-testid="mcp-collection-card"><h2 className="text-[17px] font-semibold text-ink">Razorpay MCP outcome unknown</h2><p className="text-[13px] text-ink-2">Adaptive Deals will reconcile the reference before allowing another write. No retry has run.</p></Card>;
  if (receipt?.outcome === "failed") return <Card className="space-y-2 border-[#f3c8c3] p-5" data-testid="mcp-collection-card"><h2 className="text-[17px] font-semibold text-ink">Razorpay MCP test action failed</h2><p className="text-[13px] text-ink-2">{receipt.safeError}. It was not replaced by a simulation.</p>{connection.connected ? <PrepareMcpButton label="Review again" /> : null}</Card>;
  if (connection.connected && intent && (intent.status === "draft" || intent.status === "approved")) {
    const args = intent.canonicalArguments;
    return <Card className="space-y-3 border-[#cfd9ff] p-5" data-testid="mcp-collection-card" data-state="review">
      <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">Razorpay action · review</div>
      <h2 className="text-[17px] font-semibold text-ink">Create a Razorpay test Payment Link</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px] text-ink-2" data-testid="mcp-review">
        <dt>Amount</dt><dd className="font-medium text-ink">{formatINR(args.amount)} (first payment of the accepted agreement)</dd>
        <dt>Mode</dt><dd>Test mode only · no real money moves</dd>
        <dt>Agreement</dt><dd>{intent.agreementId} v{intent.agreementVersion} · terms {intent.termsHash.slice(0, 12)}</dd>
        <dt>Razorpay tool</dt><dd>{intent.toolName} on {intent.serverId}</dd>
        <dt>Reference</dt><dd>{args.reference}</dd>
        <dt>Sent to Razorpay</dt><dd>Amount, currency, description, reference and the buyer&apos;s organisation name. No SMS or email is sent to anyone.</dd>
      </dl>
      {paymentLinkPreflight(args.amount) ? <p className="rounded-lg border border-[#f7dfb4] bg-amber-weak px-3 py-2 text-[13px] text-ink" data-testid="mcp-preflight">{paymentLinkPreflight(args.amount)}</p> : null}
      <ApproveAndCreateButton intentId={intent.id} approved={intent.status === "approved"} />
    </Card>;
  }
  if (connection.connected) return <Card className="space-y-2 p-5" data-testid="mcp-collection-card" data-state="ready">
    <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">Razorpay action</div>
    <h2 className="text-[17px] font-semibold text-ink">Razorpay MCP is connected · Test mode</h2>
    <p className="text-[13px] text-ink-2">The buyer accepted. Review the exact Payment Link before anything is created. Nothing is sent to Razorpay yet.</p>
    <PrepareMcpButton />
  </Card>;
  return <Card className="space-y-2 p-5" data-testid="mcp-collection-card" data-state="unavailable">
    <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">Approved action layer</div>
    <h2 className="text-[17px] font-semibold text-ink">Razorpay MCP is not connected</h2>
    <p className="text-[13px] text-ink-2">{REASON[connection.reason]} No Razorpay MCP action occurred.</p>
    <p className="text-[12px] text-muted">{simulatedCollection ? "This deal uses the separately labelled simulated collection setup shown below." : "You can choose a separately labelled simulation for the demo."}</p>
    <details className="text-[13px]" data-testid="mcp-map-details"><summary className="cursor-pointer font-semibold text-ink">How this maps to Razorpay</summary><div className="mt-2"><McpCapabilityMap compact /></div></details>
  </Card>;
}

