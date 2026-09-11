import { NextResponse } from 'next/server';
import { getStoreSettings } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const settings = await getStoreSettings();
  return NextResponse.json({
    settings: {
      storeName: settings.storeName,
      currencyName: settings.currencyName,
      currencySymbol: settings.currencySymbol,
      welcomeBonus: settings.welcomeBonus,
    },
  });
}