import { NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/auth';
import { getTodayBookings, getUpcomingBookings } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }
  const [bookings, today] = await Promise.all([getUpcomingBookings(), getTodayBookings()]);
  return NextResponse.json({ bookings, today });
}
