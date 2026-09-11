import type { Metadata } from 'next';
import { requireMember } from '@/lib/auth';
import { getStoreSettings, getActiveMenuItems } from '@/lib/db';
import Header from '@/components/Header';
import OrderMenu from '@/components/OrderMenu';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Menu & Orders',
  description:
    'Browse the full menu, pick your favorites, and place your order using your wallet and Snake Coins.',
};

export default async function MenuPage() {
  const member = await requireMember();
  const settings = getStoreSettings();
  const items = getActiveMenuItems();

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
      />
    </main>
  );
}