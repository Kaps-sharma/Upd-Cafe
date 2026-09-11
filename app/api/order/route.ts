import { NextRequest, NextResponse } from 'next/server';
import { getAuthMember } from '@/lib/auth';
import { placeOrder, InsufficientBalanceError, MenuItemError, getActiveMenuItems } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const member = await getAuthMember();
  if (!member) {
    return NextResponse.json({ error: 'Not logged in.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const rawItems = Array.isArray(body?.items) ? body.items : [];
  const items: { name: string; quantity: number }[] = [];
  const activeNames = new Set((await getActiveMenuItems()).map((item) => item.name));
  const scUsed = Number(body?.scUsed ?? 0);

  for (const raw of rawItems) {
    const name = typeof raw?.name === 'string' ? raw.name.trim() : '';
    const quantity = Number(raw?.quantity);
    if (!activeNames.has(name)) {
      return NextResponse.json({ error: `"${name}" is not on the menu. Try again.` }, { status: 400 });
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'Please enter a positive quantity.' }, { status: 400 });
    }
    const existing = items.find((item) => item.name === name);
    if (existing) {
      existing.quantity += quantity;
    } else {
      items.push({ name, quantity });
    }
  }

  if (items.length === 0) {
    return NextResponse.json({ error: 'Your order is empty.' }, { status: 400 });
  }

  try {
    const result = await placeOrder(member.id, items, scUsed);
    return NextResponse.json({ ...result, balance: result.newSc });
  } catch (error) {
    if (error instanceof InsufficientBalanceError || error instanceof MenuItemError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}