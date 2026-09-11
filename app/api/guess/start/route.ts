import { NextResponse } from 'next/server';
import { getAuthMember } from '@/lib/auth';
import { createGameSession, getStoreSettings, getGameState } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST() {
  const member = await getAuthMember();
  if (!member) {
    return NextResponse.json({ error: 'Not logged in.' }, { status: 401 });
  }

  const state = getGameState(member.id, 'guess');
  if (!state.allowed) {
    return NextResponse.json(
      { error: `No turns left. Try again in ${retryLabel(state.retryAfterMs)}.`, retryAfterMs: state.retryAfterMs, attemptsLeft: 0, cooldown: true },
      { status: 429 }
    );
  }

  const secret = Math.floor(Math.random() * 100) + 1;
  const session = createGameSession(member.id, 'guess', secret);
  const settings = getStoreSettings();
  return NextResponse.json({
    gameId: session.id,
    attemptsLeft: state.attemptsLeft,
    currencySymbol: settings.currencySymbol,
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