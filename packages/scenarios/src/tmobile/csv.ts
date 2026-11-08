/**
 * Minimal RFC-4180-ish CSV parser: quoted fields, escaped quotes (""),
 * embedded commas/newlines, CRLF or LF, optional BOM. Returns rows of strings.
 */
export function parseCsv(input: string): string[][] {
  const normalized = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const text = normalized.charCodeAt(0) === 0xfeff ? normalized.slice(1) : normalized;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && field === "") inQuotes = true;
    else if (ch === ",") endField();
    else if (ch === "\n") endRow();
    else field += ch;
  }
  // Flush the last row unless the file ended on a newline.
  if (field !== "" || row.length > 0) endRow();
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/** Parse CSV with a header row into records keyed by header name. */
export function parseCsvRecords(input: string): Array<Record<string, string>> {
  const [header, ...rows] = parseCsv(input);
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ""])));
}
