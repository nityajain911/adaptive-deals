/** Restore a clean demo state: the bundled synthetic run at the start of the storyboard. */
import { resetToSeed, STORE_FILE } from "@/lib/service";
import { resetEconomicsStore } from "@/lib/economics-store";
import { DATA_DIR } from "@/lib/store";

// A clean demo also starts from version 1 of the business economics, so version numbers do not carry over.
resetEconomicsStore()
  .then(() => resetToSeed())
  .then((s) => console.log(`Reset ${DATA_DIR}/${STORE_FILE} · deal status ${s.status} · ${s.run.record.runId} (${s.run.record.kind})`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
