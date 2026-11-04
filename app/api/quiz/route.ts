import { NextRequest, NextResponse } from 'next/server';
import { getAuthMember } from '@/lib/auth';
import { creditReward, getStoreSettings, getGameState, recordGameOutcome } from '@/lib/db';
import { publicQuizQuestions, gradeQuiz, QUIZ_PASS_SCORE, randomGameReward } from '@/lib/games';

export const runtime = 'nodejs';

export async function GET() {
  const member = await getAuthMember();
  if (!member) {
    return NextResponse.json({ error: 'Not logged in.' }, { status: 401 });
  }
  const state = await getGameState(member.id, 'quiz');
  if (!state.allowed) {
    return NextResponse.json(
      { error: `No turns left. Try again in ${retryLabel(state.retryAfterMs)}.`, retryAfterMs: state.retryAfterMs, attemptsLeft: 0, cooldown: true },
      { status: 429 }
    );
  }
  return NextResponse.json({ questions: publicQuizQuestions(), attemptsLeft: state.attemptsLeft });
}

export async function POST(req: NextRequest) {
  const member = await getAuthMember();
  if (!member) {
    return NextResponse.json({ error: 'Not logged in.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const answers = Array.isArray(body?.answers) ? body.answers : null;
  if (!answers || answers.length !== 10 || !answers.every((a: unknown) => Number.isInteger(a))) {
    return NextResponse.json({ error: 'Invalid quiz answers.' }, { status: 400 });
  }

  const before = await getGameState(member.id, 'quiz');
  if (!before.allowed) {
    return NextResponse.json(
      { error: `No turns left. Try again in ${retryLabel(before.retryAfterMs)}.`, retryAfterMs: before.retryAfterMs, attemptsLeft: 0, cooldown: true },
      { status: 429 }
    );
  }

  const settings = await getStoreSettings();
  const { score, total } = gradeQuiz(answers as number[]);
  const passed = score >= QUIZ_PASS_SCORE;
  const after = await recordGameOutcome(member.id, 'quiz', passed);

  let reward = 0;
  let balance: number | null = null;
  if (passed) {
    reward = randomGameReward();
    balance = await creditReward(member.id, reward, 'quiz');
  }

  return NextResponse.json({
    score,
    total,
    passed,
    reward,
    balance,
    attemptsLeft: after.attemptsLeft,
    retryAfterMs: after.retryAfterMs,
    cooldown: after.cooldown,
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