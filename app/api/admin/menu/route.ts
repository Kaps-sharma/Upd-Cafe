import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/auth';
import { listMenuItems, createMenuItem, MenuItemError } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }
  return NextResponse.json({ items: await listMenuItems() });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name : '';
  const price = Number(body?.price);
  const category = typeof body?.category === 'string' ? body.category : 'General';
  const image = typeof body?.image === 'string' ? body.image : '';

  try {
    const item = await createMenuItem({ name, price, category, image });
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof MenuItemError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}