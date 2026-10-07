import { TOKEN } from "./validate";

/** Fills every slot from values code owns. A token with no value is an error: nothing is sent with a hole in it. */
export function renderMessage(template: string, values: Record<string, Record<string, string>>): string {
  const out = template.replace(TOKEN, (_all, alias: string, slot: string) => {
    const v = values[alias]?.[slot];
    if (v === undefined) throw new Error(`No value for slot ${alias}.${slot}`);
    return v;
  });
  return out.replace(/[ \t]+/g, " ").trim();
}
