import type { Metadata } from 'next';
import { requireMember } from '@/lib/auth';
import { getStoreSettings } from '@/lib/db';
import Header from '@/components/Header';
import TicTacToeGame from '@/components/TicTacToeGame';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tic Tac Toe',
  description:
    'Play Tic Tac Toe against our bot and earn Snake Coins when you win.',
};

export default async function TicTacToePage() {
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
      <TicTacToeGame currencySymbol={settings.currencySymbol} />
    </main>
  );
}