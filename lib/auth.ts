import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { MemberPublic } from '@/lib/store';
import { getMember } from '@/lib/db';

const SESSION_COOKIE = 'snake_session';
const ADMIN_COOKIE = 'snake_admin';
const DEV_SECRET = 'snake-cafe-dev-secret-change-me';
const SECRET =
  process.env.SNAKE_CAFE_SECRET?.trim() ||
  (process.env.NODE_ENV === 'production' ? '' : DEV_SECRET);

function sign(payload: string): string {
  if (!SECRET) {
    throw new Error(
      'SNAKE_CAFE_SECRET is not set. Add a long random string to .env.local before signing in.'
    );
  }
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
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** The signed-in member, or null when nobody is logged in. */
export async function getAuthMember(): Promise<MemberPublic | null> {
  const id = await getMemberId();
  if (id == null) return null;
  return getMember(id);
}

export async function isSignedIn(): Promise<boolean> {
  return (await getAuthMember()) !== null;
}

/**
 * Server-component guard. Sends visitors to the login page and brings them
 * back to `nextPath` after a successful login.
 */
export async function requireMember(nextPath?: string): Promise<MemberPublic> {
  const member = await getAuthMember();
  if (member) return member;
  const target =
    nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//')
      ? `/login?next=${encodeURIComponent(nextPath)}`
      : '/login';
  redirect(target);
}

export async function setAdminSession(): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, `admin.${sign('admin')}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
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
