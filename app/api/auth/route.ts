import { NextRequest, NextResponse } from 'next/server';
import { findMemberByName, createMember, getStoreSettings } from '@/lib/db';
import { setSession } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const rawName = typeof body?.name === 'string' ? body.name : '';
  const name = rawName.trim();

  if (!name) {
    return NextResponse.json({ error: 'Please enter your name to login or register.' }, { status: 400 });
  }
  if (name.length > 40) {
    return NextResponse.json({ error: 'Name is too long (maximum 40 characters).' }, { status: 400 });
  }

  const settings = await getStoreSettings();
  let member = await findMemberByName(name);
  let created = false;
  if (!member) {
    member = await createMember(name, settings.welcomeBonus);
    created = true;
  }

  await setSession(member.id);
  return NextResponse.json({
    member,
    created,
    settings: {
      storeName: settings.storeName,
      currencyName: settings.currencyName,
      currencySymbol: settings.currencySymbol,
      welcomeBonus: settings.welcomeBonus,
    },
  });
}