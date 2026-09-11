import { NextRequest, NextResponse } from 'next/server';
import { getAuthMember } from '@/lib/auth';
import { creditReward, getStoreSettings, getGameState, recordGameOutcome } from '@/lib/db';
import { isValidTicTacToeOutcome, randomGameReward } from '@/lib/games';

export const runtime = 'nodejs';

export async function GET() {
  const member = await getAuthMember();
  if (!member) {
    return NextResponse.json({ error: 'Not logged in.' }, { status: 401 });
  }
  const state = await getGameState(member.id, 'tictactoe');
  return NextResponse.json({
    allowed: state.allowed,
    cooldown: state.cooldown,
    retryAfterMs: state.retryAfterMs,
    attemptsLeft: state.attemptsLeft,
  });
}

export async function POST(req: NextRequest) {
  const member = await getAuthMember();
  if (!member) {
    return NextResponse.json({ error: 'Not logged in.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const board = body?.board as unknown;
  const outcome = body?.outcome as 'win' | 'lose' | 'draw';
  if (
    outcome !== 'win' &&
    outcome !== 'lose' &&
    outcome !== 'draw'
  ) {
    return NextResponse.json({ error: 'Invalid outcome.' }, { status: 400 });
  }
  if (!Array.isArray(board) || !isValidTicTacToeOutcome(board, outcome)) {
    return NextResponse.json({ error: 'Invalid board.' }, { status: 400 });
  }

  const before = await getGameState(member.id, 'tictactoe');
  if (!before.allowed) {
    return NextResponse.json(
      { error: `No turns left. Try again later.`, retryAfterMs: before.retryAfterMs, attemptsLeft: 0, cooldown: true },
      { status: 429 }
    );
  }

  const settings = await getStoreSettings();
  if (outcome !== 'win') {
    const after = await recordGameOutcome(member.id, 'tictactoe', false);
    return NextResponse.json({
      outcome,
      attemptsLeft: after.attemptsLeft,
      retryAfterMs: after.retryAfterMs,
      cooldown: after.cooldown,
      currencySymbol: settings.currencySymbol,
    });
  }

  const reward = randomGameReward();
  const balance = await creditReward(member.id, reward);
  const after = await recordGameOutcome(member.id, 'tictactoe', true);
  return NextResponse.json({
    outcome,
    reward,
    balance,
    attemptsLeft: after.attemptsLeft,
    retryAfterMs: after.retryAfterMs,
    cooldown: after.cooldown,
    currencySymbol: settings.currencySymbol,
  });
}