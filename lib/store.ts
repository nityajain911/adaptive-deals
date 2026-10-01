import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Local JSON-file store under the git-ignored `.data/` directory. Writes go to a temporary
 * file and are renamed into place, so a crash never leaves a half-written store. Mutations are
 * serialised in-process.
 */
export const DATA_DIR = process.env.ADAPTIVE_DEALS_DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), ".data");

export async function readJson<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(/*turbopackIgnore: true*/ DATA_DIR, name), "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export async function writeJsonAtomic(name: string, value: unknown): Promise<void> {
  const target = path.join(/*turbopackIgnore: true*/ DATA_DIR, name);
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await rename(tmp, target);
}

let queue: Promise<unknown> = Promise.resolve();

/** Run a read-modify-write under an in-process lock. */
export function serialised<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}
