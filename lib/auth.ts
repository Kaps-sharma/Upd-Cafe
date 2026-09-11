import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { MemberPublic } from '@/lib/store';
import { getMember } from '@/lib/db';

const SESSION_COOKIE = 'snake_session';
const ADMIN_COOKIE = 'snake_admin';
const SECRET = process.env.SNAKE_CAFE_SECRET ?? 'snake-cafe-dev-secret-change-me';

function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('hex');
}

function verifyToken(raw: string): string | null {
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  try {
    const ok = timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'));
    if (!ok) return null;
  } catch {
    return null;
  }
  return payload;
}

export async function getMemberId(): Promise<number | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const payload = verifyToken(raw);
  if (payload == null) return null;
  const parsed = Number(payload);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function setSession(memberId: number): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, `${memberId}.${sign(String(memberId))}`, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function requireMember(): Promise<MemberPublic> {
  const id = await getMemberId();
  if (id == null) redirect('/login');
  const member = await getMember(id);
  if (!member) redirect('/login');
  return member;
}

export async function getAuthMember(): Promise<MemberPublic | null> {
  const id = await getMemberId();
  if (id == null) return null;
  return await getMember(id);
}

export async function setAdminSession(): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, `admin.${sign('admin')}`, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24,
  });
}

export async function clearAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

export async function isAdminSession(): Promise<boolean> {
  const store = await cookies();
  const raw = store.get(ADMIN_COOKIE)?.value;
  if (!raw) return false;
  return verifyToken(raw) === 'admin';
}