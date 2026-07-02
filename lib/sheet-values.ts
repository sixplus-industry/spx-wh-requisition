import * as XLSX from 'xlsx';
import { googleSheetsJson, type GoogleJsonResult } from '@/app/api/google-drive/sheets-debug';

export type ValuesResponse = {
  values?: string[][];
};

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

async function sharedSheetExportRows(spreadsheetId: string, range: string): Promise<GoogleJsonResult<ValuesResponse>> {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`, {
    headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return {
      error: {
        message: detail || `Shared Google Sheet export failed with ${res.status}`,
        status: res.status,
        code: res.status
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

  console.warn(`[${logPrefix}] Google Sheets API read failed; trying shared XLSX export fallback.`, {
    status: result.error.status,
    code: result.error.code,
    message: result.error.message
  });

  return sharedSheetExportRows(spreadsheetId, range);
}
