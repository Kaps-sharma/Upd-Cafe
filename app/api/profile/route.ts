import { NextRequest, NextResponse } from 'next/server';
import { getAuthMember } from '@/lib/auth';
import { updateMemberProfile, MemberProfileError } from '@/lib/db';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest) {
  const member = await getAuthMember();
  if (!member) {
    return NextResponse.json({ error: 'Not logged in.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const updates: { name?: string; phone?: string; address?: string } = {};
  if (typeof body?.name === 'string') updates.name = body.name;
  if (typeof body?.phone === 'string') updates.phone = body.phone;
  if (typeof body?.address === 'string') updates.address = body.address;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  try {
    const updated = await updateMemberProfile(member.id, updates);
    if (!updated) throw new MemberProfileError('Member not found.');
    return NextResponse.json({ member: updated });
  } catch (error) {
    if (error instanceof MemberProfileError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}