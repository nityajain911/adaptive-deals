/** Hero deal context and the merchant-recorded answers, as used by runs and replays. Synthetic. */
import type { DealContext } from "@/ai/orchestrator";
import type { RecordedAnswer } from "@/ai/run-record";
import { heroClarificationAnswers as A, heroMerchant, heroMessages, heroPackages, heroTemplates, HERO_DEAL_ID } from "./hero";

export const heroDeal = (): DealContext => structuredClone({ dealId: HERO_DEAL_ID, messages: heroMessages, merchant: heroMerchant, packages: heroPackages, templates: heroTemplates });

export const heroRecordedAnswers: RecordedAnswer[] = [
  { questionId: A.gst.clarificationId, value: A.gst.value, answerText: A.gst.answerText, recordedBy: A.gst.recordedBy, confirmedByBuyerVia: A.gst.confirmedByBuyerVia, answeredAt: A.gst.answeredAt },
  { questionId: A.approvalScope.clarificationId, value: A.approvalScope.value, answerText: A.approvalScope.answerText, recordedBy: A.approvalScope.recordedBy, confirmedByBuyerVia: A.approvalScope.confirmedByBuyerVia, answeredAt: A.approvalScope.answeredAt },
];
