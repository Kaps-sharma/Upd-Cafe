import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/auth';
import { AdminError, adjustMemberBalances } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const memberId = Number(id);
  if (!Number.isInteger(memberId) || memberId <= 0) {
    return NextResponse.json({ error: 'Member not found.' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Nothing to adjust.' }, { status: 400 });
  }

  const money = body.money === undefined ? 0 : Number(body.money);
  const coins = body.coins === undefined ? 0 : Number(body.coins);
  const note = typeof body.note === 'string' ? body.note : '';

  try {
    const member = await adjustMemberBalances(memberId, money, coins, note);
    return NextResponse.json({ member });
  } catch (error) {
    if (error instanceof AdminError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[admin/members/adjust] unexpected error:', error);
    return NextResponse.json(
      { error: 'Could not adjust this member. Please try again.' },
      { status: 500 }
    );
  }
}
