import { rm } from "node:fs/promises";

// The browser projects use isolated stores. Clearing them before the first
// production server starts prevents an interrupted earlier run from mixing a
// deal pinned to one economics version with a freshly reset economics store.
await Promise.all(
  [".data-e2e", ".data-e2e-recorded", ".data-e2e-cerebras"].map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ),
);
