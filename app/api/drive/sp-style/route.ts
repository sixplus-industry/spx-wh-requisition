import { requireSession } from '@/lib/session';
import { getGoogleSheetId } from '@/lib/sheets';
import { sheetAccessError } from '@/app/api/google-drive/sheets-debug';
import { readSheetValues } from '@/lib/sheet-values';

export const runtime = 'nodejs';

const SCHEDULE_RANGE = 'Schedule!C:AH';

function normalize(value: string) {
  return value.trim().replace(/\s+/g, '').toLowerCase();
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams.get('sp') ?? '';
  if (!sp.trim()) return Response.json({ error: 'sp is required' }, { status: 400 });

  const session = await requireSession();
  if (session instanceof Response) return session;

  const spreadsheetId = getGoogleSheetId();

  console.log('[SP lookup] GOOGLE_SHEET_ID:', spreadsheetId);
  console.log('[SP lookup] Google Sheets range:', SCHEDULE_RANGE);
  console.log('[SP lookup] Google API method: spreadsheets.values.get');

  const valuesResult = await readSheetValues(spreadsheetId, SCHEDULE_RANGE, session.accessToken, 'SP lookup');
  if ('error' in valuesResult) return Response.json({ error: sheetAccessError(valuesResult.error) }, { status: valuesResult.error.status });

  const wantedSp = normalize(sp);
  const match = (valuesResult.data.values ?? []).find((row) => normalize(String(row[5] ?? '')) === wantedSp);
  if (!match) return Response.json({ error: 'SP # was not found in Schedule.' }, { status: 404 });

  return Response.json({
    line: String(match[0] ?? '').trim(),
    sp: String(match[5] ?? '').trim() || sp.trim(),
    style: String(match[8] ?? '').trim(),
    orderQty: String(match[23] ?? '').trim(),
    inlineDate: String(match[31] ?? '').trim()
  });
}
