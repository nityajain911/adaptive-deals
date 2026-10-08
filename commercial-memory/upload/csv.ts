export interface CsvCell {
  text: string;
  start: number;
  end: number;
}
export interface CsvRow {
  rowNumber: number;
  start: number;
  end: number;
  text: string;
  cells: CsvCell[];
}

const DELIMITERS = [",", ";", "\t", "|"] as const;

/** Pick the delimiter that splits the first non-empty line into the most cells, outside quotes. */
export function detectDelimiter(content: string): string {
  const first = content.split("\n").find((line) => line.trim()) ?? "";
  let best = ",";
  let bestCount = 0;
  for (const delimiter of DELIMITERS) {
    let count = 0;
    let quoted = false;
    for (const ch of first) {
      if (ch === '"') quoted = !quoted;
      else if (!quoted && ch === delimiter) count += 1;
    }
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

/** Split one line into cells, keeping each cell's offsets in the whole content. */
function cellsOf(line: string, lineStart: number, delimiter: string): CsvCell[] {
  const cells: CsvCell[] = [];
  let i = 0;
  while (i <= line.length) {
    const rawStart = i;
    let text = "";
    if (line[i] === '"') {
      i += 1;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          text += '"';
          i += 2;
        } else if (line[i] === '"') {
          i += 1;
          break;
        } else {
          text += line[i++];
        }
      }
      while (i < line.length && line[i] !== delimiter) i += 1;
    } else {
      while (i < line.length && line[i] !== delimiter) text += line[i++];
    }
    cells.push({ text: text.trim(), start: lineStart + rawStart, end: lineStart + i });
    if (i >= line.length) break;
    i += 1; // the delimiter
  }
  return cells;
}

/** Rows of the content, one per non-empty line. A quoted cell may not span lines in an upload. */
export function parseCsv(content: string): { delimiter: string; rows: CsvRow[] } {
  const delimiter = detectDelimiter(content);
  const rows: CsvRow[] = [];
  let cursor = 0;
  content.split("\n").forEach((line, index) => {
    if (line.trim()) rows.push({ rowNumber: index + 1, start: cursor, end: cursor + line.length, text: line, cells: cellsOf(line, cursor, delimiter) });
    cursor += line.length + 1;
  });
  return { delimiter, rows };
}

const squash = (text: string) => text.toLowerCase().replace(/[^a-z]/g, "");
const SERVICE_HEADERS = ["service", "services", "name", "item", "package", "product", "deliverable"];
const PRICE_HEADERS = ["price", "standardprice", "listprice", "rate", "fee", "charge", "amount", "baseprice", "sellingprice", "pricinr", "priceinr"];
const COST_HEADERS = ["cost", "directcost", "ourcost", "deliverycost", "directdeliverycost", "costprice", "expense", "costinr"];

export interface ColumnMap {
  service: number;
  price: number | null;
  cost: number | null;
}

/** Which columns hold the service, price and cost, from the header row. Null when the first row is not a header. */
export function mapColumns(header: CsvRow): ColumnMap | null {
  const heads = header.cells.map((cell) => squash(cell.text));
  const find = (names: string[]) => {
    const exact = heads.findIndex((head) => names.includes(head));
    if (exact >= 0) return exact;
    return heads.findIndex((head) => names.some((name) => name.length >= 4 && head.includes(name)));
  };
  const service = find(SERVICE_HEADERS);
  if (service < 0) return null;
  const cost = find(COST_HEADERS);
  const price = heads.findIndex((head, index) => index !== cost && index !== service && (PRICE_HEADERS.includes(head) || (head.includes("price") && !head.includes("cost"))));
  if (price < 0 && cost < 0) return null;
  return { service, price: price < 0 ? null : price, cost: cost < 0 ? null : cost };
}
