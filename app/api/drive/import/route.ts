import { getDrive } from '@/lib/google';
import { requireSession } from '@/lib/session';
import { parseWorkbook } from '@/lib/excel';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { fileId, mimeType } = await req.json();
  if (!fileId) return Response.json({ error: 'fileId is required' }, { status: 400 });
  const session = await requireSession();
  if (session instanceof Response) return session;
  const drive = getDrive(session);
  const file = mimeType === 'application/vnd.google-apps.spreadsheet'
    ? await drive.files.export({ fileId, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }, { responseType: 'arraybuffer' })
    : await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
  return Response.json({ sheets: parseWorkbook(Buffer.from(file.data as ArrayBuffer)) });
}
