import type { Metadata } from 'next';
import { requireMember } from '@/lib/auth';
import { getStoreSettings, listMenuItems } from '@/lib/db';
import Header from '@/components/Header';
import CartView from '@/components/CartView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your Cart',
  description: 'Review and pay for the items you added at Snake Cafe.',
};

export default async function CartPage() {
  const member = await requireMember();
  const settings = getStoreSettings();
  const items = listMenuItems();

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
      />
    </main>
  );
}