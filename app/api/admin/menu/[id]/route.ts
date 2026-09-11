import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/auth';
import { updateMenuItem, deleteMenuItem, MenuItemError } from '@/lib/db';

export const runtime = 'nodejs';

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: 'Invalid item id.' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const data: { name?: string; price?: number; category?: string; image?: string; active?: boolean } = {};
  if (typeof body?.name === 'string') data.name = body.name;
  if (body?.price !== undefined) data.price = Number(body.price);
  if (typeof body?.category === 'string') data.category = body.category;
  if (typeof body?.image === 'string') data.image = body.image;
  if (typeof body?.active === 'boolean') data.active = body.active;

  try {
    const updated = await updateMenuItem(numericId, data);
    if (!updated) {
      return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
    }
    return NextResponse.json({ item: updated });
  } catch (error) {
    if (error instanceof MenuItemError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: 'Invalid item id.' }, { status: 400 });
  }

  const deleted = await deleteMenuItem(numericId);
  if (!deleted) {
    return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}