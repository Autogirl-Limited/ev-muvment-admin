/**
 * Dependency-free CSV and Excel (.xlsx) writers for client-side exports.
 *
 * Cells are typed so each format can do the right thing: numbers stay numeric
 * in Excel (sortable, summable), dates become real Excel dates, and text is
 * guarded against spreadsheet formula injection.
 */

export type Cell =
  | { kind: "text"; value: string | null | undefined }
  | { kind: "number"; value: number | null | undefined; format?: "money" | "integer" }
  | { kind: "date"; value: string | null | undefined };

export interface Sheet {
  name: string;
  header: string[];
  rows: Cell[][];
  /** Character widths per column; omitted columns are sized from the header. */
  widths?: number[];
  /** Freeze the header row and add filter dropdowns to it. */
  table?: boolean;
}

/** Africa/Lagos is UTC+1 all year (no DST), so a fixed offset is exact. */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

function lagosParts(iso: string) {
  const date = new Date(new Date(iso).getTime() + LAGOS_OFFSET_MS);
  return date.toISOString().slice(0, 16).replace("T", " ");
}

/** Text starting with these is evaluated as a formula by Excel/Sheets. */
function neutralise(text: string) {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function textOf(cell: Cell): string {
  if (cell.value === null || cell.value === undefined || cell.value === "") return "";
  if (cell.kind === "date") return lagosParts(cell.value);
  if (cell.kind === "number") return cell.format === "money" ? cell.value.toFixed(2) : String(cell.value);
  return neutralise(cell.value);
}

// ---------------------------------------------------------------- CSV

function csvField(text: string) {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(sheet: Sheet) {
  const lines = [sheet.header.map(csvField).join(","), ...sheet.rows.map((row) => row.map((cell) => csvField(textOf(cell))).join(","))];
  // BOM so Excel opens UTF-8 (₦, accented names) correctly; CRLF per RFC 4180.
  return new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
}

// ---------------------------------------------------------------- XLSX

function xml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Control characters other than tab/newline are invalid in XML 1.0.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function columnName(index: number) {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

/** Style ids, matching the cellXfs order in STYLES below. */
const STYLE = { header: 1, money: 2, integer: 3, date: 4, wrap: 5, label: 6 } as const;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd hh:mm"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEEF2F6"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function cellXml(cell: Cell, ref: string) {
  if (cell.value === null || cell.value === undefined || cell.value === "") return "";
  if (cell.kind === "number") {
    if (!Number.isFinite(cell.value)) return "";
    return `<c r="${ref}" s="${cell.format === "integer" ? STYLE.integer : STYLE.money}"><v>${cell.value}</v></c>`;
  }
  if (cell.kind === "date") {
    // Excel serial date in Lagos wall-clock time (1970-01-01 is serial 25569).
    const serial = (new Date(cell.value).getTime() + LAGOS_OFFSET_MS) / 86_400_000 + 25569;
    return `<c r="${ref}" s="${STYLE.date}"><v>${serial}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(neutralise(cell.value))}</t></is></c>`;
}

function sheetXml(sheet: Sheet) {
  const lastCol = columnName(Math.max(0, sheet.header.length - 1));
  const lastRow = sheet.rows.length + 1;
  const widths = sheet.header.map((label, index) => sheet.widths?.[index] ?? Math.max(10, label.length + 4));
  const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const headerStyle = sheet.table ? STYLE.header : STYLE.label;
  const header = `<row r="1">${sheet.header
    .map((label, index) => `<c r="${columnName(index)}1" t="inlineStr" s="${headerStyle}"><is><t>${xml(label)}</t></is></c>`)
    .join("")}</row>`;
  const body = sheet.rows
    .map((row, rowIndex) => `<row r="${rowIndex + 2}">${row.map((cell, colIndex) => cellXml(cell, `${columnName(colIndex)}${rowIndex + 2}`)).join("")}</row>`)
    .join("");
  const pane = sheet.table
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const filter = sheet.table && sheet.rows.length ? `<autoFilter ref="A1:${lastCol}${lastRow}"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pane}<cols>${cols}</cols><sheetData>${header}${body}</sheetData>${filter}</worksheet>`;
}

/** Excel sheet names: max 31 chars, none of []:*?/\ */
function sheetName(name: string) {
  return name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Sheet";
}

export function toXlsx(sheets: Sheet[]) {
  const files: Array<[string, string]> = [
    [
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
        .map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join("")}</Types>`,
    ],
    [
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
        .map((sheet, index) => `<sheet name="${xml(sheetName(sheet.name))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
        .join("")}</sheets>${sheets.some((sheet) => sheet.table && sheet.rows.length) ? `<definedNames>${sheets
        .map((sheet, index) =>
          sheet.table && sheet.rows.length
            ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${index}" hidden="1">'${xml(sheetName(sheet.name))}'!$A$1:$${columnName(sheet.header.length - 1)}$${sheet.rows.length + 1}</definedName>`
            : "",
        )
        .join("")}</definedNames>` : ""}</workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`)
        .join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    ["xl/styles.xml", STYLES],
    ...sheets.map((sheet, index): [string, string] => [`xl/worksheets/sheet${index + 1}.xml`, sheetXml(sheet)]),
  ];
  return new Blob([zip(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// ---------------------------------------------------------------- ZIP (stored, no compression)

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files: Array<[string, string]>) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const [path, content] of files) {
    const name = encoder.encode(path);
    const data = encoder.encode(content);
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // stored
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);

    const entry = new Uint8Array(46 + name.length);
    const cv = new DataView(entry.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    entry.set(name, 46);

    chunks.push(local, data);
    central.push(entry);
    offset += local.length + data.length;
  }

  const centralSize = central.reduce((sum, entry) => sum + entry.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...chunks, ...central, end]);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next tick: some browsers start the download asynchronously.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
