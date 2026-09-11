import { NextResponse } from 'next/server';
import { getAuthMember } from '@/lib/auth';
import { getTransactions, getStoreSettings } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const member = await getAuthMember();
  if (!member) {
    return NextResponse.json({ error: 'Not logged in.' }, { status: 401 });
  }
  const settings = await getStoreSettings();
  return NextResponse.json({ invoices: await getTransactions(member.id), currencySymbol: settings.currencySymbol });
}