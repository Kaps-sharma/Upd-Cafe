import { NextRequest, NextResponse } from 'next/server';
import { getAuthMember, isAdminSession } from '@/lib/auth';
import { cancelOrder, getOrder, OrderError } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 });
  }

  const order = await getOrder(orderId);
  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  // Staff can look at any order; a customer only their own.
  if (!(await isAdminSession())) {
    const member = await getAuthMember();
    if (!member || order.memberId !== member.id) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }
  }

  return NextResponse.json({ order });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 });
  }

  const member = await getAuthMember();
  if (!member) {
    return NextResponse.json({ error: 'Not logged in.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (body?.action !== 'cancel') {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }

  try {
    const order = await cancelOrder(orderId, { memberId: member.id });
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof OrderError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
