/** Hard limits on what a merchant may upload. An upload over any of them is refused whole, never trimmed. */
export const MAX_UPLOAD_CHARS = 20_000;
export const MAX_UPLOAD_LINES = 400;
export const MAX_PDF_BYTES = 1_500_000;
export const MAX_PDF_PAGES = 10;
export const PDF_PARSE_TIMEOUT_MS = 10_000;
/** A PDF whose text layer is shorter than this per page is treated as a scan and refused. */
export const MIN_PDF_CHARS_PER_PAGE = 20;

export class UploadError extends Error {
  constructor(message: string, readonly notes: UploadNote[] = []) {
    super(message);
    this.name = "UploadError";
  }
}

export interface UploadNote {
  line: string;
  reason: string;
}
