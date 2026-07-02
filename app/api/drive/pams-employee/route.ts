import { requireSession } from '@/lib/session';
import { getGoogleSheetId } from '@/lib/sheets';
import { googleSheetsJson, sheetAccessError } from '@/app/api/google-drive/sheets-debug';

export const runtime = 'nodejs';

const PAMS_RANGE = 'PAMS';

type ValuesResponse = {
  values?: string[][];
};

const employeeKeys = ['employee #', 'employee#', 'employee no', 'employee no.', 'employee id', 'emp #', 'emp no', 'id'];
const sectionKeys = ['section', 'line', 'department', 'dept'];
const nameKeys = ['name', 'employee name', 'full name'];

function normalizeHeader(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeEmployeeNo(value: string) {
  return value.trim().replace(/\s+/g, '').toLowerCase();
}

function cell(row: string[], headers: string[], aliases: string[]) {
  const index = headers.findIndex((header) => aliases.includes(header));
  return index >= 0 ? String(row[index] ?? '').trim() : '';
}

export async function GET(req: Request) {
  const employeeNo = new URL(req.url).searchParams.get('employeeNo') ?? '';
  if (!employeeNo.trim()) return Response.json({ error: 'employeeNo is required' }, { status: 400 });

  const session = await requireSession();
  if (session instanceof Response) return session;

  const spreadsheetId = getGoogleSheetId();

  console.log('[PAMS lookup] GOOGLE_SHEET_ID:', spreadsheetId);
  console.log('[PAMS lookup] Google Sheets range:', PAMS_RANGE);
  console.log('[PAMS lookup] Google API method: spreadsheets.values.get');

  const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(PAMS_RANGE)}`;
  const valuesResult = await googleSheetsJson<ValuesResponse>(valuesUrl, session.accessToken);
  if ('error' in valuesResult) return Response.json({ error: sheetAccessError(valuesResult.error) }, { status: valuesResult.error.status });

  const [headerRow, ...rows] = valuesResult.data.values ?? [];
  if (!headerRow || rows.length === 0) return Response.json({ error: 'PAMS sheet was not found or is empty.' }, { status: 404 });

  const headers = headerRow.map(normalizeHeader);
  const wantedEmployeeNo = normalizeEmployeeNo(employeeNo);
  const match = rows.find((row) => normalizeEmployeeNo(cell(row, headers, employeeKeys)) === wantedEmployeeNo);
  if (!match) return Response.json({ error: 'Employee # was not found in PAMS.' }, { status: 404 });

  return Response.json({
    employee: {
      employeeNo: cell(match, headers, employeeKeys) || employeeNo.trim(),
      section: cell(match, headers, sectionKeys),
      name: cell(match, headers, nameKeys)
    }
  });
}
