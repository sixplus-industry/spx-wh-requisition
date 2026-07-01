import { getDrive } from '@/lib/google';
import { requireSession } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET() {
  const session = await requireSession();
  if (session instanceof Response) return session;
  const { data } = await getDrive(session).files.list({
    q: "(mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType='application/vnd.ms-excel' or mimeType='application/vnd.google-apps.spreadsheet') and trashed=false",
    pageSize: 50,
    fields: 'files(id,name,mimeType,modifiedTime,webViewLink)',
    orderBy: 'modifiedTime desc'
  });
  return Response.json({ files: data.files ?? [] });
}
