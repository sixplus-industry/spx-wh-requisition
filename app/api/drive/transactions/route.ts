import { requireSession } from '@/lib/session';
import { getGoogleSheetId } from '@/lib/sheets';
import { googleSheetsJson, sheetAccessError, type GoogleApiError } from '@/app/api/google-drive/sheets-debug';
import { readSheetValues } from '@/lib/sheet-values';

export const runtime = 'nodejs';

const TRANSACTION_RANGE = 'Transaction!A:P';
const RESTRICTIONS_RANGE = 'Restrictions!A:H';

type TransactionPayload = {
  dateRequested?: string;
  line?: string;
  employeeNo?: string;
  name?: string;
  accessoryType?: string;
  item?: string;
  size?: string;
  sp?: string;
  style?: string;
  inlineDate?: string;
  orderQty?: number | string;
  actualQty?: number;
  status?: string;
  detailedRemark?: string;
  wbStatus?: string;
  wbRemarks?: string;
};

type ValuesResponse = {
  values?: string[][];
};

type UpdateResponse = {
  updatedRange?: string;
  updatedRows?: number;
};

type ClearResponse = {
  clearedRange?: string;
};

function cell(value: unknown) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function rowValues(transaction: TransactionPayload) {
  return [
    cell(transaction.dateRequested),
    cell(transaction.line),
    cell(transaction.employeeNo),
    cell(transaction.name),
    cell(transaction.accessoryType),
    cell(transaction.item),
    cell(transaction.size),
    cell(transaction.sp),
    cell(transaction.style),
    cell(transaction.inlineDate),
    cell(transaction.orderQty),
    cell(transaction.actualQty),
    cell(transaction.status),
    cell(transaction.detailedRemark),
    cell(transaction.wbStatus),
    cell(transaction.wbRemarks)
  ];
}

function transactionFromRow(row: string[], sheetRow: number) {
  return {
    sheetRow,
    dateRequested: cell(row[0]),
    line: cell(row[1]),
    employeeNo: cell(row[2]),
    name: cell(row[3]),
    accessoryType: cell(row[4]),
    item: cell(row[5]),
    size: cell(row[6]),
    sp: cell(row[7]),
    style: cell(row[8]),
    inlineDate: cell(row[9]),
    orderQty: cell(row[10]),
    actualQty: cell(row[11]),
    status: cell(row[12]),
    detailedRemark: cell(row[13]),
    wbStatus: cell(row[14]),
    wbRemarks: cell(row[15])
  };
}

function normalizeEmployeeNo(value?: string) {
  const normalized = String(value ?? '').trim().replace(/\s+/g, '');
  return normalized.replace(/^0+/, '') || normalized;
}

function restrictedEmployeeSet(values: string[][] = []) {
  return new Set(
    values
      .slice(1)
      .map((row) => normalizeEmployeeNo(row[0]))
      .filter(Boolean)
  );
}

async function readRestrictedEmployees(spreadsheetId: string, accessToken: string): Promise<{ data: Set<string> } | { error: GoogleApiError }> {
  const result = await readSheetValues(spreadsheetId, RESTRICTIONS_RANGE, accessToken, 'Restrictions lookup');
  if ('error' in result) return { error: result.error };
  return { data: restrictedEmployeeSet(result.data.values) };
}

function protectedValueChanged(current: string, next: unknown) {
  return String(current ?? '').trim() !== String(next ?? '').trim();
}

function nextTransactionRow(values: string[][] = []) {
  const lastUsedIndex = values.reduce((last, row, index) => (
    row.some((value) => String(value ?? '').trim()) ? index : last
  ), 0);
  return Math.max(lastUsedIndex + 2, 2);
}

function deleteCredentialsOk(username?: string, password?: string) {
  const expectedUser = process.env.TRANSACTION_DELETE_USER;
  const expectedPassword = process.env.TRANSACTION_DELETE_PASSWORD;
  const allowedUsers = new Set([expectedUser, 'spx_wh'].filter(Boolean));
  if (!expectedPassword) return false;
  return Boolean(username && allowedUsers.has(username) && password === expectedPassword);
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const spreadsheetId = getGoogleSheetId();

  const body = await req.json().catch(() => ({})) as { transaction?: TransactionPayload };
  if (!body.transaction) return Response.json({ error: 'transaction is required' }, { status: 400 });

  console.log('[Transaction write] GOOGLE_SHEET_ID:', spreadsheetId);
  console.log('[Transaction write] Google Sheets read range:', TRANSACTION_RANGE);
  console.log('[Transaction write] Google API method: spreadsheets.values.get');

  const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(TRANSACTION_RANGE)}`;
  const valuesResult = await googleSheetsJson<ValuesResponse>(valuesUrl, session.accessToken);
  if ('error' in valuesResult) {
    return Response.json({ error: sheetAccessError(valuesResult.error) }, { status: valuesResult.error.status });
  }

  const sheetRow = nextTransactionRow(valuesResult.data.values);
  const writeRange = `Transaction!A${sheetRow}:P${sheetRow}`;
  console.log('[Transaction write] Google Sheets write range:', writeRange);
  console.log('[Transaction write] Google API method: spreadsheets.values.update');

  const params = new URLSearchParams({ valueInputOption: 'USER_ENTERED' });
  const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(writeRange)}?${params.toString()}`;
  const result = await googleSheetsJson<UpdateResponse>(updateUrl, session.accessToken, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [rowValues(body.transaction)] })
  });

  if ('error' in result) {
    return Response.json({ error: sheetAccessError(result.error) }, { status: result.error.status });
  }

  return Response.json({ ok: true, updatedRange: result.data.updatedRange ?? null, sheetRow });
}

function isAllReceived(value?: string) {
  return String(value ?? '').trim().toLowerCase() === 'all received';
}

export async function GET(req: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const spreadsheetId = getGoogleSheetId();

  console.log('[Transaction list] GOOGLE_SHEET_ID:', spreadsheetId);
  console.log('[Transaction list] Google Sheets range:', TRANSACTION_RANGE);
  console.log('[Transaction list] Google API method: spreadsheets.values.get');

  const result = await readSheetValues(spreadsheetId, TRANSACTION_RANGE, session.accessToken, 'Transaction list');
  if ('error' in result) {
    return Response.json({ error: sheetAccessError(result.error) }, { status: result.error.status });
  }

  const includeCompleted = new URL(req.url).searchParams.get('includeCompleted') === '1';
  const restrictedResult = await readRestrictedEmployees(spreadsheetId, session.accessToken);
  if ('error' in restrictedResult) {
    return Response.json({ error: sheetAccessError(restrictedResult.error) }, { status: restrictedResult.error.status });
  }

  const restrictedEmployees = restrictedResult.data;
  const rows = (result.data.values ?? [])
    .slice(1)
    .map((row, index) => {
      const transaction = transactionFromRow(row, index + 2);
      return {
        ...transaction,
        restricted: restrictedEmployees.has(normalizeEmployeeNo(transaction.employeeNo))
      };
    })
    .filter((row) => [
      row.dateRequested,
      row.line,
      row.employeeNo,
      row.name,
      row.accessoryType,
      row.item,
      row.size,
      row.sp,
      row.style
    ].some((value) => value.trim()))
    .filter((row) => includeCompleted || !isAllReceived(row.wbStatus));

  return Response.json({ transactions: rows });
}

export async function PATCH(req: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const spreadsheetId = getGoogleSheetId();

  const body = await req.json().catch(() => ({})) as {
    sheetRow?: number;
    fields?: Pick<TransactionPayload, 'actualQty' | 'status' | 'detailedRemark' | 'wbStatus' | 'wbRemarks'>;
  };
  if (!body.sheetRow || body.sheetRow < 2) return Response.json({ error: 'sheetRow is required' }, { status: 400 });

  const currentRange = `Transaction!A${body.sheetRow}:P${body.sheetRow}`;
  const currentResult = await readSheetValues(spreadsheetId, currentRange, session.accessToken, 'Transaction restriction check');
  if ('error' in currentResult) {
    return Response.json({ error: sheetAccessError(currentResult.error) }, { status: currentResult.error.status });
  }
  const currentRow = transactionFromRow(currentResult.data.values?.[0] ?? [], body.sheetRow);
  const restrictedResult = await readRestrictedEmployees(spreadsheetId, session.accessToken);
  if ('error' in restrictedResult) {
    return Response.json({ error: sheetAccessError(restrictedResult.error) }, { status: restrictedResult.error.status });
  }
  const isRestricted = restrictedResult.data.has(normalizeEmployeeNo(currentRow.employeeNo));
  if (isRestricted && (
    protectedValueChanged(currentRow.actualQty, body.fields?.actualQty) ||
    protectedValueChanged(currentRow.status, body.fields?.status) ||
    protectedValueChanged(currentRow.detailedRemark, body.fields?.detailedRemark)
  )) {
    return Response.json({ error: 'This row is restricted. Actual Qty, WH Status, and Detailed Remark cannot be edited.' }, { status: 403 });
  }

  const range = `Transaction!L${body.sheetRow}:P${body.sheetRow}`;
  console.log('[Transaction update] GOOGLE_SHEET_ID:', spreadsheetId);
  console.log('[Transaction update] Google Sheets range:', range);
  console.log('[Transaction update] Google API method: spreadsheets.values.update');

  const params = new URLSearchParams({ valueInputOption: 'USER_ENTERED' });
  const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?${params.toString()}`;
  const result = await googleSheetsJson<UpdateResponse>(updateUrl, session.accessToken, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      values: [[
        cell(body.fields?.actualQty),
        cell(body.fields?.status),
        cell(body.fields?.detailedRemark),
        cell(body.fields?.wbStatus),
        cell(body.fields?.wbRemarks)
      ]]
    })
  });

  if ('error' in result) {
    return Response.json({ error: sheetAccessError(result.error) }, { status: result.error.status });
  }

  return Response.json({ ok: true, updatedRange: result.data.updatedRange ?? null });
}

export async function DELETE(req: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const spreadsheetId = getGoogleSheetId();

  const body = await req.json().catch(() => ({})) as {
    sheetRow?: number;
    username?: string;
    password?: string;
  };
  if (!deleteCredentialsOk(body.username, body.password)) {
    return Response.json({ error: 'Invalid delete user or password.' }, { status: 403 });
  }
  if (!body.sheetRow || body.sheetRow < 2) return Response.json({ error: 'sheetRow is required' }, { status: 400 });

  const range = `Transaction!A${body.sheetRow}:P${body.sheetRow}`;
  console.log('[Transaction delete] GOOGLE_SHEET_ID:', spreadsheetId);
  console.log('[Transaction delete] Google Sheets range:', range);
  console.log('[Transaction delete] Google API method: spreadsheets.values.clear');

  const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`;
  const result = await googleSheetsJson<ClearResponse>(clearUrl, session.accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });

  if ('error' in result) {
    return Response.json({ error: sheetAccessError(result.error) }, { status: result.error.status });
  }

  return Response.json({ ok: true, clearedRange: result.data.clearedRange ?? null });
}
