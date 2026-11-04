import { NextRequest, NextResponse } from 'next/server';
import {
  createMemberAccount,
  verifyMemberCredentials,
  getStoreSettings,
  MemberAuthError,
} from '@/lib/db';
import { setSession } from '@/lib/auth';
import type { StoreSettings } from '@/lib/store';

export const runtime = 'nodejs';

function settingsPayload(settings: StoreSettings) {
  return {
    storeName: settings.storeName,
    currencyName: settings.currencyName,
    currencySymbol: settings.currencySymbol,
    welcomeBonus: settings.welcomeBonus,
  };
}

type AuthBody = { username?: string; password?: string; mode?: string; consent?: boolean };

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as AuthBody | null;
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const mode = body?.mode === 'signup' ? 'signup' : 'signin';

  if (!username) {
    return NextResponse.json({ error: 'Please enter your member ID.' }, { status: 400 });
  }
  if (!password) {
    return NextResponse.json({ error: 'Please enter your password.' }, { status: 400 });
  }

  const settings = await getStoreSettings();

  if (mode === 'signup') {
    if (body?.consent !== true) {
      return NextResponse.json(
        { error: 'Please accept the privacy policy to create an account.' },
        { status: 400 }
      );
    }

    try {
      const member = await createMemberAccount(
        username,
        password,
        settings.welcomeBonus,
        true
      );
      await setSession(member.id);
      return NextResponse.json(
        { member, created: true, settings: settingsPayload(settings) },
        { status: 201 }
      );
    } catch (error) {
      if (error instanceof MemberAuthError) {
        const alreadyTaken = error.message.includes('already taken');
        return NextResponse.json(
          { error: error.message },
          { status: alreadyTaken ? 409 : 400 }
        );
      }
      throw error;
    }
  }

  const member = await verifyMemberCredentials(username, password);
  if (!member) {
    return NextResponse.json(
      { error: 'Incorrect member ID or password.' },
      { status: 401 }
    );
  }
  await setSession(member.id);
  return NextResponse.json({ member, created: false, settings: settingsPayload(settings) });
}
