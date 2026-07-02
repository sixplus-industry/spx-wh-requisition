import { requireSession } from '@/lib/session';
import { getGoogleSheetId } from '@/lib/sheets';
import { sheetAccessError } from '@/app/api/google-drive/sheets-debug';
import { readSheetValues } from '@/lib/sheet-values';

export const runtime = 'nodejs';

const ITEMS_RANGE = 'Items!A:B';

function normalize(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function accessoryTypeMatches(sheetValue: string, selectedValue: string) {
  const sheetType = normalize(sheetValue).replace(/\s+accessories$/, '');
  const selectedType = normalize(selectedValue).replace(/\s+accessories$/, '');
  return sheetType === selectedType || sheetType.includes(selectedType) || selectedType.includes(sheetType);
}

function isHeader(value: string) {
  const normalized = normalize(value);
  return normalized === 'items' || normalized === 'item' || normalized === 'accessory type' || normalized === 'type';
}

export async function GET(req: Request) {
  const accessoryType = new URL(req.url).searchParams.get('accessoryType') ?? '';
  if (!accessoryType.trim()) return Response.json({ error: 'accessoryType is required' }, { status: 400 });

  const session = await requireSession();
  if (session instanceof Response) return session;

  const spreadsheetId = getGoogleSheetId();

  console.log('[Items lookup] GOOGLE_SHEET_ID:', spreadsheetId);
  console.log('[Items lookup] Google Sheets range:', ITEMS_RANGE);
  console.log('[Items lookup] Google API method: spreadsheets.values.get');

  const valuesResult = await readSheetValues(spreadsheetId, ITEMS_RANGE, session.accessToken, 'Items lookup');
  if ('error' in valuesResult) return Response.json({ error: sheetAccessError(valuesResult.error) }, { status: valuesResult.error.status });

  let currentType = '';
  const items: string[] = [];
  for (const row of valuesResult.data.values ?? []) {
    const typeCell = String(row[0] ?? '').trim();
    const itemCell = String(row[1] ?? '').trim();
    if (typeCell && !isHeader(typeCell)) currentType = typeCell;
    if (!itemCell || isHeader(itemCell)) continue;
    if (accessoryTypeMatches(typeCell || currentType, accessoryType)) items.push(itemCell);
  }

  console.log('[Items lookup] Selected accessory type:', accessoryType);
  console.log('[Items lookup] Returned item count:', items.length);

  return Response.json({ items: Array.from(new Set(items)) });
}
