import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const FIXTURE_PORT = 4312;
const APP_PORT = 3202;
const sample = JSON.parse(readFileSync("data/synthetic/replay/hero-synthetic-run.json", "utf8"));
const outputByTask = new Map(sample.steps.map((step) => [`adaptive_deals_${step.task}`, step.rawOutput]));
let mode = "valid";

const json = (response, status, body) => {
  const text = JSON.stringify(body);
  response.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
  response.end(text);
};

const server = createServer((request, response) => {
  if (request.method === "PUT" && request.url === "/__mode") {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const requested = JSON.parse(body || "{}").mode;
      if (!["valid", "rate_limit", "malformed_rerank"].includes(requested)) return json(response, 400, { error: "unknown fixture mode" });
      mode = requested;
      return json(response, 200, { mode });
    });
    return;
  }
  if (request.method !== "POST" || request.url !== "/v1/chat/completions") return json(response, 404, { error: "not found" });
  if (mode === "rate_limit") return json(response, 429, { error: { message: "fixture rate limit" } });

  let body = "";
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    const payload = JSON.parse(body);
    const schemaName = payload.response_format?.json_schema?.name;
    let output = outputByTask.get(schemaName);
    if (schemaName === "commercial_retrieval_rerank") {
      const user = JSON.parse(payload.messages.find((message) => message.role === "user").content);
      const ids = user.candidates.map((candidate) => candidate.chunkId);
      const order = mode === "malformed_rerank" && ids.length > 1 ? [ids[0], ids[0], ...ids.slice(2)] : ids;
      output = { order, relevance: ids.map((chunkId) => ({ chunkId, label: "supporting" })) };
    }
    if (output === undefined) return json(response, 400, { error: { message: `unsupported fixture schema ${schemaName}` } });
    return json(response, 200, {
      model: "gpt-oss-120b",
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });
  });
});

const waitForSampleBuild = async () => {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:3200/deals/hero");
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("sample production build did not become ready");
};

server.listen(FIXTURE_PORT, "127.0.0.1", async () => {
  await waitForSampleBuild();
  // Next 16 production testing requires a completed `next build` before `next start`; the sample
  // webServer owns that one build, and this isolated runtime starts only after it is reachable.
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(APP_PORT)], { stdio: "inherit", env: process.env });
  const stop = () => { child.kill("SIGTERM"); server.close(); };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  child.on("exit", (code) => { server.close(); process.exit(code ?? 0); });
});
