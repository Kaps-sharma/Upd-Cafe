import { NextRequest, NextResponse } from 'next/server';
import { getAuthMember } from '@/lib/auth';
import { addMoney, updateMemberProfile, MemberProfileError } from '@/lib/db';

export const runtime = 'nodejs';

const UPI_PATTERN = /^[A-Za-z0-9_.\-]{2,}@[A-Za-z]{2,}$/;

export async function POST(req: NextRequest) {
  const member = await getAuthMember();
  if (!member) {
    return NextResponse.json({ error: 'Not logged in.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const upiId = typeof body?.upiId === 'string' ? body.upiId.trim() : '';
  const amount = Number(body?.amount);

  if (!upiId || !UPI_PATTERN.test(upiId)) {
    return NextResponse.json({ error: 'Enter a valid UPI ID (e.g. name@upi).' }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
    return NextResponse.json({ error: 'Enter a top-up amount between ₹1 and ₹100,000.' }, { status: 400 });
  }

  // Simulated UPI payment: valid UPI ID + amount -> the money is credited.
  try {
    updateMemberProfile(member.id, { upiId });
  } catch (error) {
    if (error instanceof MemberProfileError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const money = addMoney(member.id, Math.round(amount * 100) / 100);
  return NextResponse.json({ member: { ...member, money, upiId } });
}