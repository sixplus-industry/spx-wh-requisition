import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'SPX WH Requisition',
  description: 'Warehouse requisition PWA with Google Drive import/export.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'SPX WH' }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ecd0bd'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
