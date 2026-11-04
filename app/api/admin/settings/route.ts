import { NextRequest, NextResponse } from 'next/server';
import { isAdminSession } from '@/lib/auth';
import { getStoreSettings, setSetting } from '@/lib/db';
import { isValidTimeZone } from '@/lib/time';

export const runtime = 'nodejs';

export async function GET() {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }
  return NextResponse.json({ settings: await getStoreSettings() });
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
  const timezone = typeof body?.timezone === 'string' ? body.timezone.trim() : '';
  const maxDiscountPercent = Number(body?.maxDiscountPercent);
  const gstPercent = Number(body?.gstPercent);
  const fssaiNumber = typeof body?.fssaiNumber === 'string' ? body.fssaiNumber.trim() : '';
  const gstin = typeof body?.gstin === 'string' ? body.gstin.trim().toUpperCase() : '';
  const invoiceNote = typeof body?.invoiceNote === 'string' ? body.invoiceNote.trim() : '';

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
  if (!timezone || !isValidTimeZone(timezone)) {
    return NextResponse.json(
      { error: 'Pick a valid IANA time zone, for example Asia/Kolkata.' },
      { status: 400 }
    );
  }
  if (!Number.isFinite(maxDiscountPercent) || maxDiscountPercent < 0 || maxDiscountPercent > 100) {
    return NextResponse.json(
      { error: 'Maximum coin discount must be a percentage between 0 and 100.' },
      { status: 400 }
    );
  }
  if (!Number.isFinite(gstPercent) || gstPercent < 0 || gstPercent > 50) {
    return NextResponse.json(
      { error: 'GST rate must be a percentage between 0 and 50.' },
      { status: 400 }
    );
  }
  if (fssaiNumber && !/^\d{14}$/.test(fssaiNumber)) {
    return NextResponse.json(
      { error: 'FSSAI licence number must be exactly 14 digits, or left empty.' },
      { status: 400 }
    );
  }
  // GSTIN: 2-digit state code + 10-character PAN + entity no. + 'Z' + checksum.
  if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
    return NextResponse.json(
      { error: 'GSTIN must be 15 characters, for example 07ABCDE1234F1Z5, or left empty.' },
      { status: 400 }
    );
  }
  if (invoiceNote.length > 160) {
    return NextResponse.json(
      { error: 'Invoice note must be 160 characters or fewer.' },
      { status: 400 }
    );
  }

  await setSetting('store_name', storeName);
  await setSetting('currency_name', currencyName);
  await setSetting('currency_symbol', currencySymbol);
  await setSetting('welcome_bonus', String(welcomeBonus));
  await setSetting('timezone', timezone);
  await setSetting('max_discount_percent', String(Math.round(maxDiscountPercent)));
  await setSetting('gst_percent', String(gstPercent));
  await setSetting('fssai_number', fssaiNumber);
  await setSetting('gstin', gstin);
  await setSetting('invoice_note', invoiceNote);

  return NextResponse.json({ ok: true, settings: await getStoreSettings() });
}