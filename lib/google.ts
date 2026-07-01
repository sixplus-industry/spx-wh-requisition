import type { Readable } from 'stream';
import type { Session } from './session';

export const DRIVE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets'
];

type FileCreateOptions = {
  requestBody: { name: string; mimeType: string };
  media: { mimeType: string; body: Readable };
  fields?: string;
};

function oauthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new Error('Missing Google OAuth environment variables.');
  return { clientId, clientSecret, redirectUri };
}

async function streamToBuffer(stream: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function googleFetch<T>(url: string, accessToken: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {})
    }
  });
  if (!res.ok) {
    const error = await res.text().catch(() => '');
    throw new Error(error || `Google API request failed with ${res.status}`);
  }
  if (res.status === 204) return { data: null as T };
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return { data: await res.json() as T };
  return { data: await res.arrayBuffer() as T };
}

export function getOAuthClient() {
  const { clientId, clientSecret, redirectUri } = oauthConfig();
  return {
    generateAuthUrl({ access_type, prompt, include_granted_scopes, scope, state }: {
      access_type: string;
      prompt: string;
      include_granted_scopes: boolean;
      scope: string[];
      state: string;
    }) {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        access_type,
        prompt,
        include_granted_scopes: String(include_granted_scopes),
        scope: scope.join(' '),
        state
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    },
    async getToken(code: string) {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const tokens = await res.json() as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
      return {
        tokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expiry_date: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined
        }
      };
    }
  };
}

export async function getGoogleUserInfo(accessToken: string) {
  return googleFetch<{ id?: string; email?: string; name?: string; picture?: string }>(
    'https://www.googleapis.com/oauth2/v2/userinfo',
    accessToken
  );
}

export function getDrive(session: Session) {
  const token = session.accessToken;
  return {
    files: {
      list({ q, pageSize, fields, orderBy, includeItemsFromAllDrives, supportsAllDrives }: {
        q: string;
        pageSize?: number;
        fields?: string;
        orderBy?: string;
        includeItemsFromAllDrives?: boolean;
        supportsAllDrives?: boolean;
      }) {
        const params = new URLSearchParams({
          q,
          pageSize: String(pageSize ?? 50),
          fields: fields ?? 'files(id,name,mimeType,modifiedTime,webViewLink)'
        });
        if (orderBy) params.set('orderBy', orderBy);
        if (includeItemsFromAllDrives) params.set('includeItemsFromAllDrives', 'true');
        if (supportsAllDrives) params.set('supportsAllDrives', 'true');
        return googleFetch<{ files?: Array<Record<string, unknown>> }>(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, token);
      },
      get({ fileId, alt }: { fileId: string; alt?: string }, options?: { responseType?: 'arraybuffer' }) {
        const params = new URLSearchParams();
        if (alt) params.set('alt', alt);
        return googleFetch<ArrayBuffer | Record<string, unknown>>(`https://www.googleapis.com/drive/v3/files/${fileId}?${params.toString()}`, token, {
          headers: options?.responseType === 'arraybuffer' ? { Accept: 'application/octet-stream' } : {}
        });
      },
      export({ fileId, mimeType }: { fileId: string; mimeType: string }, _options?: { responseType?: 'arraybuffer' }) {
        const params = new URLSearchParams({ mimeType });
        return googleFetch<ArrayBuffer>(`https://www.googleapis.com/drive/v3/files/${fileId}/export?${params.toString()}`, token);
      },
      async create({ requestBody, media, fields }: FileCreateOptions) {
        const metadata = Buffer.from(JSON.stringify(requestBody));
        const mediaBuffer = await streamToBuffer(media.body);
        const boundary = `spx_wh_requisition_${Date.now()}`;
        const body = Buffer.concat([
          Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
          metadata,
          Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${media.mimeType}\r\n\r\n`),
          mediaBuffer,
          Buffer.from(`\r\n--${boundary}--`)
        ]);
        const params = new URLSearchParams({ uploadType: 'multipart' });
        if (fields) params.set('fields', fields);
        return googleFetch<Record<string, unknown>>(`https://www.googleapis.com/upload/drive/v3/files?${params.toString()}`, token, {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body: body as unknown as BodyInit
        });
      }
    }
  };
}
