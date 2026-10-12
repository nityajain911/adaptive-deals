import "server-only";
import { rm } from "node:fs/promises";
import path from "node:path";
import { currentDataDir, readJson, writeJsonAtomic } from "./store";

/**
 * Where the deals the merchant is not currently working on are kept. The open deal stays in the one store file the
 * whole app reads; opening another deal saves it here first and loads the other one, so every deal keeps its own progress.
 */
const fileOf = (caseId: string) => `vault/${caseId}.json`;

export const saveVaultedDeal = (caseId: string, state: unknown): Promise<void> => writeJsonAtomic(fileOf(caseId), state);
export const readVaultedDeal = <T>(caseId: string): Promise<T | null> => readJson<T>(fileOf(caseId));
export const clearVault = async (): Promise<void> => rm(path.join(/*turbopackIgnore: true*/ await currentDataDir(), "vault"), { recursive: true, force: true });
