import type { Metadata } from 'next';
import { requireMember } from '@/lib/auth';
import { getStoreSettings, getActiveMenuItems } from '@/lib/db';
import Header from '@/components/Header';
import OrderMenu from '@/components/OrderMenu';
import { findTable } from '@/lib/tables';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Menu & Orders',
  description:
    'Browse the full menu, pick your favorites, and place your order using your wallet and Snake Coins.',
};

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string | string[] }>;
}) {
  const member = await requireMember('/menu');
  const settings = await getStoreSettings();
  const items = await getActiveMenuItems();
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
      <OrderMenu
        storeName={settings.storeName}
        currencyName={settings.currencyName}
        currencySymbol={settings.currencySymbol}
        items={items}
        member={{ money: member.money, sc: member.sc }}
        table={table}
      />
    </main>
  );
}