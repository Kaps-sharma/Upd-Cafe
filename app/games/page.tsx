import Link from 'next/link';
import type { Metadata } from 'next';
import { requireMember } from '@/lib/auth';
import { getStoreSettings } from '@/lib/db';
import { formatCoins, formatRupees } from '@/lib/store';
import Header from '@/components/Header';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Games & Rewards',
  description: 'Play Quiz, Guess the Number and Tic Tac Toe to earn Snake Coins at Snake Cafe.',
};

export default async function GamesPage() {
  const member = await requireMember();
  const settings = await getStoreSettings();

  const games = [
    {
      href: '/quiz',
      title: 'Quiz',
      emoji: '🧠',
      description: 'Answer 10 themed questions. Score 6 or more to bank some Snake Coins.',
      badge: `+0–200 ${settings.currencySymbol}`,
      tag: 'Trivia',
    },
    {
      href: '/guess',
      title: 'Guess the Number',
      emoji: '🎯',
      description: 'A number between 1 and 100. Ten tries to nail it. No hints, just vibes.',
      badge: `+0–200 ${settings.currencySymbol}`,
      tag: 'Luck',
    },
    {
      href: '/tictactoe',
      title: 'Tic Tac Toe',
      emoji: '⭕',
      description: 'Beat the bot in a classic three-in-a-row. Fast to play, easy to win.',
      badge: `+0–200 ${settings.currencySymbol}`,
      tag: 'Strategy',
    },
  ];

  return (
    <main>
      <Header
        storeName={settings.storeName}
        currencyName={settings.currencyName}
        currencySymbol={settings.currencySymbol}
        member={member}
      />
      <div className="container">
        <div className="page-head-row">
          <div>
            <h1>Games &amp; rewards</h1>
            <p className="subtitle">
              Three games, three chances today. Win {settings.currencySymbol} and spend them like
              cash — 100 {settings.currencySymbol} takes ₹1 off your order.
            </p>
          </div>
          <div className="wallet-pills">
            <div className="balance-pill">
              <span className="balance-pill-label">Wallet</span>
              <strong>{formatRupees(member.money)}</strong>
            </div>
            <div className="balance-pill">
              <span className="balance-pill-label">{settings.currencyName}</span>
              <strong>{formatCoins(member.sc, settings.currencySymbol)}</strong>
            </div>
          </div>
        </div>

        <div className="option-grid games-grid">
          {games.map((game) => (
            <Link key={game.href} href={game.href} className="card option-card game-card">
              <span className="game-emoji" aria-hidden="true">{game.emoji}</span>
              <span className="badge">{game.badge}</span>
              <span className="game-tag">{game.tag}</span>
              <h2>{game.title}</h2>
              <p>{game.description}</p>
            </Link>
          ))}
        </div>

        <div className="card games-note">
          <h2>How rewards work</h2>
          <ul className="plain-list">
            <li>Try each game up to 3 times a day.</li>
            <li>Win any game to start a 24 hour cooldown — lose 3 times and a cooldown starts too.</li>
            <li>Wins drop between 0 and 200 {settings.currencySymbol}.</li>
            <li>Redeem at checkout: 100 {settings.currencySymbol} = ₹1 off your order.</li>
          </ul>
        </div>
      </div>
    </main>
  );
}