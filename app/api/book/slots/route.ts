import { NextRequest, NextResponse } from 'next/server';
import { getAuthMember } from '@/lib/auth';
import { getTableAvailability } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const member = await getAuthMember();
  if (!member) {
    return NextResponse.json({ error: 'Not logged in.' }, { status: 401 });
  }

  const date = req.nextUrl.searchParams.get('date') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Pick a valid date.' }, { status: 400 });
  }
  return NextResponse.json({ availability: await getTableAvailability(date) });
}