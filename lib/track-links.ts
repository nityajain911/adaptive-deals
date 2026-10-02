import type { AgreementVersion } from "@/domain/agreement";

/** Buyer proposal path for a version (client-safe copy of the service's proposalLink). */
export const proposalLinkOf = (v: Pick<AgreementVersion, "agreementId" | "version">) => `/proposal/${v.agreementId}/v${v.version}`;
