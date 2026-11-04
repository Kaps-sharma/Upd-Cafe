import { NextRequest, NextResponse } from 'next/server';
import {
  adminLoginState,
  clearAdminFailures,
  passcodeMatches,
  registerAdminFailure,
  type AdminLoginState,
} from '@/lib/db';
import { setAdminSession } from '@/lib/auth';

export const runtime = 'nodejs';

function retryLabel(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function lockedResponse(state: AdminLoginState) {
  return NextResponse.json(
    {
      error: `Too many wrong passcodes. Try again in ${retryLabel(state.retryAfterMs)}.`,
      locked: true,
      retryAfterMs: state.retryAfterMs,
      attemptsLeft: 0,
    },
    {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(state.retryAfterMs / 1000)) },
    }
  );
}

export async function POST(req: NextRequest) {
  const state = await adminLoginState();
  if (state.locked) return lockedResponse(state);

  const body = await req.json().catch(() => null);
  const passcode = typeof body?.passcode === 'string' ? body.passcode : '';
  if (!passcode) {
    return NextResponse.json({ error: 'Please enter the admin passcode.' }, { status: 400 });
  }

  if (!(await passcodeMatches(passcode))) {
    const after = await registerAdminFailure();
    if (after.locked) return lockedResponse(after);
    return NextResponse.json(
      {
        error: `Incorrect passcode. ${after.attemptsLeft} attempt${after.attemptsLeft === 1 ? '' : 's'} left.`,
        locked: false,
        attemptsLeft: after.attemptsLeft,
      },
      { status: 401 }
    );
  }

  await clearAdminFailures();
  await setAdminSession();
  return NextResponse.json({ ok: true });
}
