import { NextResponse } from 'next/server';
import { getAuthMember } from '@/lib/auth';
import { getStoreSettings } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const member = await getAuthMember();
  if (!member) {
    return NextResponse.json({ error: 'Not logged in.' }, { status: 401 });
  }
  const settings = getStoreSettings();
  return NextResponse.json({
    member,
    settings: {
      storeName: settings.storeName,
      currencyName: settings.currencyName,
      currencySymbol: settings.currencySymbol,
      welcomeBonus: settings.welcomeBonus,
    },
  });
}