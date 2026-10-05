import { WALKTHROUGH_VERSION } from "@/lib/walkthrough";

export const WALKTHROUGH_PREFERENCES_KEY = `adaptive-deals.walkthrough.${WALKTHROUGH_VERSION}`;
export const WALKTHROUGH_PREFERENCES_EVENT = "adaptive-deals:walkthrough-preferences";

export interface WalkthroughPreferences {
  version: typeof WALKTHROUGH_VERSION;
  dismissedWelcome: boolean;
  open: boolean;
  reviewingObjectiveId: string | null;
}

export const DEFAULT_WALKTHROUGH_PREFERENCES: WalkthroughPreferences = {
  version: WALKTHROUGH_VERSION,
  dismissedWelcome: false,
  open: false,
  reviewingObjectiveId: null,
};

export function readWalkthroughPreferences(storage: Pick<Storage, "getItem">): WalkthroughPreferences {
  try {
    const raw = storage.getItem(WALKTHROUGH_PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_WALKTHROUGH_PREFERENCES };
    const value = JSON.parse(raw) as Partial<WalkthroughPreferences>;
    if (
      value.version !== WALKTHROUGH_VERSION ||
      typeof value.dismissedWelcome !== "boolean" ||
      typeof value.open !== "boolean" ||
      !(value.reviewingObjectiveId === null || typeof value.reviewingObjectiveId === "string")
    ) {
      return { ...DEFAULT_WALKTHROUGH_PREFERENCES };
    }
    return {
      version: WALKTHROUGH_VERSION,
      dismissedWelcome: value.dismissedWelcome,
      open: value.open,
      reviewingObjectiveId: value.reviewingObjectiveId,
    };
  } catch {
    return { ...DEFAULT_WALKTHROUGH_PREFERENCES };
  }
}

export function writeWalkthroughPreferences(storage: Pick<Storage, "setItem">, next: WalkthroughPreferences): void {
  storage.setItem(
    WALKTHROUGH_PREFERENCES_KEY,
    JSON.stringify({
      version: WALKTHROUGH_VERSION,
      dismissedWelcome: next.dismissedWelcome,
      open: next.open,
      reviewingObjectiveId: next.reviewingObjectiveId,
    }),
  );
}

export function notifyWalkthroughPreferences(): void {
  window.dispatchEvent(new Event(WALKTHROUGH_PREFERENCES_EVENT));
}

export function subscribeWalkthroughPreferences(onStoreChange: () => void): () => void {
  window.addEventListener(WALKTHROUGH_PREFERENCES_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(WALKTHROUGH_PREFERENCES_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

export function walkthroughPreferencesSnapshot(): string {
  return window.localStorage.getItem(WALKTHROUGH_PREFERENCES_KEY) ?? "";
}
