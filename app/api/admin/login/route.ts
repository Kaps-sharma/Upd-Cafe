import { NextRequest, NextResponse } from 'next/server';
import { passcodeMatches } from '@/lib/db';
import { setAdminSession } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const passcode = typeof body?.passcode === 'string' ? body.passcode : '';
  if (!passcode) {
    return NextResponse.json({ error: 'Please enter the admin passcode.' }, { status: 400 });
  }
  if (!(await passcodeMatches(passcode))) {
    return NextResponse.json({ error: 'Incorrect passcode.' }, { status: 401 });
  }
  await setAdminSession();
  return NextResponse.json({ ok: true });
}