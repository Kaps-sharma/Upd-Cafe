import type { Metadata } from 'next';
import { requireMember } from '@/lib/auth';
import { getStoreSettings } from '@/lib/db';
import Header from '@/components/Header';
import GuessGame from '@/components/GuessGame';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Guess the Number',
  description:
    'Guess the secret number between 1 and 100 in 10 tries and earn Snake Coins.',
};

export default async function GuessPage() {
  const member = await requireMember('/guess');
  const settings = await getStoreSettings();

  return (
    <main>
      <Header
        storeName={settings.storeName}
        currencyName={settings.currencyName}
        currencySymbol={settings.currencySymbol}
        member={member}
      />
      <GuessGame currencySymbol={settings.currencySymbol} />
    </main>
  );
}