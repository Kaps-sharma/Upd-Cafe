import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/auth';
import { passcodeMatches, setAdminPasscode } from '@/lib/db';

export const runtime = 'nodejs';

export async function PUT(req: NextRequest) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const current = typeof body?.current === 'string' ? body.current : '';
  const next = typeof body?.new !== 'undefined' ? String(body.new) : '';

  if (!(await passcodeMatches(current))) {
    return NextResponse.json({ error: 'Current passcode is incorrect.' }, { status: 400 });
  }
  if (!next || next.length < 6) {
    return NextResponse.json({ error: 'New passcode must be at least 6 characters.' }, { status: 400 });
  }
  if (next.length > 64) {
    return NextResponse.json({ error: 'New passcode must be 64 characters or fewer.' }, { status: 400 });
  }

  await setAdminPasscode(next);
  return NextResponse.json({ ok: true });
}