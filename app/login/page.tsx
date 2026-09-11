'use client';

import { useEffect, useState } from 'react';
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

export default function LoginPage() {
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [info, setInfo] = useState<StoreInfo>(DEFAULT_INFO);
  const router = useRouter();

  useEffect(() => {
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
      .then((res) => {
        if (res.ok) router.replace('/');
      })
      .finally(() => setReady(true));
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your name to login or register.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');
      setMessage(
        data.created
          ? `Hello, ${data.member.name}! Your member card is created with a ${formatRupees(
              data.settings.welcomeBonus
            )} welcome wallet.`
          : `Welcome back, ${data.member.name}! Your wallet is ${formatRupees(
              data.member.money
            )}.`
      );
      router.push('/');
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
          Login with your name, or register a new member card and receive{' '}
          {formatRupees(info.welcomeBonus)} in your wallet. Play games to earn{' '}
          {info.currencyName} and save on your orders.
        </p>
        {!ready ? (
          <p className="muted">Checking session...</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              maxLength={40}
              autoFocus
            />
            {message && <p className="status success">{message}</p>}
            {error && <p className="status error">{error}</p>}
            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy ? 'Signing in...' : 'Login / Register'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}