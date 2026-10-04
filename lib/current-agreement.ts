import type { AgreementVersion } from "@/domain/agreement";
import type { ServicePackage } from "@/domain/types";
import type { ContractFinancialView } from "./financial-view";
import type { DealProgress } from "./progress";

export interface CurrentAgreementSummary {
  kind: "proposed" | "accepted" | "declined";
  title: string;
  version: number;
  included: string[];
  excluded: string[];
  servicePeriod: string;
  laterWorkStatement: string | null;
  financial: ContractFinancialView;
  readiness: string;
  nextAction: string;
}

export interface PaymentSetupSummary {
  upfront: "not_applicable" | "pending" | "paid";
  mandate: "not_applicable" | "pending" | "confirmed";
}

const monthLabel = (month: string) => {
  const [year, number] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, number - 1, 1)));
};

function servicePeriod(v: AgreementVersion): string {
  const months = v.terms.deliverySchedule.map((line) => line.month.value).sort();
  if (!months.length) return "No service period recorded";
  const first = monthLabel(months[0]);
  const last = monthLabel(months.at(-1)!);
  return first === last ? first : `${first}–${last}`;
}

function titleFor(v: AgreementVersion): string {
  if (v.terms.structure.template === "phased_scope") return "Standalone three-month package";
  if (v.terms.structure.template === "deferred_start") {
    const firstMonth = v.terms.deliverySchedule.map((line) => line.month.value).sort()[0];
    return `Annual digital marketing from ${monthLabel(firstMonth)}`;
  }
  if (v.terms.structure.template === "shorter_commitment") {
    const months = Math.max(...v.terms.scope.map((item) => item.months));
    return `${months}-month digital marketing agreement`;
  }
  return "Annual digital marketing agreement";
}

function scopeLines(v: AgreementVersion, packages: ServicePackage[]): { included: string[]; excluded: string[] } {
  const packageById = new Map(packages.map((item) => [item.id, item]));
  const grouped = new Map<string, string[]>();
  for (const line of v.terms.deliverySchedule) {
    const months = grouped.get(line.packageId) ?? [];
    months.push(line.month.value);
    grouped.set(line.packageId, months);
  }
  const included = [...grouped].map(([id, rawMonths]) => {
    const pkg = packageById.get(id);
    const name = pkg?.name ?? id;
    const months = rawMonths.sort();
    if (pkg?.kind === "one_time") return `${name} · one-time in ${monthLabel(months[0])}`;
    const first = monthLabel(months[0]);
    const last = monthLabel(months.at(-1)!);
    return `${name} · ${first === last ? first : `${first}–${last}`}`;
  });
  const excluded = v.terms.excludedPackageIds.map((id) => packageById.get(id)?.name ?? id);
  return { included, excluded };
}

function readinessFor(kind: CurrentAgreementSummary["kind"], setup: PaymentSetupSummary): string {
  const boundary = "Delivery readiness is not tracked here.";
  if (kind === "proposed") return `Awaiting buyer acceptance. No payment setup starts before acceptance. ${boundary}`;
  if (kind === "declined") return `Buyer declined this version. No payment setup was created. ${boundary}`;
  const parts: string[] = [];
  if (setup.upfront === "pending") parts.push("Upfront payment pending");
  else if (setup.upfront === "paid") parts.push("Upfront payment paid");
  if (setup.mandate === "pending") parts.push("mandate pending");
  else if (setup.mandate === "confirmed") parts.push("mandate confirmed");
  if (!parts.length) parts.push("Payment setup is not required");
  return `${parts.join(" · ")}. ${boundary}`;
}

/** A single, truthful summary of the latest non-superseded agreement version. */
export function currentAgreementSummary(args: {
  agreements: AgreementVersion[];
  packages: ServicePackage[];
  financial: ContractFinancialView;
  progress: DealProgress;
  paymentSetup: PaymentSetupSummary;
}): CurrentAgreementSummary | null {
  const candidates = args.agreements.filter((version) => version.status !== "superseded");
  const agreement = [...candidates].filter((version) => version.status === "active").sort((a, b) => b.version - a.version)[0]
    ?? [...candidates].filter((version) => version.status === "accepted").sort((a, b) => b.version - a.version)[0]
    ?? [...candidates].sort((a, b) => b.version - a.version)[0];
  if (!agreement) return null;
  const kind: CurrentAgreementSummary["kind"] = agreement.status === "buyer_rejected" ? "declined" : agreement.buyerAcceptance ? "accepted" : "proposed";
  const scope = scopeLines(agreement, args.packages);
  return {
    kind,
    title: titleFor(agreement),
    version: agreement.version,
    included: scope.included,
    excluded: scope.excluded,
    servicePeriod: servicePeriod(agreement),
    laterWorkStatement: agreement.terms.structure.template === "phased_scope" ? "No later phase is agreed." : null,
    financial: args.financial,
    readiness: readinessFor(kind, args.paymentSetup),
    nextAction: args.progress.headline,
  };
}
