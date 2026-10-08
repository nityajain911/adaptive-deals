import { loadCommercialMemoryEvaluation, runLexicalCommercialMemoryEvaluation } from "@/commercial-memory/evaluation";

const frozen = loadCommercialMemoryEvaluation();
if (frozen.hash !== frozen.freeze.caseSetSha256) {
  throw new Error(`Commercial Memory case-set hash mismatch: expected ${frozen.freeze.caseSetSha256}, received ${frozen.hash}`);
}

const report = runLexicalCommercialMemoryEvaluation(frozen.cases);
console.log(JSON.stringify({
  mode: "lexical_code",
  authorship: frozen.authorship,
  frozenAt: frozen.freeze.frozenAt,
  promptVersion: frozen.freeze.promptVersion,
  caseSetSha256: frozen.hash,
  report,
}, null, 2));

