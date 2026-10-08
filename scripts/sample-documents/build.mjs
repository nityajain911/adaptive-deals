/**
 * Renders the fictional sample documents to PDF with a real browser, so they carry real fonts, a real layout and
 * a real text layer, like a document exported from an office tool. Run: node scripts/sample-documents/build.mjs
 */
import { chromium } from "@playwright/test";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "..", "public", "sample-documents");
const browser = await chromium.launch();
for (const [html, pdf] of [["rate-card.html", "pinecone-rate-card-oct-2026.pdf"], ["cost-sheet.html", "pinecone-cost-sheet-oct-2026.pdf"]]) {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.join(here, html)).href);
  await page.pdf({ path: path.join(out, pdf), format: "A4", printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  await page.close();
  console.log("wrote", pdf);
}
await browser.close();
