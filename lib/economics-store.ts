import "server-only";

import {
  activate,
  economicsContentHash,
  EconomicsError,
  validateEconomics,
  type BusinessEconomics,
  type EconomicsContent,
  type EconomicsIssue,
} from "@/domain/business-economics";
import { defaultEconomics, defaultEconomicsContent } from "@/lib/economics-default";
import { readJson, serialised, writeJsonAtomic } from "@/lib/store";

export const ECONOMICS_FILE = "economics.json";
export const ECONOMICS_STORE_SCHEMA = "adaptive-deals.economics-store.v1" as const;

export interface EconomicsStore {
  schema: typeof ECONOMICS_STORE_SCHEMA;
  versions: BusinessEconomics[];
  draft: EconomicsContent | null;
}

const initialStore = (): EconomicsStore => ({
  schema: ECONOMICS_STORE_SCHEMA,
  versions: [defaultEconomics()],
  draft: null,
});

async function readOrCreate(): Promise<EconomicsStore> {
  const existing = await readJson<EconomicsStore>(ECONOMICS_FILE);
  if (existing) return existing;
  const created = initialStore();
  await writeJsonAtomic(ECONOMICS_FILE, created);
  return created;
}

const newest = (store: EconomicsStore): BusinessEconomics =>
  store.versions.reduce((latest, version) => (version.version > latest.version ? version : latest));

export function getEconomicsStore(): Promise<EconomicsStore> {
  return serialised(readOrCreate);
}

export async function activeEconomics(): Promise<BusinessEconomics> {
  return newest(await getEconomicsStore());
}

export async function economicsVersion(version: number): Promise<BusinessEconomics | null> {
  return (await getEconomicsStore()).versions.find((item) => item.version === version) ?? null;
}

export function saveEconomicsDraft(content: EconomicsContent): Promise<EconomicsIssue[]> {
  return serialised(async () => {
    const store = await readOrCreate();
    store.draft = structuredClone(content);
    await writeJsonAtomic(ECONOMICS_FILE, store);
    return validateEconomics(content);
  });
}

export function discardEconomicsDraft(): Promise<void> {
  return serialised(async () => {
    const store = await readOrCreate();
    store.draft = null;
    await writeJsonAtomic(ECONOMICS_FILE, store);
  });
}

export function activateEconomicsDraft(by: string, at: string): Promise<BusinessEconomics> {
  return serialised(async () => {
    const store = await readOrCreate();
    if (!store.draft) throw new EconomicsError("There is no draft to activate");
    const active = newest(store);
    if (economicsContentHash(store.draft) === active.hash) throw new EconomicsError("There is no change to activate");
    const version = activate(store.draft, { version: active.version + 1, activatedAt: at, activatedBy: by });
    store.versions.push(version);
    store.draft = null;
    await writeJsonAtomic(ECONOMICS_FILE, store);
    return version;
  });
}

export function restoreDefaultEconomics(by: string, at: string): Promise<BusinessEconomics> {
  return serialised(async () => {
    const store = await readOrCreate();
    const active = newest(store);
    const content = defaultEconomicsContent();
    if (economicsContentHash(content) === active.hash) return active;
    const restored = activate(content, { version: active.version + 1, activatedAt: at, activatedBy: by });
    store.versions.push(restored);
    store.draft = null;
    await writeJsonAtomic(ECONOMICS_FILE, store);
    return restored;
  });
}

export function resetEconomicsStore(): Promise<void> {
  return serialised(async () => {
    await writeJsonAtomic(ECONOMICS_FILE, initialStore());
  });
}
