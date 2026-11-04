import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/auth';
import { cancelOrder, updateOrderStatus, OrderError } from '@/lib/db';
import { isOrderStatus, ORDER_STATUS_LABEL } from '@/lib/orders';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const status = body?.status;
  const wantsCancel = body?.action === 'cancel' || status === 'cancelled';

  try {
    if (wantsCancel) {
      // Staff cancellation: no "pending only" restriction, but an already-closed
      // order still cannot be cancelled.
      return NextResponse.json({ order: await cancelOrder(orderId) });
    }

    if (!isOrderStatus(status)) {
      return NextResponse.json(
        { error: `Status must be one of: ${Object.keys(ORDER_STATUS_LABEL).join(', ')}.` },
        { status: 400 }
      );
    }

    return NextResponse.json({ order: await updateOrderStatus(orderId, status) });
  } catch (error) {
    if (error instanceof OrderError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
