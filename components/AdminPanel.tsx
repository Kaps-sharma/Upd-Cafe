'use client';

import { useState } from 'react';
import type { StoreSettings, MenuItem } from '@/lib/store';
import AdminMenuManager from '@/components/AdminMenuManager';

type Tab = 'settings' | 'menu' | 'security';

interface AdminPanelProps {
  initialSettings: StoreSettings;
  initialItems: MenuItem[];
}

export default function AdminPanel({ initialSettings, initialItems }: AdminPanelProps) {
  const [tab, setTab] = useState<Tab>('settings');

  return (
    <div className="container">
      <h1>Admin</h1>
      <p className="subtitle">Manage your store settings, menu items, and security.</p>

      <div className="tabs" role="tablist">
        <button
          className={tab === 'settings' ? 'tab active' : 'tab'}
          onClick={() => setTab('settings')}
        >
          Store settings
        </button>
        <button
          className={tab === 'menu' ? 'tab active' : 'tab'}
          onClick={() => setTab('menu')}
        >
          Menu items
        </button>
        <button
          className={tab === 'security' ? 'tab active' : 'tab'}
          onClick={() => setTab('security')}
        >
          Security
        </button>
      </div>

      {tab === 'settings' && <StoreSettingsForm initial={initialSettings} />}
      {tab === 'menu' && <AdminMenuManager initialItems={initialItems} />}
      {tab === 'security' && <SecurityForm />}
    </div>
  );
}

function StoreSettingsForm({ initial }: { initial: StoreSettings }) {
  const [form, setForm] = useState({
    storeName: initial.storeName,
    currencyName: initial.currencyName,
    currencySymbol: initial.currencySymbol,
    welcomeBonus: String(initial.welcomeBonus),
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: form.storeName,
          currencyName: form.currencyName,
          currencySymbol: form.currencySymbol,
          welcomeBonus: Number(form.welcomeBonus),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not save settings.');
      setMessage({ type: 'success', text: 'Settings saved.' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not save settings.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card form-card">
      <h2>Store settings</h2>
      <div className="form-grid">
        <label>
          <span>Store name</span>
          <input
            className="input"
            value={form.storeName}
            maxLength={60}
            onChange={(e) => setForm({ ...form, storeName: e.target.value })}
          />
        </label>
        <label>
          <span>Currency name</span>
          <input
            className="input"
            value={form.currencyName}
            maxLength={30}
            onChange={(e) => setForm({ ...form, currencyName: e.target.value })}
          />
          <small>e.g. Snake Coins, SuperCoins, Cafe Points</small>
        </label>
        <label>
          <span>Currency symbol</span>
          <input
            className="input"
            value={form.currencySymbol}
            maxLength={10}
            onChange={(e) => setForm({ ...form, currencySymbol: e.target.value })}
          />
          <small>Shown after the amount, e.g. 12.50 SC</small>
        </label>
        <label>
          <span>Welcome bonus for new members (₹)</span>
          <input
            className="input"
            type="number"
            min={0}
            max={1000000}
            step="any"
            value={form.welcomeBonus}
            onChange={(e) => setForm({ ...form, welcomeBonus: e.target.value })}
          />
          <small>Rupees a new member card&apos;s wallet starts with.</small>
        </label>
      </div>
      {message && (
        <p className={message.type === 'success' ? 'status success' : 'status error'}>
          {message.text}
        </p>
      )}
      <div className="actions">
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Saving...' : 'Save settings'}
        </button>
      </div>
      <p className="muted note">
        Tip: set your own admin passcode in the Security tab.
      </p>
    </section>
  );
}

function SecurityForm() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const changePasscode = async () => {
    if (form.next !== form.confirm) {
      setMessage({ type: 'error', text: 'New passcode and confirmation do not match.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/passcode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current: form.current, new: form.next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not change passcode.');
      setMessage({ type: 'success', text: 'Passcode updated.' });
      setForm({ current: '', next: '', confirm: '' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not change passcode.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card form-card">
      <h2>Change admin passcode</h2>
      <p className="muted">
        The passcode protects the admin panel. Keep it secret. The default is{' '}
        <code>admin123</code>.
      </p>
      <div className="form-grid">
        <label>
          <span>Current passcode</span>
          <input
            className="input"
            type="password"
            value={form.current}
            onChange={(e) => setForm({ ...form, current: e.target.value })}
          />
        </label>
        <label>
          <span>New passcode (6+ characters)</span>
          <input
            className="input"
            type="password"
            value={form.next}
            maxLength={64}
            onChange={(e) => setForm({ ...form, next: e.target.value })}
          />
        </label>
        <label>
          <span>Confirm new passcode</span>
          <input
            className="input"
            type="password"
            value={form.confirm}
            maxLength={64}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          />
        </label>
      </div>
      {message && (
        <p className={message.type === 'success' ? 'status success' : 'status error'}>
          {message.text}
        </p>
      )}
      <div className="actions">
        <button className="btn btn-primary" onClick={changePasscode} disabled={busy}>
          {busy ? 'Updating...' : 'Update passcode'}
        </button>
      </div>
    </section>
  );
}