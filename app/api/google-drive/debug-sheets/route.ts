import { requireSession } from '@/lib/session';
import { getGoogleSheetId } from '@/lib/sheets';
import { googleSheetsJson, sheetAccessError } from '@/app/api/google-drive/sheets-debug';

export const runtime = 'nodejs';

type SpreadsheetResponse = {
  properties?: { title?: string };
  sheets?: Array<{
    properties?: {
      title?: string;
      sheetId?: number;
    };
  }>;
};

export async function GET() {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const spreadsheetId = getGoogleSheetId();

  console.log('[Sheets debug] GOOGLE_SHEET_ID:', spreadsheetId);
  console.log('[Sheets debug] Google API method: spreadsheets.get');

  const params = new URLSearchParams({
    fields: 'properties.title,sheets.properties.title,sheets.properties.sheetId'
  });
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?${params.toString()}`;
  const result = await googleSheetsJson<SpreadsheetResponse>(url, session.accessToken);
  if ('error' in result) return Response.json({ error: sheetAccessError(result.error) }, { status: result.error.status });

  return Response.json({
    title: result.data.properties?.title ?? '',
    tabs: (result.data.sheets ?? []).map((sheet) => ({
      name: sheet.properties?.title ?? '',
      id: sheet.properties?.sheetId ?? null
    }))
  });
}
