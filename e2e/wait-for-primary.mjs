// Starts a replay server only after the primary server has finished the shared production build.
const target = process.argv[2] ?? "http://localhost:3200/deals";
const deadline = Date.now() + 5 * 60_000;

for (;;) {
  try {
    const response = await fetch(target);
    if (response.ok) break;
  } catch {
    // The primary server is still building or starting.
  }
  if (Date.now() > deadline) {
    console.error(`Timed out waiting for ${target}`);
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
