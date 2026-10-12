import { MCP_CAPABILITY_MAP, MCP_DISCOVERY, type McpMapStatus } from "@/lib/mcp-capability-map";
import { cx } from "@/components/ui";

const CHIP: Record<McpMapStatus, { label: string; className: string }> = {
  implemented: { label: "Implemented · test mode", className: "bg-green-weak text-green" },
  simulated: { label: "Simulated", className: "bg-amber-weak text-amber" },
  not_used: { label: "Not used", className: "bg-surface-muted text-ink-2" },
};

/** Each part of a deal against what Razorpay's MCP server offers and what this prototype actually does. No claim beyond what was observed. */
export function McpCapabilityMap({ compact = false }: { compact?: boolean }) {
  return (
    <div data-testid="mcp-capability-map" className="space-y-2">
      <p className="text-[12px] text-muted">From the read-only discovery of {MCP_DISCOVERY.observedAt.split("-").reverse().join(" ")} ({MCP_DISCOVERY.toolCount} tools advertised; {MCP_DISCOVERY.via}). Nothing on this page calls Razorpay.</p>
      <ul className="space-y-2">
        {MCP_CAPABILITY_MAP.map((row) => (
          <li key={row.id} className="rounded-lg border border-line px-3 py-2" data-testid={`mcp-map-${row.id}`} data-status={row.status}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-ink">{row.part}</span>
              <span className={cx("rounded-full px-2.5 py-0.5 text-[12px] font-bold", CHIP[row.status].className)}>{CHIP[row.status].label}</span>
            </div>
            <p className="mt-1 text-ink-2">{row.today}</p>
            {row.tools.length ? <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-muted"><span>Razorpay tools:</span>{row.tools.map((tool) => <code key={tool} className="rounded bg-surface-muted px-1 font-mono [overflow-wrap:anywhere]">{tool}</code>)}</div> : <p className="mt-1 text-[12px] text-muted">Razorpay tools: none identified</p>}
            {row.limit && !compact ? <p className="mt-1 text-[12px] text-ink-2">{row.limit}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
