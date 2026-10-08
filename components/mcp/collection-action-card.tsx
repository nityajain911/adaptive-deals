import { Card } from "@/components/ui";
import type { McpActionReceipt } from "@/mcp/intents";

export function McpCollectionActionCard({ receipt = null, simulatedCollection }: { receipt?: McpActionReceipt | null; simulatedCollection: boolean }) {
  if (receipt?.outcome === "succeeded") return <Card className="space-y-2 p-5" data-testid="mcp-collection-card">
    <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">Razorpay action</div>
    <h2 className="text-[17px] font-semibold text-ink">Created through Razorpay MCP · Test mode</h2>
    <p className="text-[13px] text-ink-2">Payment Link {receipt.externalId} · status {receipt.externalStatus}</p>
    {receipt.shortUrl ? <a href={receipt.shortUrl} className="text-[13px] font-semibold text-blue hover:underline">Open test Payment Link →</a> : null}
  </Card>;
  if (receipt?.outcome === "unknown") return <Card className="space-y-2 border-[#f7dfb4] p-5" data-testid="mcp-collection-card"><h2 className="text-[17px] font-semibold text-ink">Razorpay MCP outcome unknown</h2><p className="text-[13px] text-ink-2">Adaptive Deals will reconcile the reference before allowing another write. No retry has run.</p></Card>;
  if (receipt?.outcome === "failed") return <Card className="space-y-2 border-[#f3c8c3] p-5" data-testid="mcp-collection-card"><h2 className="text-[17px] font-semibold text-ink">Razorpay MCP test action failed</h2><p className="text-[13px] text-ink-2">{receipt.safeError}. It was not replaced by a simulation.</p></Card>;
  return <Card className="space-y-2 p-5" data-testid="mcp-collection-card">
    <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">Approved action layer</div>
    <h2 className="text-[17px] font-semibold text-ink">Razorpay MCP is not connected</h2>
    <p className="text-[13px] text-ink-2">No compatible test-mode Payment Link tool was advertised in this environment. No Razorpay MCP action occurred.</p>
    <p className="text-[12px] text-muted">{simulatedCollection ? "This deal uses the separately labelled simulated collection setup shown below." : "You can choose a separately labelled simulation for the demo."}</p>
  </Card>;
}

