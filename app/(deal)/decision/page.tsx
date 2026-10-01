import { explainCheck, shortReason } from "@/domain/copy";
import { failingChecks, featuredRejections } from "@/domain/engine";
import { formatINR } from "@/domain/money";
import { ApprovalBadge, Checks, PaymentTable, StructureCard } from "@/components/structure-card";
import { Badge, Card, CardHeader, Empty, Label, Notice, SectionTitle, Stat } from "@/components/ui";
import { loadPage } from "@/lib/page-data";

export default async function DecisionPage() {
  const { s, out } = await loadPage();
  const r = out.evaluation.result;
  const policy = s.run.record.inputs.policy;
  if (!r) {
    return (
      <Notice tone="amber" title="No options yet">
        The engine evaluates structures once every decision-relevant fact is confirmed. Current deal status: {s.status.replace(/_/g, " ")}.
      </Notice>
    );
  }
  const exp = out.explanation;
  const order = exp?.order ?? r.feasible.map((x) => x.structure.id);
  const feasible = order.map((id) => r.feasible.find((x) => x.structure.id === id)!).filter(Boolean);
  const featured = featuredRejections(r);
  const featuredIds = new Set([featured.buyer?.structure.id, featured.seller?.structure.id]);
  const actionable = s.status === "options_ready";
  const common = { limitPaise: policy.cashAtRiskLimitPaise, floorBps: policy.contributionFloor.minPercentBps };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Templates evaluated" value={r.templatesEvaluated.length} hint="of 4 merchant-approved" />
        <Stat label="Structures evaluated" value={r.structures.length} hint="none removed before checks" />
        <Stat label="Feasible" value={r.feasible.length} tone="good" />
        <Stat label="Rejected" value={r.rejected.length} tone="bad" />
        <Stat label="Needs information" value={r.needsInformation.length} tone="warn" />
      </div>

      {exp ? (
        <Card aria-labelledby="ai-cmp" data-testid="ai-comparison">
          <CardHeader id="ai-cmp" title="AI comparison" meta={<><Label kind={exp.source.text === "ai" ? "ai" : "code_fallback"} /><Badge tone="neutral">Every figure filled by code</Badge><span>Ranks only engine-feasible options</span></>} />
          <div className="p-5 text-[14px] leading-6 text-ink-2">{exp.comparison}</div>
        </Card>
      ) : null}

      <section aria-labelledby="feasible">
        <SectionTitle id="feasible" meta={<span className="text-[13px] text-muted">Pass every buyer check and seller check · within-limit options rank first</span>}>
          Feasible structures
        </SectionTitle>
        {feasible.length === 0 ? <Empty>No feasible structure.</Empty> : null}
        <div className="space-y-4">
          {feasible.map((x, i) => (
            <StructureCard key={x.structure.id} x={x} rank={i + 1} note={exp?.notes.find((n) => n.structureId === x.structure.id)?.text} actionable={actionable} testId={`feasible-${i + 1}`} {...common} />
          ))}
        </div>
      </section>

      <section aria-labelledby="rejected">
        <SectionTitle id="rejected" meta={<Badge tone="red">Not approvable</Badge>}>
          Rejected structures
        </SectionTitle>
        <div className="grid gap-4 xl:grid-cols-2">
          {[featured.buyer, featured.seller].filter((x): x is NonNullable<typeof x> => !!x).map((x) => (
            <Card as="article" key={x.structure.id} className="border-[#f6cfc9]" data-testid={x === featured.buyer ? "featured-buyer-rejection" : "featured-seller-rejection"}>
              <div className="border-b border-line px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="red">{x === featured.buyer ? "Rejected · buyer can't carry it out" : "Rejected · seller can't afford it"}</Badge>
                  <ApprovalBadge approval={x.approval} />
                </div>
                <h3 className="mt-2 text-[15px] font-semibold text-ink">{x.structure.label}</h3>
                <ul className="mt-2 space-y-1 text-[13px] text-red">
                  {failingChecks(x).map((c, i) => (
                    <li key={i}>✕ {explainCheck(c)}</li>
                  ))}
                </ul>
              </div>
              <div className="space-y-4 p-5">
                <PaymentTable x={x} />
                <Checks title={x === featured.buyer ? "Buyer checks" : "Seller checks"} checks={x === featured.buyer ? x.buyerChecks : x.sellerChecks} />
                <div className="text-[12px] text-muted">
                  Net contribution {formatINR(x.economics.netContributionPaise)} · peak funding requirement {formatINR(x.economics.peakFundingPaise)} · peak unpaid service value {formatINR(x.economics.peakUnpaidServiceValuePaise)}
                </div>
              </div>
            </Card>
          ))}
        </div>
        <details className="mt-4 rounded-xl border border-line bg-surface">
          <summary className="cursor-pointer px-5 py-3 text-[13px] font-semibold text-ink">All {r.rejected.length} rejected structures and their reasons</summary>
          <ul className="divide-y divide-line">
            {r.rejected.map((x) => (
              <li key={x.structure.id} className="px-5 py-3 text-[13px]" data-testid="rejected-row">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{x.structure.label}</span>
                  {featuredIds.has(x.structure.id) ? <Badge tone="neutral">Featured above</Badge> : null}
                </div>
                <div className="mt-0.5 text-red">{[...new Set(failingChecks(x).map((c) => shortReason(c.code)))].join("; ")}</div>
              </li>
            ))}
          </ul>
        </details>
      </section>

      {r.needsInformation.length ? (
        <section aria-labelledby="needs-info">
          <SectionTitle id="needs-info" meta={<Badge tone="amber">Not approvable until resolved</Badge>}>
            Needs information
          </SectionTitle>
          <div className="space-y-2">
            {r.needsInformation.map((x) => (
              <Card key={x.structure.id} className="px-5 py-3">
                <div className="text-[13px] font-semibold text-ink">{x.structure.label}</div>
                <ul className="mt-1 text-[13px] text-amber">
                  {[...x.buyerChecks, ...x.sellerChecks].filter((c) => c.status === "needs_information").map((c, i) => (
                    <li key={i}>? {explainCheck(c)}</li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
