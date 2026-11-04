import { NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/auth';
import { getOpenOrders, getRecentClosedOrders } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }
  const [open, closed] = await Promise.all([getOpenOrders(), getRecentClosedOrders()]);
  return NextResponse.json({ open, closed });
}
