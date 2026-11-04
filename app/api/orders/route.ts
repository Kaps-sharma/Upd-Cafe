import { NextResponse } from 'next/server';
import { getAuthMember } from '@/lib/auth';
import { getMemberOrders } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const member = await getAuthMember();
  if (!member) {
    return NextResponse.json({ error: 'Not logged in.' }, { status: 401 });
  }
  return NextResponse.json({ orders: await getMemberOrders(member.id) });
}
