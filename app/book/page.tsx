import type { Metadata } from 'next';
import { requireMember } from '@/lib/auth';
import { getStoreSettings } from '@/lib/db';
import Header from '@/components/Header';
import TableBooking from '@/components/TableBooking';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Book a Table',
  description: 'Pick seats, date and time, then choose your table from the Snake Cafe floor plan.',
};

export default async function BookPage() {
  const member = await requireMember();
  const settings = getStoreSettings();

  return (
    <main>
      <Header
        storeName={settings.storeName}
        currencyName={settings.currencyName}
        currencySymbol={settings.currencySymbol}
        member={member}
      />
      <TableBooking storeName={settings.storeName} member={{ name: member.name }} />
    </main>
  );
}