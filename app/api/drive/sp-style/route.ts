import { requireSession } from '@/lib/session';
import { getGoogleSheetId } from '@/lib/sheets';
import { sheetAccessError } from '@/app/api/google-drive/sheets-debug';
import { readSheetValues } from '@/lib/sheet-values';

export const runtime = 'nodejs';

const SCHEDULE_RANGE = 'Schedule!A:AH';
const LINE_COLUMN_INDEX = 0;
const SP_COLUMN_INDEX = 4;
const STYLE_COLUMN_INDEX = 5;
const ORDER_QTY_COLUMN_INDEX = 14;
const INLINE_DATE_COLUMN_INDEX = 20;

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
  const match = (valuesResult.data.values ?? []).find((row) => normalize(String(row[SP_COLUMN_INDEX] ?? '')) === wantedSp);
  if (!match) return Response.json({ error: 'SP # was not found in Schedule.' }, { status: 404 });

  return Response.json({
    line: String(match[LINE_COLUMN_INDEX] ?? '').trim(),
    sp: String(match[SP_COLUMN_INDEX] ?? '').trim() || sp.trim(),
    style: String(match[STYLE_COLUMN_INDEX] ?? '').trim(),
    orderQty: String(match[ORDER_QTY_COLUMN_INDEX] ?? '').trim(),
    inlineDate: String(match[INLINE_DATE_COLUMN_INDEX] ?? '').trim()
  });
}
