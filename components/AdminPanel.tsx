'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { StoreSettings, MenuItem } from '@/lib/store';
import type { Order } from '@/lib/orders';
import AdminMenuManager from '@/components/AdminMenuManager';
import AdminOrders from '@/components/AdminOrders';
import AdminBookings from '@/components/AdminBookings';
import AdminMembers from '@/components/AdminMembers';
import AdminReports from '@/components/AdminReports';

type Tab = 'orders' | 'bookings' | 'members' | 'reports' | 'settings' | 'menu' | 'security';

interface AdminPanelProps {
  initialSettings: StoreSettings;
  initialItems: MenuItem[];
  initialOpenOrders: Order[];
  initialClosedOrders: Order[];
}

export default function AdminPanel({
  initialSettings,
  initialItems,
  initialOpenOrders,
  initialClosedOrders,
}: AdminPanelProps) {
  const [tab, setTab] = useState<Tab>('orders');

  return (
    <div className="container">
      <h1>Admin</h1>
      <p className="subtitle">Manage live orders, bookings, members, reports, menu items, and security.</p>

      <div className="tabs" role="tablist">
        <button
          className={tab === 'orders' ? 'tab active' : 'tab'}
          onClick={() => setTab('orders')}
        >
          Orders
        </button>
        <button
          className={tab === 'bookings' ? 'tab active' : 'tab'}
          onClick={() => setTab('bookings')}
        >
          Bookings
        </button>
        <button
          className={tab === 'members' ? 'tab active' : 'tab'}
          onClick={() => setTab('members')}
        >
          Members
        </button>
        <button
          className={tab === 'reports' ? 'tab active' : 'tab'}
          onClick={() => setTab('reports')}
        >
          Reports
        </button>
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
        <Link href="/admin/tables" className="tab">
          Table QR
        </Link>
      </div>

      {tab === 'orders' && (
        <AdminOrders initialOpen={initialOpenOrders} initialClosed={initialClosedOrders} />
      )}
      {tab === 'bookings' && <AdminBookings />}
      {tab === 'members' && <AdminMembers currencySymbol={initialSettings.currencySymbol} />}
      {tab === 'reports' && <AdminReports currencySymbol={initialSettings.currencySymbol} />}
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
    timezone: initial.timezone,
    maxDiscountPercent: String(initial.maxDiscountPercent),
    gstPercent: String(initial.gstPercent),
    fssaiNumber: initial.fssaiNumber,
    gstin: initial.gstin,
    invoiceNote: initial.invoiceNote,
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
          timezone: form.timezone,
          maxDiscountPercent: Number(form.maxDiscountPercent),
          gstPercent: Number(form.gstPercent),
          fssaiNumber: form.fssaiNumber,
          gstin: form.gstin,
          invoiceNote: form.invoiceNote,
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
        <label>
          <span>Cafe time zone</span>
          <input
            className="input"
            value={form.timezone}
            maxLength={64}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
          />
          <small>
            IANA name, e.g. Asia/Kolkata. Bookings and &quot;today&quot; use this, even
            when the server runs in UTC.
          </small>
        </label>
        <label>
          <span>Maximum coin discount on a bill (%)</span>
          <input
            className="input"
            type="number"
            min={0}
            max={100}
            step={1}
            value={form.maxDiscountPercent}
            onChange={(e) => setForm({ ...form, maxDiscountPercent: e.target.value })}
          />
          <small>
            Coins can pay for at most this share of an order (default 50%). The rest must come
            from the wallet, so a game win can never make an order free.
          </small>
        </label>
        <label>
          <span>GST rate on invoices (%)</span>
          <input
            className="input"
            type="number"
            min={0}
            max={50}
            step="any"
            value={form.gstPercent}
            onChange={(e) => setForm({ ...form, gstPercent: e.target.value })}
          />
          <small>
            Menu prices are treated as GST-inclusive, so this only prints the tax share on the
            invoice. Use 0 to hide the line.
          </small>
        </label>
        <label>
          <span>FSSAI licence number (optional)</span>
          <input
            className="input"
            inputMode="numeric"
            value={form.fssaiNumber}
            maxLength={14}
            placeholder="14 digits"
            onChange={(e) => setForm({ ...form, fssaiNumber: e.target.value })}
          />
          <small>Printed at the bottom of the invoice when set.</small>
        </label>
        <label>
          <span>GSTIN (optional)</span>
          <input
            className="input"
            value={form.gstin}
            maxLength={15}
            placeholder="07ABCDE1234F1Z5"
            onChange={(e) =>
              setForm({
                ...form,
                gstin: e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ''),
              })
            }
          />
          <small>15-character GST number printed on the invoice when set.</small>
        </label>
        <label className="full-span">
          <span>Invoice footer (optional)</span>
          <input
            className="input"
            value={form.invoiceNote}
            maxLength={160}
            placeholder="e.g. Thank you! Prices include GST. No refunds after 30 minutes."
            onChange={(e) => setForm({ ...form, invoiceNote: e.target.value })}
          />
          <small>One short line shown under the total on every invoice.</small>
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