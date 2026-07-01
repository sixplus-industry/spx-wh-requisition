import * as XLSX from 'xlsx';

export type TransactionRow = {
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
  orderQty?: number;
  actualQty?: number;
  status?: string;
  detailedRemark?: string;
  wbStatus?: string;
};

export type LineStationData = {
  lines?: Array<Record<string, unknown>>;
  stations?: Array<Record<string, unknown>>;
  transactions?: TransactionRow[];
};

const headers = ['Date Requested','Line','Employee #','Name','Accessory Type','Items','Size','SP #','Style','Inline Date','Order Qty','Actual Qty','Status','Detailed Remark','WB Status'];

function transactionRows(rows: TransactionRow[] = []) {
  const source = rows.length ? rows : [{} as TransactionRow];
  return source.map((r) => ({
    'Date Requested': r.dateRequested ?? '',
    Line: r.line ?? '',
    'Employee #': r.employeeNo ?? '',
    Name: r.name ?? '',
    'Accessory Type': r.accessoryType ?? '',
    Items: r.item ?? '',
    Size: r.size ?? '',
    'SP #': r.sp ?? '',
    Style: r.style ?? '',
    'Inline Date': r.inlineDate ?? '',
    'Order Qty': r.orderQty ?? '',
    'Actual Qty': r.actualQty ?? '',
    Status: r.status ?? '',
    'Detailed Remark': r.detailedRemark ?? '',
    'WB Status': r.wbStatus ?? ''
  }));
}

export function createWorkbook(data: LineStationData = {}) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(transactionRows(data.transactions), { header: headers });
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.lines?.length ? data.lines : [{ line: '', section: '', station: '' }]), 'Lines');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.stations?.length ? data.stations : [{ station: '', line: '', description: '' }]), 'Stations');
  return wb;
}

export function workbookBuffer(data: LineStationData = {}) {
  return XLSX.write(createWorkbook(data), { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function parseWorkbook(buffer: Buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheets: Record<string, unknown[]> = {};
  wb.SheetNames.forEach((name) => {
    sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' });
  });
  return sheets;
}
