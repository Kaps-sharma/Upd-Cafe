import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAuthMember, isAdminSession, requireMember } from '@/lib/auth';
import { getOrder, getStoreSettings } from '@/lib/db';
import Header from '@/components/Header';
import OrderTracker from '@/components/OrderTracker';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Order status',
  description: 'Follow your order from the kitchen to your table.',
  robots: { index: false, follow: false },
};

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) notFound();

  // Staff may open any order; a customer must be logged in and own it.
  const admin = await isAdminSession();
  const member = admin ? await getAuthMember() : await requireMember(`/orders/${orderId}`);
  const settings = await getStoreSettings();
  const order = await getOrder(orderId);
  if (!order) notFound();
  if (!admin && (!member || order.memberId !== member.id)) notFound();

  return (
    <main>
      <Header
        storeName={settings.storeName}
        currencyName={settings.currencyName}
        currencySymbol={settings.currencySymbol}
        member={member}
      />
      <OrderTracker
        initialOrder={order}
        storeName={settings.storeName}
        currencyName={settings.currencyName}
        currencySymbol={settings.currencySymbol}
        gstPercent={settings.gstPercent}
        fssaiNumber={settings.fssaiNumber}
        gstin={settings.gstin}
        invoiceNote={settings.invoiceNote}
      />
    </main>
  );
}
