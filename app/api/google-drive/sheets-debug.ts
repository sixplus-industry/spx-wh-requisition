export type GoogleApiError = {
  message: string;
  status: number;
  code?: number;
};

export type GoogleJsonResult<T> = { data: T } | { error: GoogleApiError };

export async function googleSheetsJson<T>(url: string, accessToken: string, init: RequestInit = {}): Promise<GoogleJsonResult<T>> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {})
    }
  });
  if (!res.ok) {
    const detail = await res.json().catch(async () => ({ error: { message: await res.text().catch(() => '') } }));
    const apiError = detail?.error ?? {};
    return {
      error: {
        message: String(apiError.message || `Google Sheets API request failed with ${res.status}`),
        status: res.status,
        code: typeof apiError.code === 'number' ? apiError.code : undefined
      }
    };
  }
  return { data: await res.json() as T };
}

export function sheetAccessError(error: GoogleApiError) {
  if (error.status === 404 || error.code === 404) {
    return 'Spreadsheet not accessible by the signed-in Google account or wrong spreadsheet ID.';
  }
  if (error.status === 403 || error.code === 403) {
    return 'The signed-in Google account does not have permission to access SPX WH Request. Click Sign in with Google and choose the account that has access to the spreadsheet.';
  }
  return error.message;
}
