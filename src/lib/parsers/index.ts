import { parseCsv } from "./csv";
import { parseOfx } from "./ofx";
import type { ParseResult } from "./types";

export type { ParsedRow, ParseResult } from "./types";

export function parseStatement(
  fileName: string,
  content: string,
  opts?: { invertSign?: boolean },
): ParseResult {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".ofx") || content.includes("<STMTTRN>") || content.includes("<stmttrn>")) {
    return parseOfx(content, opts);
  }
  return parseCsv(content, opts);
}
