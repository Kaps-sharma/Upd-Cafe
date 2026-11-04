import { NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/auth';
import { getSalesReport } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }
  return NextResponse.json({ report: await getSalesReport() });
}
