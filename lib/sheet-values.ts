import * as XLSX from 'xlsx';
import { googleSheetsJson, type GoogleJsonResult } from '@/app/api/google-drive/sheets-debug';

export type ValuesResponse = {
  values?: string[][];
};

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function columnIndex(column: string) {
  return column.toUpperCase().split('').reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function parseRange(range: string) {
  const [sheetPart, columnPart = ''] = range.includes('!') ? range.split('!') : [range, ''];
  const sheetName = sheetPart.replace(/^'|'$/g, '').replace(/''/g, "'");
  const columnMatch = columnPart.match(/^([A-Z]+)?(?::([A-Z]+)?)?/i);
  const startColumn = columnMatch?.[1] ? columnIndex(columnMatch[1]) : undefined;
  const endColumn = columnMatch?.[2] ? columnIndex(columnMatch[2]) : startColumn;
  return { sheetName, startColumn, endColumn };
}

async function driveExportRows(spreadsheetId: string, range: string, accessToken: string): Promise<GoogleJsonResult<ValuesResponse>> {
  const params = new URLSearchParams({ mimeType: XLSX_MIME });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}/export?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const detail = await res.json().catch(async () => ({ error: { message: await res.text().catch(() => '') } }));
    const apiError = detail?.error ?? {};
    return {
      error: {
        message: String(apiError.message || `Google Drive export failed with ${res.status}`),
        status: res.status,
        code: typeof apiError.code === 'number' ? apiError.code : undefined
      }
    };
  }

  const workbook = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: 'buffer' });
  const { sheetName, startColumn, endColumn } = parseRange(range);
  const workbookSheetName = workbook.SheetNames.find((name) => name.toLowerCase() === sheetName.toLowerCase());
  if (!workbookSheetName) {
    return { error: { message: `${sheetName} sheet was not found in SPX WH Request.`, status: 404, code: 404 } };
  }

  const sheet = workbook.Sheets[workbookSheetName];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
    raw: false
  });

  const values = rows.map((row) => {
    const stringRow = row.map((value) => String(value ?? ''));
    if (startColumn === undefined) return stringRow;
    return stringRow.slice(startColumn, endColumn === undefined ? undefined : endColumn + 1);
  });

  return { data: { values } };
}

export async function readSheetValues(spreadsheetId: string, range: string, accessToken: string, logPrefix: string) {
  const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const result = await googleSheetsJson<ValuesResponse>(valuesUrl, accessToken);
  if (!('error' in result)) return result;

  console.warn(`[${logPrefix}] Google Sheets API read failed; trying Drive XLSX export fallback.`, {
    status: result.error.status,
    code: result.error.code,
    message: result.error.message
  });

  return driveExportRows(spreadsheetId, range, accessToken);
}
