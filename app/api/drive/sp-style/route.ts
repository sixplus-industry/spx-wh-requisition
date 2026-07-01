import { requireSession } from '@/lib/session';
import { googleSheetsJson, sheetAccessError } from '@/app/api/google-drive/sheets-debug';

export const runtime = 'nodejs';

const SCHEDULE_RANGE = 'Schedule!C:AH';

type ValuesResponse = {
  values?: string[][];
};

function normalize(value: string) {
  return value.trim().replace(/\s+/g, '').toLowerCase();
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams.get('sp') ?? '';
  if (!sp.trim()) return Response.json({ error: 'sp is required' }, { status: 400 });

  const session = await requireSession();
  if (session instanceof Response) return session;

  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) return Response.json({ error: 'GOOGLE_SHEET_ID is not configured.' }, { status: 500 });

  console.log('[SP lookup] GOOGLE_SHEET_ID:', spreadsheetId);
  console.log('[SP lookup] Google Sheets range:', SCHEDULE_RANGE);
  console.log('[SP lookup] Google API method: spreadsheets.values.get');

  const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(SCHEDULE_RANGE)}`;
  const valuesResult = await googleSheetsJson<ValuesResponse>(valuesUrl, session.accessToken);
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
