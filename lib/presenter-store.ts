import "server-only";
import { readJson, serialised, writeJsonAtomic } from "./store";

/**
 * Presenter-only flags, stored in their own file. Never part of the deal state, deal exports or
 * the merchant audit (spec §3.2, §8.2).
 */
export interface PresenterFlags {
  /** One-shot: the next initial-proposal delivery fails, deterministically. */
  failNextSend: boolean;
}

const FILE = "presenter.json";

export async function readPresenterFlags(): Promise<PresenterFlags> {
  return { failNextSend: false, ...((await readJson<PresenterFlags>(FILE)) ?? {}) };
}

export async function setFailNextSend(on: boolean): Promise<void> {
  await serialised(async () => writeJsonAtomic(FILE, { ...(await readPresenterFlags()), failNextSend: on }));
}

/** Read and clear the one-shot flag. Called inside the store's serialised mutation. */
export async function consumeFailNextSend(): Promise<boolean> {
  const f = await readPresenterFlags();
  if (f.failNextSend) await writeJsonAtomic(FILE, { ...f, failNextSend: false });
  return f.failNextSend;
}
