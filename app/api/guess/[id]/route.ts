import { NextRequest, NextResponse } from 'next/server';
import { getAuthMember } from '@/lib/auth';
import {
  getGameSession,
  finishGameSession,
  updateSessionMoves,
  creditReward,
  getStoreSettings,
  recordGameOutcome,
} from '@/lib/db';
import { randomGameReward } from '@/lib/games';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const member = await getAuthMember();
  if (!member) {
    return NextResponse.json({ error: 'Not logged in.' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const session = await getGameSession(Number(id));
  if (!session || session.member_id !== member.id || session.game !== 'guess') {
    return NextResponse.json({ error: 'Game not found.' }, { status: 404 });
  }
  if (session.status !== 'active') {
    return NextResponse.json({ result: 'finished', message: 'This game has already ended.' });
  }

  const body = await req.json().catch(() => null);
  const guess = Number(body?.guess);
  if (!Number.isInteger(guess) || guess < 1 || guess > 100) {
    return NextResponse.json(
      { error: 'Please enter a valid integer between 1 and 100.' },
      { status: 400 }
    );
  }

  const settings = await getStoreSettings();
  const moves = session.moves + 1;

  if (guess === session.secret) {
    await finishGameSession(session.id, 'won');
    const reward = randomGameReward();
    const balance = await creditReward(member.id, reward, 'guess');
    const state = await recordGameOutcome(member.id, 'guess', true);
    return NextResponse.json({
      result: 'win',
      moves,
      reward,
      balance,
      attemptsLeft: state.attemptsLeft,
      cooldown: state.cooldown,
      retryAfterMs: state.retryAfterMs,
      message: `Congratulations! You've guessed the number in ${moves} attempts. You won ${reward} ${settings.currencySymbol}.`,
    });
  }

  if (moves >= 10) {
    await finishGameSession(session.id, 'lost');
    const state = await recordGameOutcome(member.id, 'guess', false);
    return NextResponse.json({
      result: 'lose',
      moves,
      attemptsLeft: state.attemptsLeft,
      cooldown: state.cooldown,
      retryAfterMs: state.retryAfterMs,
      message: `Sorry, you've used all attempts. The number was ${session.secret}.${state.attemptsLeft > 0 ? ` ${state.attemptsLeft} try${state.attemptsLeft === 1 ? '' : 's'} left today.` : ' You are out of tries for today.'}`,
    });
  }

  await updateSessionMoves(session.id, moves);
  const low = guess < (session.secret as number);
  return NextResponse.json({
    result: low ? 'low' : 'high',
    moves,
    movesLeft: 10 - moves,
    message: low ? 'Too low!' : 'Too high!',
  });
}