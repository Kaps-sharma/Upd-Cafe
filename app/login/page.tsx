'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatRupees, DEFAULT_CURRENCY_SYMBOL } from '@/lib/store';

interface StoreInfo {
  storeName: string;
  currencyName: string;
  currencySymbol: string;
  welcomeBonus: number;
}

const DEFAULT_INFO: StoreInfo = {
  storeName: 'Snake Cafe',
  currencyName: 'Snake Coins',
  currencySymbol: DEFAULT_CURRENCY_SYMBOL,
  welcomeBonus: 20,
};

const MEMBER_ID_PATTERN = /^[a-zA-Z0-9._-]{3,30}$/;

type Mode = 'signin' | 'signup';

/** Only ever redirect to a page on this site, never to an external URL or back to login. */
function nextPath(): string {
  if (typeof window === 'undefined') return '/';
  const raw = new URLSearchParams(window.location.search).get('next');
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  if (raw === '/login' || raw.startsWith('/login?') || raw.startsWith('/api/')) return '/';
  return raw;
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [info, setInfo] = useState<StoreInfo>(DEFAULT_INFO);
  const router = useRouter();

  useEffect(() => {
    const target = nextPath();

    fetch('/api/storeinfo', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.settings) {
          setInfo({
            storeName: data.settings.storeName,
            currencyName: data.settings.currencyName,
            currencySymbol: data.settings.currencySymbol,
            welcomeBonus: data.settings.welcomeBonus,
          });
        }
      })
      .catch(() => undefined);

    fetch('/api/me', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.authenticated) router.replace(target);
        else setReady(true);
      })
      .catch(() => setReady(true));
  }, [router]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setPassword('');
    setConfirm('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = username.trim().toLowerCase();

    if (!MEMBER_ID_PATTERN.test(cleanId)) {
      setError('Member ID must be 3–30 characters using letters, numbers, dots, dashes or underscores.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (mode === 'signup' && password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (mode === 'signup' && !consent) {
      setError('Please accept the privacy policy to create an account.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanId, password, mode, consent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');
      router.replace(nextPath());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="brand-large">
          <span className="brand-mark">SC</span>
        </div>
        <h1>Welcome to {info.storeName}</h1>
        <p className="auth-subtitle">
          Log in with your member ID and password, or create an account and receive{' '}
          {formatRupees(info.welcomeBonus)} in your wallet. Play games to earn{' '}
          {info.currencyName} and save on your orders.
        </p>

        {!ready ? (
          <p className="muted">Checking session...</p>
        ) : (
          <>
            <div className="auth-mode" role="tablist" aria-label="Log in or create account">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'signin'}
                className={mode === 'signin' ? 'auth-mode-btn active' : 'auth-mode-btn'}
                onClick={() => switchMode('signin')}
              >
                Log in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'signup'}
                className={mode === 'signup' ? 'auth-mode-btn active' : 'auth-mode-btn'}
                onClick={() => switchMode('signup')}
              >
                Sign up
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <label className="auth-label" htmlFor="auth-username">
                Member ID
              </label>
              <input
                id="auth-username"
                className="input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. ananya_23"
                maxLength={30}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
              />
              <p className="muted auth-hint">
                3–30 characters: letters, numbers, dots, dashes or underscores.
              </p>

              <label className="auth-label" htmlFor="auth-password">
                Password
              </label>
              <input
                id="auth-password"
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                maxLength={200}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />

              {mode === 'signup' && (
                <>
                  <label className="auth-label" htmlFor="auth-confirm">
                    Confirm password
                  </label>
                  <input
                    id="auth-confirm"
                    className="input"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat your password"
                    maxLength={200}
                    autoComplete="new-password"
                  />

                  <label className="consent-check">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    <span>
                      I agree to the <Link href="/privacy" target="_blank">privacy policy</Link> and
                      consent to my data being used to run my account, orders and bookings.
                    </span>
                  </label>
                </>
              )}

              {error && <p className="status error">{error}</p>}

              <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
                {busy
                  ? 'Working...'
                  : mode === 'signup'
                    ? `Create account (+${formatRupees(info.welcomeBonus)})`
                    : 'Log in'}
              </button>
            </form>

            <p className="auth-subtitle auth-secure">
              Your password is stored as a salted scrypt hash, never in plain text.
            </p>
            <p className="auth-subtitle">
              <Link href="/">← Back to home</Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
