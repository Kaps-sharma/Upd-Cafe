import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isAdminSession } from '@/lib/auth';
import { getStoreSettings, listMenuItems, getOpenOrders, getRecentClosedOrders } from '@/lib/db';
import AdminPanel from '@/components/AdminPanel';
import AdminShell from '@/components/AdminShell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin',
  description: 'Manage Snake Cafe store settings, menu items, and security.',
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  if (!(await isAdminSession())) {
    redirect('/admin/login');
  }

  const settings = await getStoreSettings();
  const items = await listMenuItems();
  const [openOrders, closedOrders] = await Promise.all([
    getOpenOrders(),
    getRecentClosedOrders(),
  ]);

  return (
    <main>
      <AdminShell storeName={settings.storeName} />
      <AdminPanel
        initialSettings={settings}
        initialItems={items}
        initialOpenOrders={openOrders}
        initialClosedOrders={closedOrders}
      />
    </main>
  );
}