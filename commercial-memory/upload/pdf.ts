import { createHash } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import { MAX_PDF_BYTES, MAX_PDF_PAGES, MAX_UPLOAD_CHARS, MIN_PDF_CHARS_PER_PAGE, PDF_PARSE_TIMEOUT_MS, UploadError } from "./limits";

export const PDF_EXTRACTOR = "unpdf 1.8.1 (pdf.js text layer)";

export interface ExtractedPdf {
  fileSha256: string;
  pages: number;
  /** The text layer, one line per drawn line, pages separated by a blank line. */
  text: string;
}

const within = <T>(work: Promise<T>): Promise<T> =>
  Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new UploadError("Reading the PDF took too long, so it was refused")), PDF_PARSE_TIMEOUT_MS))]);

/**
 * The text layer of a text-based PDF, and nothing else. No OCR: a PDF without a usable text layer is refused.
 * The file is never executed (no scripts, no eval) and is rejected when it is too big, too long or encrypted.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<ExtractedPdf> {
  if (bytes.length === 0) throw new UploadError("The PDF is empty");
  if (bytes.length > MAX_PDF_BYTES) throw new UploadError(`The PDF is larger than ${Math.round(MAX_PDF_BYTES / 1_000_000 * 10) / 10} MB`);
  if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") throw new UploadError("That file is not a PDF");
  const fileSha256 = createHash("sha256").update(bytes).digest("hex");
  try {
    return await within((async () => {
      const doc = await getDocumentProxy(new Uint8Array(bytes), { isEvalSupported: false, useSystemFonts: false } as never);
      if (doc.numPages > MAX_PDF_PAGES) throw new UploadError(`The PDF has ${doc.numPages} pages; the limit is ${MAX_PDF_PAGES}`);
      const { text: pages } = await extractText(doc, { mergePages: false });
      const cleaned = pages.map((page) => page.replace(/\r/g, "").split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n"));
      const characters = cleaned.reduce((sum, page) => sum + page.length, 0);
      if (characters < MIN_PDF_CHARS_PER_PAGE * doc.numPages) throw new UploadError("This PDF has no readable text, so it looks like a scan. Upload a CSV or a text-based PDF instead.");
      const text = cleaned.filter(Boolean).join("\n\n");
      if (text.length > MAX_UPLOAD_CHARS) throw new UploadError(`The PDF text is longer than ${MAX_UPLOAD_CHARS} characters`);
      return { fileSha256, pages: doc.numPages, text };
    })());
  } catch (error) {
    if (error instanceof UploadError) throw error;
    const name = error instanceof Error ? error.name : "";
    if (name === "PasswordException") throw new UploadError("The PDF is password-protected, so it was refused");
    throw new UploadError("The PDF could not be read as text");
  }
}
