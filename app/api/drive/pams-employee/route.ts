import { requireSession } from '@/lib/session';
import { getGoogleSheetId } from '@/lib/sheets';
import { sheetAccessError } from '@/app/api/google-drive/sheets-debug';
import { readSheetValues } from '@/lib/sheet-values';

export const runtime = 'nodejs';

const PAMS_RANGE = 'PAMS';

const employeeKeys = ['employee #', 'employee#', 'employee no', 'employee no.', 'employee id', 'emp #', 'emp no', 'id'];
const sectionKeys = ['section', 'line', 'department', 'dept'];
const nameKeys = ['name', 'employee name', 'full name'];

function normalizeHeader(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeEmployeeNo(value: string) {
  return value.trim().replace(/\s+/g, '').toLowerCase();
}

function formatEmployeeNo(value: string) {
  const trimmed = value.trim().replace(/\s+/g, '');
  return /^\d+$/.test(trimmed) ? trimmed.padStart(6, '0') : trimmed;
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

  const valuesResult = await readSheetValues(spreadsheetId, PAMS_RANGE, session.accessToken, 'PAMS lookup');
  if ('error' in valuesResult) return Response.json({ error: sheetAccessError(valuesResult.error) }, { status: valuesResult.error.status });

  const [headerRow, ...rows] = valuesResult.data.values ?? [];
  if (!headerRow || rows.length === 0) return Response.json({ error: 'PAMS sheet was not found or is empty.' }, { status: 404 });

  const headers = headerRow.map(normalizeHeader);
  const wantedEmployeeNo = normalizeEmployeeNo(employeeNo);
  const match = rows.find((row) => normalizeEmployeeNo(cell(row, headers, employeeKeys)) === wantedEmployeeNo);
  if (!match) return Response.json({ error: 'Employee # was not found in PAMS.' }, { status: 404 });

  return Response.json({
    employee: {
      employeeNo: formatEmployeeNo(cell(match, headers, employeeKeys) || employeeNo.trim()),
      section: cell(match, headers, sectionKeys),
      name: cell(match, headers, nameKeys)
    }
  });
}
