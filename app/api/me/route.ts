import { NextResponse } from 'next/server';
import { getAuthMember, getMemberId } from '@/lib/auth';
import { getStoreSettings } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const member = await getAuthMember();
  const authenticated = (await getMemberId()) !== null;
  if (!member) {
    return NextResponse.json({ error: 'Not logged in.' }, { status: 401 });
  }
  const settings = await getStoreSettings();
  return NextResponse.json({
    member,
    authenticated,
    settings: {
      storeName: settings.storeName,
      currencyName: settings.currencyName,
      currencySymbol: settings.currencySymbol,
      welcomeBonus: settings.welcomeBonus,
    },
  });
}