import { Readable } from 'stream';
import { getDrive } from '@/lib/google';
import { requireSession } from '@/lib/session';
import { workbookBuffer } from '@/lib/excel';

export const runtime = 'nodejs';

export async function POST() {
  const session = await requireSession();
  if (session instanceof Response) return session;
  const name = `SPX WH Requisition Template ${new Date().toISOString().slice(0, 10)}.xlsx`;
  const buffer = workbookBuffer({});
  const { data } = await getDrive(session).files.create({
    requestBody: { name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    media: { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: Readable.from(buffer) },
    fields: 'id,name,webViewLink'
  });
  return Response.json({ file: data });
}
