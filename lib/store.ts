import "server-only";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { headers } from "next/headers";

/**
 * Local JSON-file store under the git-ignored `.data/` directory. Writes go to a temporary
 * file and are renamed into place, so a crash never leaves a half-written store. Mutations are
 * serialised in-process.
 */
export const DATA_DIR = process.env.ADAPTIVE_DEALS_DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), ".data");

/**
 * A hosted demo gives every visitor their own copy of the state, so two reviewers never reset or change each other's deal.
 * It is on only when ADAPTIVE_DEALS_SESSIONS=1; the proxy sets a random visitor id, and each visitor's files live under
 * `sessions/<id>/`. Everything else (local runs, tests, scripts) uses the one shared directory as before.
 */
export const SESSION_HEADER = "x-ad-session";
export const SESSION_PATTERN = /^[a-f0-9]{32}$/;
const SESSIONS = process.env.ADAPTIVE_DEALS_SESSIONS === "1";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export async function currentDataDir(): Promise<string> {
  if (!SESSIONS) return DATA_DIR;
  try {
    const id = (await headers()).get(SESSION_HEADER);
    if (id && SESSION_PATTERN.test(id)) return path.join(/*turbopackIgnore: true*/ DATA_DIR, "sessions", id);
  } catch {
    // Outside a request (a script, a build): the shared directory.
  }
  return DATA_DIR;
}

let lastPrune = 0;
/** Visitor folders nobody has touched for a day are removed, so a long-running host does not fill its disk. */
async function pruneSessions(): Promise<void> {
  if (!SESSIONS || Date.now() - lastPrune < 60 * 60 * 1000) return;
  lastPrune = Date.now();
  const root = path.join(/*turbopackIgnore: true*/ DATA_DIR, "sessions");
  try {
    for (const name of await readdir(root)) {
      const dir = path.join(root, name);
      if (Date.now() - (await stat(dir)).mtimeMs > SESSION_TTL_MS) await rm(dir, { recursive: true, force: true });
    }
  } catch {
    // Nothing to prune yet.
  }
}

export async function readJson<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(/*turbopackIgnore: true*/ await currentDataDir(), name), "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export async function writeJsonAtomic(name: string, value: unknown): Promise<void> {
  const target = path.join(/*turbopackIgnore: true*/ await currentDataDir(), name);
  await mkdir(path.dirname(target), { recursive: true });
  void pruneSessions();
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
