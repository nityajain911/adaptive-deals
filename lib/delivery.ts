import "server-only";
import { consumeFailNextSend } from "./presenter-store";

/**
 * Simulated delivery channel. Only initial proposals honour the presenter's one-shot failure;
 * amendment delivery always succeeds in this build (spec §5.5).
 */
export async function attemptDelivery(kind: "proposal" | "amendment"): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (kind === "proposal" && (await consumeFailNextSend())) return { ok: false, reason: "Simulated delivery failure (presenter: fail next send)" };
  return { ok: true };
}
