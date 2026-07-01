import { Readable } from 'stream';
import { getDrive } from '@/lib/google';
import { requireSession } from '@/lib/session';
import { workbookBuffer, type LineStationData } from '@/lib/excel';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;
  const body = await req.json() as { format: 'json' | 'xlsx'; fileName?: string; data?: LineStationData };
  const format = body.format === 'json' ? 'json' : 'xlsx';
  const baseName = (body.fileName || 'SPX WH Requisition Line Station Data').replace(/[\\/:*?"<>|]/g, '-');
  const mimeType = format === 'json' ? 'application/json' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const buffer = format === 'json' ? Buffer.from(JSON.stringify(body.data ?? {}, null, 2)) : workbookBuffer(body.data ?? {});
  const { data } = await getDrive(session).files.create({
    requestBody: { name: `${baseName}.${format}`, mimeType },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id,name,webViewLink'
  });
  return Response.json({ file: data });
}
