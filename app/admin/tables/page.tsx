import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { isAdminSession } from '@/lib/auth';
import { getStoreSettings } from '@/lib/db';
import { TABLES } from '@/lib/tables';
import AdminShell from '@/components/AdminShell';
import PrintButton from '@/components/PrintButton';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Table QR codes',
  robots: { index: false, follow: false },
};

/** Use the configured public URL, or the host the admin is browsing right now. */
async function siteBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;

  const store = await headers();
  const host = store.get('x-forwarded-host') ?? store.get('host');
  if (!host) return 'http://localhost:3000';
  const proto =
    store.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export default async function TableQrPage() {
  if (!(await isAdminSession())) {
    redirect('/admin/login');
  }

  const settings = await getStoreSettings();
  const base = await siteBaseUrl();

  const cards = await Promise.all(
    TABLES.map(async (table) => {
      const url = `${base}/menu?table=${encodeURIComponent(table.id)}`;
      const svg = await QRCode.toString(url, {
        type: 'svg',
        margin: 1,
        width: 220,
        color: { dark: '#1c2b24', light: '#ffffff' },
      });
      return { table, url, svg };
    })
  );

  return (
    <main>
      <AdminShell storeName={settings.storeName} />
      <div className="container qr-page">
        <div className="page-head-row no-print">
          <div>
            <h1>Table QR codes</h1>
            <p className="subtitle">
              Print one card per table. Scanning it opens the menu with that table already
              selected, so the order reaches the kitchen with the right table number.
            </p>
          </div>
          <div className="actions">
            <Link href="/admin" className="btn">
              Back to admin
            </Link>
            <PrintButton label="Print all" />
          </div>
        </div>

        <p className="muted note no-print">
          Links point to <strong>{base}</strong>. Set <code>NEXT_PUBLIC_SITE_URL</code> in
          <code> .env.local</code> to your real domain before printing for the café.
        </p>

        <div className="qr-grid">
          {cards.map(({ table, url, svg }) => (
            <div key={table.id} className="qr-card">
              <div
                className="qr-code"
                // The SVG comes from the qrcode library, not from user input.
                dangerouslySetInnerHTML={{ __html: svg }}
              />
              <strong className="qr-table">Table {table.label}</strong>
              <span className="muted">
                {table.capacity} {table.capacity === 1 ? 'seat' : 'seats'}
              </span>
              <span className="qr-url">{url}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
