import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/auth';
import { getStoreSettings, setSetting } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }
  return NextResponse.json({ settings: getStoreSettings() });
}

export async function PUT(req: NextRequest) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const storeName = typeof body?.storeName === 'string' ? body.storeName.trim() : '';
  const currencyName = typeof body?.currencyName === 'string' ? body.currencyName.trim() : '';
  const currencySymbol = typeof body?.currencySymbol === 'string' ? body.currencySymbol.trim() : '';
  const welcomeBonus = Number(body?.welcomeBonus);

  if (!storeName || storeName.length > 60) {
    return NextResponse.json({ error: 'Store name must be between 1 and 60 characters.' }, { status: 400 });
  }
  if (!currencyName || currencyName.length > 30) {
    return NextResponse.json({ error: 'Currency name must be between 1 and 30 characters.' }, { status: 400 });
  }
  if (!currencySymbol || currencySymbol.length > 10) {
    return NextResponse.json({ error: 'Currency symbol must be between 1 and 10 characters.' }, { status: 400 });
  }
  if (!Number.isFinite(welcomeBonus) || welcomeBonus < 0 || welcomeBonus > 1000000) {
    return NextResponse.json({ error: 'Welcome bonus must be between 0 and 1,000,000.' }, { status: 400 });
  }

  setSetting('store_name', storeName);
  setSetting('currency_name', currencyName);
  setSetting('currency_symbol', currencySymbol);
  setSetting('welcome_bonus', String(welcomeBonus));

  return NextResponse.json({ ok: true, settings: getStoreSettings() });
}