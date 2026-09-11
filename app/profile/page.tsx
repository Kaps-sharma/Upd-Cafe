import type { Metadata } from 'next';
import { requireMember } from '@/lib/auth';
import { getStoreSettings } from '@/lib/db';
import Header from '@/components/Header';
import Profile from '@/components/Profile';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your Profile',
  description: 'Manage your details, wallet and order history at Snake Cafe.',
};

export default async function ProfilePage() {
  const member = await requireMember();
  const settings = await getStoreSettings();

  return (
    <main>
      <Header
        storeName={settings.storeName}
        currencyName={settings.currencyName}
        currencySymbol={settings.currencySymbol}
        member={member}
      />
      <Profile
        currencyName={settings.currencyName}
        currencySymbol={settings.currencySymbol}
        member={member}
      />
    </main>
  );
}