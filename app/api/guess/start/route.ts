import { NextResponse } from 'next/server';
import { getAuthMember } from '@/lib/auth';
import {
  createGameSession,
  getStoreSettings,
  getGameState,
  getActiveGameSession,
} from '@/lib/db';

export const runtime = 'nodejs';

export async function POST() {
  const member = await getAuthMember();
  if (!member) {
    return NextResponse.json({ error: 'Not logged in.' }, { status: 401 });
  }

  const state = await getGameState(member.id, 'guess');
  if (!state.allowed) {
    return NextResponse.json(
      { error: `No turns left. Try again in ${retryLabel(state.retryAfterMs)}.`, retryAfterMs: state.retryAfterMs, attemptsLeft: 0, cooldown: true },
      { status: 429 }
    );
  }

  const settings = await getStoreSettings();

  // One live game per member: reopening the page continues the same number
  // instead of rolling a fresh secret, so the 10 attempts cannot be reset.
  const existing = await getActiveGameSession(member.id, 'guess');
  if (existing) {
    return NextResponse.json({
      gameId: existing.id,
      attemptsLeft: state.attemptsLeft,
      currencySymbol: settings.currencySymbol,
      resumed: true,
    });
  }

  const secret = Math.floor(Math.random() * 100) + 1;
  const session = await createGameSession(member.id, 'guess', secret);
  return NextResponse.json({
    gameId: session.id,
    attemptsLeft: state.attemptsLeft,
    currencySymbol: settings.currencySymbol,
    resumed: false,
  });
}

function retryLabel(retryAfterMs: number | null): string {
  if (!retryAfterMs) return '24 hours';
  const ms = retryAfterMs - Date.now();
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}