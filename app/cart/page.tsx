import type { Metadata } from 'next';
import { requireMember } from '@/lib/auth';
import { getStoreSettings, listMenuItems } from '@/lib/db';
import Header from '@/components/Header';
import CartView from '@/components/CartView';
import { findTable } from '@/lib/tables';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your Cart',
  description: 'Review and pay for the items you added at Snake Cafe.',
};

export default async function CartPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string | string[] }>;
}) {
  const member = await requireMember('/cart');
  const settings = await getStoreSettings();
  const items = await listMenuItems();
  const { table: tableParam } = await searchParams;
  const table = findTable(Array.isArray(tableParam) ? tableParam[0] : tableParam);

  return (
    <main>
      <Header
        storeName={settings.storeName}
        currencyName={settings.currencyName}
        currencySymbol={settings.currencySymbol}
        member={member}
      />
      <CartView
        storeName={settings.storeName}
        currencyName={settings.currencyName}
        currencySymbol={settings.currencySymbol}
        items={items}
        member={{ name: member.name, money: member.money, sc: member.sc }}
        maxDiscountPercent={settings.maxDiscountPercent}
        initialTable={table?.id ?? ''}
      />
    </main>
  );
}