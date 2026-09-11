import type { Metadata } from 'next';
import { requireMember } from '@/lib/auth';
import { getStoreSettings } from '@/lib/db';
import Header from '@/components/Header';
import QuizGame from '@/components/QuizGame';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Quiz',
  description:
    'Test your general knowledge in the Snake Cafe quiz and earn Snake Coins with 6+ correct answers.',
};

export default async function QuizPage() {
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
      <QuizGame currencySymbol={settings.currencySymbol} />
    </main>
  );
}