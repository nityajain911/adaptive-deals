export type JsonTokenKind = "key" | "string" | "number" | "literal" | "punct" | "space";
export interface JsonToken {
  kind: JsonTokenKind;
  text: string;
}

const PATTERN = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])|(\s+)/g;

/**
 * Split pretty-printed JSON into tokens for colouring. No dependency: JSON has six token kinds and the input is
 * always our own `JSON.stringify` output, so a single pass is enough. Concatenating the tokens gives the input back.
 */
export function tokenizeJson(text: string): JsonToken[] {
  const out: JsonToken[] = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    if (m.index! > last) out.push({ kind: "punct", text: text.slice(last, m.index) });
    if (m[1] !== undefined) {
      if (m[2] !== undefined) { out.push({ kind: "key", text: m[1] }); out.push({ kind: "punct", text: m[2] }); } else out.push({ kind: "string", text: m[1] });
    } else if (m[3] !== undefined) out.push({ kind: "number", text: m[3] });
    else if (m[4] !== undefined) out.push({ kind: "literal", text: m[4] });
    else if (m[5] !== undefined) out.push({ kind: "punct", text: m[5] });
    else out.push({ kind: "space", text: m[6]! });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ kind: "punct", text: text.slice(last) });
  return out;
}
