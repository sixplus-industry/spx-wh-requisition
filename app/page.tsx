'use client';

import { useEffect, useMemo, useState } from 'react';

type User = { name?: string; email?: string; picture?: string } | null;
type DriveFile = { id: string; name: string; mimeType: string; modifiedTime?: string; webViewLink?: string };
type Transaction = {
  sheetRow?: number | null;
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

type ImportSheets = Record<string, unknown[]>;

const whStatusOptions = ['Not Yet Arrived', 'Preparing', 'Ready for Pick Up'];
const wbStatusOptions = ['Partial Received', 'All Received'];
const tableColumnWidths = [126, 68, 118, 128, 154, 116, 64, 118, 128, 112, 104, 104, 164, 228, 176, 228];
const deleteColumnWidth = 108;

function errorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== 'object') return fallback;
  const error = (data as { error?: unknown }).error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return fallback;
}

function padTime(value: number) {
  return String(value).padStart(2, '0');
}

function requestedDateTimeParts(value?: string) {
  const raw = value ?? '';
  const normalized = raw.replace('T', ' ').trim();
  const [date = '', time = ''] = normalized.split(/\s+/);
  return { date, time };
}

function formatRequestedDateTime(date: Date) {
  const yyyy = date.getFullYear();
  const mm = padTime(date.getMonth() + 1);
  const dd = padTime(date.getDate());
  const hh = padTime(date.getHours());
  const min = padTime(date.getMinutes());
  const ss = padTime(date.getSeconds());
  return `${yyyy}-${mm}-${dd}\n${hh}:${min}:${ss}`;
}

export default function Page() {
  const [user, setUser] = useState<User>(null);
  const [employeeNo, setEmployeeNo] = useState('');
  const [section, setSection] = useState('-');
  const [name, setName] = useState('-');
  const [accessoryType, setAccessoryType] = useState<'Sewing Accessories' | 'Packing Accessories'>('Sewing Accessories');
  const [item, setItem] = useState('');
  const [sp, setSp] = useState('');
  const [size, setSize] = useState('');
  const [style, setStyle] = useState('-');
  const [scheduleLine, setScheduleLine] = useState('');
  const [scheduleOrderQty, setScheduleOrderQty] = useState('');
  const [scheduleInlineDate, setScheduleInlineDate] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [message, setMessage] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('All Accessory Types');
  const [spFilter, setSpFilter] = useState('');
  const [requesterReady, setRequesterReady] = useState(false);
  const [accessoryUnlocked, setAccessoryUnlocked] = useState(false);
  const [loadingRequester, setLoadingRequester] = useState(false);
  const [itemOptions, setItemOptions] = useState<string[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingStyle, setLoadingStyle] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [savingRequest, setSavingRequest] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<Transaction | null>(null);
  const [duplicateMessage, setDuplicateMessage] = useState('');
  const [deleteAuthorized, setDeleteAuthorized] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteUser, setDeleteUser] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deletingRow, setDeletingRow] = useState<number | null>(null);
  const accessoryComplete = accessoryUnlocked && Boolean(item && sp.trim() && size.trim() && style && style !== '-' && scheduleLine && !loadingStyle && !savingRequest);

  useEffect(() => {
    fetch('/api/auth/me').then(async (res) => {
      if (res.ok) {
        setUser((await res.json()).user);
        void loadTransactionsFromSheet(true);
      }
    }).catch(() => undefined);
    if (window.location.search.includes('auth=oauth_config_missing')) {
      setMessage('Google OAuth is not configured in Vercel. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, and SESSION_SECRET.');
      window.history.replaceState(null, '', window.location.pathname);
    }
    const cached = localStorage.getItem('spx-wh-requisition-transactions');
    if (cached) setTransactions(JSON.parse(cached));
    if (process.env.NODE_ENV !== 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined);
      if ('caches' in window) {
        caches.keys()
          .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
          .catch(() => undefined);
      }
    }
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('spx-wh-requisition-transactions', JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    if (!accessoryUnlocked) {
      setItemOptions([]);
      setItem('');
      setLoadingItems(false);
      return;
    }

    let cancelled = false;
    setLoadingItems(true);
    setItem('');

    fetch(`/api/drive/items?accessoryType=${encodeURIComponent(accessoryType)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setLoadingItems(false);
        if (res.status === 401) {
          setItemOptions([]);
          setMessage('Sign in with Google before loading Items.');
          return;
        }
        if (!res.ok) {
          setItemOptions([]);
          setMessage(errorMessage(data, 'Items lookup failed.'));
          return;
        }
        setItemOptions(Array.isArray(data.items) ? data.items : []);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadingItems(false);
        setItemOptions([]);
        setMessage('Items lookup failed.');
      });

    return () => {
      cancelled = true;
    };
  }, [accessoryType, accessoryUnlocked]);

  useEffect(() => {
    const trimmedSp = sp.trim();
    if (!accessoryUnlocked || !trimmedSp) {
      setStyle('-');
      setScheduleLine('');
      setScheduleOrderQty('');
      setScheduleInlineDate('');
      setLoadingStyle(false);
      return;
    }

    let cancelled = false;
    setStyle('-');
    setScheduleLine('');
    setScheduleOrderQty('');
    setScheduleInlineDate('');
    setLoadingStyle(true);

    const timer = window.setTimeout(async () => {
      const res = await fetch(`/api/drive/sp-style?sp=${encodeURIComponent(trimmedSp)}`);
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;

      setLoadingStyle(false);
      if (res.status === 401) {
        setMessage('Sign in with Google before loading Style from Schedule.');
        return;
      }
      if (!res.ok) {
        setMessage(errorMessage(data, 'SP # lookup failed.'));
        return;
      }
      setScheduleLine(data.line || '');
      setStyle(data.style || '-');
      setScheduleOrderQty(data.orderQty || '');
      setScheduleInlineDate(data.inlineDate || '');
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [sp, accessoryUnlocked]);

  useEffect(() => {
    const trimmedEmployeeNo = employeeNo.trim();
    if (!trimmedEmployeeNo) {
      setSection('-');
      setName('-');
      setRequesterReady(false);
      setAccessoryUnlocked(false);
      setLoadingRequester(false);
      return;
    }

    let cancelled = false;
    setLoadingRequester(true);
    setRequesterReady(false);
    setAccessoryUnlocked(false);

    const timer = window.setTimeout(async () => {
      const res = await fetch(`/api/drive/pams-employee?employeeNo=${encodeURIComponent(trimmedEmployeeNo)}`);
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;

      setLoadingRequester(false);
      if (res.status === 401) {
        setSection('-');
        setName('-');
        setMessage('Sign in with Google before loading Employee # from PAMS.');
        return;
      }
      if (!res.ok) {
        setSection('-');
        setName('-');
        setMessage(errorMessage(data, 'Employee # lookup failed.'));
        return;
      }

      const loadedSection = data.employee?.section || '-';
      const loadedName = data.employee?.name || '-';
      setSection(loadedSection);
      setName(loadedName);
      setRequesterReady(Boolean(loadedSection && loadedSection !== '-' && loadedName && loadedName !== '-'));
      setMessage('Requester information loaded from PAMS.');
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [employeeNo]);

  const filtered = useMemo(() => transactions.filter((row) => {
    const dateOk = !dateFilter || requestedDateTimeParts(row.dateRequested).date === dateFilter;
    const typeOk = typeFilter === 'All Accessory Types' || row.accessoryType === typeFilter;
    const spOk = !spFilter || (row.sp ?? '').toLowerCase().includes(spFilter.toLowerCase());
    return dateOk && typeOk && spOk;
  }), [transactions, dateFilter, typeFilter, spFilter]);

  function handleEmployeeNoChange(value: string) {
    setEmployeeNo(value);
    setSection('-');
    setName('-');
    setRequesterReady(false);
    setAccessoryUnlocked(false);
  }

  function selectAccessoryType(value: 'Sewing Accessories' | 'Packing Accessories') {
    setAccessoryType(value);
    setItem('');
  }

  function handleSpChange(value: string) {
    setSp(value);
    setStyle('-');
    setScheduleLine('');
    setScheduleOrderQty('');
    setScheduleInlineDate('');
  }

  function continueRequester() {
    if (!requesterReady) {
      setMessage('Complete requester information from PAMS first.');
      return;
    }
    setAccessoryUnlocked(true);
    setMessage('Accessory request enabled.');
  }

  function normalizeForDuplicate(value?: string) {
    return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function findDuplicateRequest(source: Transaction[]) {
    const nextAccessoryType = normalizeForDuplicate(accessoryType);
    const nextItem = normalizeForDuplicate(item);
    const nextSp = normalizeForDuplicate(sp);
    const nextSize = normalizeForDuplicate(size);
    return source.find((row) => (
      normalizeForDuplicate(row.accessoryType) === nextAccessoryType &&
      normalizeForDuplicate(row.item) === nextItem &&
      normalizeForDuplicate(row.sp) === nextSp &&
      normalizeForDuplicate(row.size) === nextSize
    ));
  }

  function mapTransactionRow(row: Record<string, unknown>): Transaction {
    return {
      sheetRow: typeof row.sheetRow === 'number' ? row.sheetRow : null,
      dateRequested: String(row.dateRequested ?? ''),
      line: String(row.line ?? ''),
      employeeNo: String(row.employeeNo ?? ''),
      name: String(row.name ?? ''),
      accessoryType: String(row.accessoryType ?? ''),
      item: String(row.item ?? ''),
      size: String(row.size ?? ''),
      sp: String(row.sp ?? ''),
      style: String(row.style ?? ''),
      inlineDate: String(row.inlineDate ?? ''),
      orderQty: String(row.orderQty ?? ''),
      actualQty: row.actualQty === undefined || row.actualQty === '' ? undefined : Number(row.actualQty),
      status: String(row.status ?? ''),
      detailedRemark: String(row.detailedRemark ?? ''),
      wbStatus: String(row.wbStatus ?? ''),
      wbRemarks: String(row.wbRemarks ?? '')
    };
  }

  async function loadTransactionsFromSheet(silent = false, includeCompleted = false, updateState = true) {
    if (!silent) setLoadingTransactions(true);
    const res = await fetch(`/api/drive/transactions${includeCompleted ? '?includeCompleted=1' : ''}`);
    const data = await res.json().catch(() => ({}));
    if (!silent) setLoadingTransactions(false);
    if (!res.ok) {
      if (!silent) setMessage(errorMessage(data, 'Transaction list refresh failed.'));
      return null;
    }
    const mapped = Array.isArray(data.transactions)
      ? data.transactions.map((row: Record<string, unknown>) => mapTransactionRow(row))
      : [];
    if (updateState) setTransactions(mapped);
    if (!silent) setMessage(`Loaded ${mapped.length} shared transactions.`);
    return mapped;
  }

  async function sendRequest() {
    if (!accessoryComplete) {
      setMessage('Complete all Accessory Request fields first.');
      return;
    }
    const latestTransactions = await loadTransactionsFromSheet(true, true, false);
    const duplicate = findDuplicateRequest(latestTransactions ?? transactions);
    if (duplicate) {
      setDuplicateMessage(`DONE REQUEST BY LINE # ${duplicate.line || '-'}`);
      return;
    }
    const requestedAt = formatRequestedDateTime(new Date());
    const newTransaction: Transaction = {
      dateRequested: requestedAt,
      line: scheduleLine,
      employeeNo,
      name,
      accessoryType,
      item,
      size,
      sp,
      style,
      inlineDate: scheduleInlineDate,
      orderQty: scheduleOrderQty,
      actualQty: undefined,
      status: '',
      detailedRemark: '',
      wbStatus: '',
      wbRemarks: ''
    };

    setSavingRequest(true);
    const res = await fetch('/api/drive/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction: newTransaction })
    });
    const data = await res.json().catch(() => ({}));
    setSavingRequest(false);
    if (!res.ok) {
      setMessage(errorMessage(data, 'Transaction backup to Google Sheet failed.'));
      return;
    }

    setTransactions((prev) => [{ ...newTransaction, sheetRow: typeof data.sheetRow === 'number' ? data.sheetRow : null }, ...prev]);
    setEmployeeNo('');
    setSection('-');
    setName('-');
    setRequesterReady(false);
    setAccessoryUnlocked(false);
    setItem('');
    setSp('');
    setSize('');
    setStyle('-');
    setScheduleLine('');
    setScheduleOrderQty('');
    setScheduleInlineDate('');
    setMessage('Request added and backed up to the Transaction sheet.');
  }

  function updateTransaction(target: Transaction, patch: Partial<Transaction>) {
    const next = { ...target, ...patch };
    setTransactions((prev) => prev.map((row) => (row === target ? next : row)));
    return next;
  }

  async function syncTransactionFields(row: Transaction) {
    if (!row.sheetRow) {
      setMessage('This older local row is not linked to a Transaction sheet row yet.');
      return;
    }

    const res = await fetch('/api/drive/transactions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sheetRow: row.sheetRow,
        fields: {
          actualQty: row.actualQty,
          status: row.status ?? '',
          detailedRemark: row.detailedRemark ?? '',
          wbStatus: row.wbStatus ?? '',
          wbRemarks: row.wbRemarks ?? ''
        }
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(errorMessage(data, 'Transaction sheet update failed.'));
      return;
    }
    setMessage('Transaction sheet updated.');
  }

  function updateAndSyncTransaction(target: Transaction, patch: Partial<Transaction>) {
    const next = updateTransaction(target, patch);
    void syncTransactionFields(next);
  }

  function handleWhStatusChange(row: Transaction, value: string) {
    const patch: Partial<Transaction> = value === 'Ready for Pick Up'
      ? { status: value }
      : { status: value, wbStatus: '', wbRemarks: '' };
    updateAndSyncTransaction(row, patch);
  }

  function handleWbStatusChange(row: Transaction, value: string) {
    if (row.status !== 'Ready for Pick Up') return;
    if (value === 'All Received') {
      setPendingRemoval(row);
      return;
    }
    updateAndSyncTransaction(row, { wbStatus: value });
  }

  async function confirmRemoveTransaction() {
    if (!pendingRemoval) return;
    await syncTransactionFields({ ...pendingRemoval, wbStatus: 'All Received' });
    await loadTransactionsFromSheet(true);
    setPendingRemoval(null);
  }

  function openDeleteLogin() {
    if (deleteAuthorized) {
      setDeleteAuthorized(false);
      setMessage('Delete mode disabled.');
      return;
    }
    setDeleteUser('');
    setDeletePassword('');
    setDeleteError('');
    setDeleteModalOpen(true);
  }

  function confirmDeleteLogin() {
    if (deleteUser === 'sixplus_wh' && deletePassword === 'WH777') {
      setDeleteAuthorized(true);
      setDeleteModalOpen(false);
      setMessage('Delete mode enabled.');
      return;
    }
    setDeleteError('Invalid user or password.');
  }

  async function deleteTransaction(row: Transaction) {
    if (!deleteAuthorized || !row.sheetRow || deletingRow) return;
    setDeletingRow(row.sheetRow);
    const res = await fetch('/api/drive/transactions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetRow: row.sheetRow, username: deleteUser, password: deletePassword })
    });
    const data = await res.json().catch(() => ({}));
    setDeletingRow(null);
    if (!res.ok) {
      setMessage(errorMessage(data, 'Transaction delete failed.'));
      return;
    }
    setMessage('Transaction deleted.');
    await loadTransactionsFromSheet(true);
  }

  function whStatusClass(status?: string) {
    if (status === 'Not Yet Arrived') return 'status-not-yet';
    if (status === 'Preparing') return 'status-preparing';
    if (status === 'Ready for Pick Up') return 'status-ready';
    return '';
  }

  async function listDriveFiles() {
    const res = await fetch('/api/drive/files');
    if (!res.ok) {
      setMessage('Sign in with Google before loading Drive files.');
      return;
    }
    const data = await res.json();
    setFiles(data.files ?? []);
    setMessage('Drive Excel files loaded.');
  }

  async function importFromDrive() {
    const selected = files.find((file) => file.id === selectedFile);
    if (!selected) {
      setMessage('Choose an Excel file from Drive first.');
      return;
    }
    const res = await fetch('/api/drive/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: selected.id, mimeType: selected.mimeType })
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(errorMessage(data, 'Drive import failed.'));
      return;
    }
    const sheets = data.sheets as ImportSheets;
    const rows = (sheets.Transactions || Object.values(sheets)[0] || []) as Record<string, unknown>[];
    const mapped: Transaction[] = rows.map((row) => ({
                  dateRequested: String(row['Date Requested'] ?? ''),
      line: String(row.Line ?? ''),
      employeeNo: String(row['Employee #'] ?? ''),
      name: String(row.Name ?? ''),
      accessoryType: String(row['Accessory Type'] ?? ''),
      item: String(row.Items ?? ''),
      size: String(row.Size ?? ''),
      sp: String(row['SP #'] ?? ''),
      style: String(row.Style ?? ''),
      inlineDate: String(row['Inline Date'] ?? ''),
      orderQty: String(row['Order Qty'] ?? ''),
      actualQty: row['Actual Qty'] === undefined || row['Actual Qty'] === '' ? undefined : Number(row['Actual Qty']),
      status: String(row['WH Status'] ?? row.Status ?? ''),
      detailedRemark: String(row['Detailed Remark'] ?? ''),
      wbStatus: String(row['WB Status'] ?? ''),
      wbRemarks: String(row['WB Remarks'] ?? '')
    }));
    setTransactions(mapped);
    setMessage(`Imported ${mapped.length} rows from Drive.`);
  }

  async function exportTemplate() {
    const res = await fetch('/api/drive/export-template', { method: 'POST' });
    const data = await res.json();
    setMessage(res.ok ? `Template saved to Drive: ${data.file?.name}` : errorMessage(data, 'Template export failed.'));
  }

  async function saveToDrive(format: 'json' | 'xlsx') {
    const payload = {
      format,
      fileName: 'SPX WH Requisition Line Station Data',
      data: {
        lines: [{ line: section, section, station: 'Main' }],
        stations: [{ station: 'Main', line: section, description: 'Default station' }],
        transactions
      }
    };
    const res = await fetch('/api/drive/save-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    setMessage(res.ok ? `Saved to Drive: ${data.file?.name}` : errorMessage(data, 'Save to Drive failed.'));
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <h1>Warehouse Accessory Requisition <span>ការស្នើសុំគ្រឿងសម្ភារៈដេរពីឃ្លាំងសម្ភារៈ</span></h1>
        <div className="topbar-actions">
          <a className="google-login" href="/api/auth/login">Sign in with Google</a>
          <a href="https://docs.google.com/spreadsheets/d/1YnTR2QSU3XOl8TTKhegorso6X4oPiWBzuB52zpQFFVc/edit?gid=626660700#gid=626660700" target="_blank" rel="noreferrer">Google Drive</a>
        </div>
      </header>

      <section className="cards">
        <div className="card requester-card">
          <h2>REQUESTER INFORMATION <span>ព័ត៌មានអ្នកស្នើសុំ</span></h2>
          <div className="requester-grid">
            <label>Employee #</label>
            <input className="yellow" value={employeeNo} onChange={(e) => handleEmployeeNoChange(e.target.value)} />
            <label>Section</label>
            <input className="disabled" value={section} disabled />
            <label>Name</label>
            <input className="disabled name-input" value={name} disabled />
          </div>
          <button className="primary-button" onClick={continueRequester} disabled={loadingRequester || !requesterReady}>
            {loadingRequester ? 'LOADING...' : 'CONTINUE បន្តទៅមុខទៀត'}
          </button>
        </div>

        <div className={`card accessory-card ${accessoryUnlocked ? '' : 'locked-card'}`}>
          <h2>Accessory Request <span>ប្រភេទគ្រឿងសម្ភារៈត្រូវស្នើសុំ</span></h2>
          <div className="accessory-row top-row">
            <div className="tabs">
              <button disabled={!accessoryUnlocked} className={accessoryType === 'Sewing Accessories' ? 'active' : ''} onClick={() => selectAccessoryType('Sewing Accessories')}>Sewing Accessories</button>
              <button disabled={!accessoryUnlocked} className={accessoryType === 'Packing Accessories' ? 'active' : ''} onClick={() => selectAccessoryType('Packing Accessories')}>Packing Accessories</button>
            </div>
            <label>Items</label>
            <select disabled={!accessoryUnlocked || loadingItems} className="yellow item-select" value={item} onChange={(e) => setItem(e.target.value)}>
              <option value="">{loadingItems ? 'Loading Items...' : itemOptions.length ? 'Select Item...' : 'No items found'}</option>
              {itemOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </div>
          <div className="accessory-row input-row">
            <label>SP #</label>
            <input disabled={!accessoryUnlocked} className="yellow sp-input" value={sp} onChange={(e) => handleSpChange(e.target.value)} />
            <label>Size</label>
            <input disabled={!accessoryUnlocked} className="yellow size-input" value={size} onChange={(e) => setSize(e.target.value)} />
            <label>Style</label>
            <input className="disabled style-input" value={loadingStyle ? 'Loading...' : style} disabled />
          </div>
          <button className="primary-button" disabled={!accessoryComplete} onClick={sendRequest}>{savingRequest ? 'SAVING...' : 'SEND REQUEST បញ្ជូនការស្នើសុំ'}</button>
        </div>
      </section>

      {message && <p className="message">{message}</p>}

      <section className="transactions">
        <div className="filter-row">
          <h2>TRANSACTION LIST</h2>
          <label>Date Requested</label>
          <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          <label>Accessory Type</label>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option>All Accessory Types</option>
            <option>Sewing Accessories</option>
            <option>Packing Accessories</option>
          </select>
          <label>SP #</label>
          <input placeholder="Type SP #" value={spFilter} onChange={(e) => setSpFilter(e.target.value)} />
          <button onClick={() => { setDateFilter(''); setTypeFilter('All Accessory Types'); setSpFilter(''); }}>Clear Filters</button>
          <button className="refresh-button" onClick={() => { void loadTransactionsFromSheet(); }}>{loadingTransactions ? 'Loading...' : 'Refresh Report'}</button>
          <button className={`delete-tab ${deleteAuthorized ? 'active' : ''}`} onClick={openDeleteLogin}>Delete</button>
        </div>

        <div className="table-scroll">
          <table style={{ width: deleteAuthorized ? 2058 + deleteColumnWidth : 2058 }}>
            <colgroup>
              {tableColumnWidths.map((width, index) => <col key={index} style={{ width }} />)}
              {deleteAuthorized && <col style={{ width: deleteColumnWidth }} />}
            </colgroup>
            <thead>
              <tr>
                {[
                  'Date Requested កាលបរិច្ឆេទ​ស្នើសុំ​',
                  'Line ក្រុម',
                  'Employee# អត្តលេខ',
                  'Name ឈ្មោះ',
                  'Accessory Type ប្រភេទគ្រឿងលំអរ',
                  'Items វត្ថុ',
                  'Size ទំហំ',
                  'SP# លេខSP',
                  'Style ម៉ូត',
                  'Inline Date ថ្ងៃឡើងដេរ',
                  'Order Qty បរិមាណ​បញ្ជាទិញ',
                  'Actual Qty បរិមាណ​ជាក់ស្តែង',
                  'WH Status ស្ថានភាព',
                  'Detailed Remark កំណត់ចំណាំ​លម្អិត',
                  'WB Status ស្ថានភាព ជំនួយការ',
                  'WB Remarks ជំនួយការ​ កំណត់សម្គាល់',
                  ...(deleteAuthorized ? ['Delete'] : [])
                ].map((header) => <th key={header}>{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td className="empty" colSpan={deleteAuthorized ? 17 : 16}>No shared transactions yet.</td></tr>
              ) : filtered.map((row, index) => (
                <tr key={`${row.sp}-${index}`}>
                  {(() => {
                    const wbEnabled = row.status === 'Ready for Pick Up';
                    return (
                      <>
                  <td className="date-time-cell">
                    <span>{requestedDateTimeParts(row.dateRequested).date}</span>
                    {requestedDateTimeParts(row.dateRequested).time && <span>{requestedDateTimeParts(row.dateRequested).time}</span>}
                  </td><td>{row.line}</td><td>{row.employeeNo}</td><td>{row.name}</td><td>{row.accessoryType}</td><td>{row.item}</td><td>{row.size}</td><td>{row.sp}</td><td>{row.style}</td><td>{row.inlineDate}</td><td>{row.orderQty}</td>
                  <td><input className="table-input" type="number" value={row.actualQty ?? ''} onChange={(e) => updateTransaction(row, e.target.value === '' ? { actualQty: undefined, status: '', wbStatus: '' } : { actualQty: Number(e.target.value) })} onBlur={() => syncTransactionFields(row)} /></td>
                  <td className={whStatusClass(row.status)}>
                    <select className="table-select" value={row.status || ''} onChange={(e) => handleWhStatusChange(row, e.target.value)}>
                      <option value=""></option>
                      {whStatusOptions.map((option) => <option key={option}>{option}</option>)}
                    </select>
                  </td>
                  <td><input className="table-input wide" value={row.detailedRemark ?? ''} onChange={(e) => updateTransaction(row, { detailedRemark: e.target.value })} onBlur={() => syncTransactionFields(row)} /></td>
                  <td>
                    <select className="table-select" disabled={!wbEnabled} value={wbEnabled ? row.wbStatus || '' : ''} onChange={(e) => handleWbStatusChange(row, e.target.value)}>
                      <option value=""></option>
                      {wbStatusOptions.map((option) => <option key={option}>{option}</option>)}
                    </select>
                  </td>
                  <td><input className="table-input wide" disabled={!wbEnabled} value={wbEnabled ? row.wbRemarks ?? '' : ''} onChange={(e) => updateTransaction(row, { wbRemarks: e.target.value })} onBlur={() => syncTransactionFields(row)} /></td>
                  {deleteAuthorized && (
                    <td>
                      <button className="row-delete-button" disabled={!row.sheetRow || deletingRow === row.sheetRow} onClick={() => { void deleteTransaction(row); }}>
                        {deletingRow === row.sheetRow ? 'Deleting...' : 'Delete'}
                      </button>
                    </td>
                  )}
                      </>
                    );
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {pendingRemoval && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="confirm-modal">
            <div className="confirm-icon">!</div>
            <p>Are you sure you want to proceed? តើអ្នកប្រាកដចង់បន្តទេ?</p>
            <div className="confirm-actions">
              <button className="cancel-button" onClick={() => setPendingRemoval(null)}>Cancel បោះបង់</button>
              <button className="yes-button" onClick={confirmRemoveTransaction}>Yes បាទ</button>
            </div>
          </div>
        </div>
      )}
      {duplicateMessage && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="duplicate-modal">
            <p>{duplicateMessage}</p>
            <button onClick={() => setDuplicateMessage('')}>OK</button>
          </div>
        </div>
      )}
      {deleteModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="delete-modal">
            <h3>Delete Login</h3>
            <label>User</label>
            <input value={deleteUser} onChange={(e) => setDeleteUser(e.target.value)} autoFocus />
            <label>Password</label>
            <input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
            {deleteError && <p>{deleteError}</p>}
            <div className="delete-actions">
              <button onClick={() => setDeleteModalOpen(false)}>Cancel</button>
              <button className="confirm-delete-button" onClick={confirmDeleteLogin}>Login</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
