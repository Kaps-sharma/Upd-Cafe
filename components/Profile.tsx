'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatCoins, formatRupees, DEFAULT_CURRENCY_SYMBOL } from '@/lib/store';
import { BALANCE_CHANGED_EVENT } from '@/lib/events';
import type { BookingInvoice, CoinTransaction } from '@/lib/db';
import {
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  isOrderClosed,
  type Order,
} from '@/lib/orders';
import { TABLES } from '@/lib/tables';
import PaymentModal from '@/components/PaymentModal';

const TABLE_LABELS = new Map(TABLES.map((table) => [table.id, table.label]));

interface ProfileMember {
  id: number;
  username: string;
  name: string;
  sc: number;
  money: number;
  phone: string;
  address: string;
  upiId: string;
}

interface ProfileProps {
  currencyName: string;
  currencySymbol?: string;
  member: ProfileMember;
  coins: CoinTransaction[];
}

type Status = { type: 'success' | 'error'; text: string } | null;

const GAME_LABELS: Record<string, string> = {
  tictactoe: 'Tic Tac Toe',
  guess: 'Guess the Number',
  quiz: 'Quiz',
};

/** Human-readable label for one line of the coin ledger. */
function coinDescription(tx: CoinTransaction): string {
  switch (tx.reason) {
    case 'game_win':
      return GAME_LABELS[tx.ref] ? `Won at ${GAME_LABELS[tx.ref]}` : 'Won in a game';
    case 'order_discount':
      return tx.ref ? `Redeemed on order #${tx.ref}` : 'Redeemed on an order';
    case 'welcome':
      return 'Welcome bonus';
    case 'admin_adjust':
      return 'Adjusted by staff';
    default:
      return 'Coin adjustment';
  }
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatDate(value: string): string {
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export default function Profile({
  currencyName,
  currencySymbol = DEFAULT_CURRENCY_SYMBOL,
  member: initialMember,
  coins,
}: ProfileProps) {
  const [member, setMember] = useState<ProfileMember>(initialMember);
  const [name, setName] = useState(initialMember.name);
  const [phone, setPhone] = useState(initialMember.phone);
  const [address, setAddress] = useState(initialMember.address);
  const [status, setStatus] = useState<Status>(null);
  const [saving, setSaving] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [bookings, setBookings] = useState<BookingInvoice[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadOrders = async () => {
    const res = await fetch('/api/orders', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setOrders(data.orders ?? []);
    }
    setLoadingOrders(false);
  };

  const loadBookings = async () => {
    const res = await fetch('/api/book', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setBookings(data.bookings ?? []);
    }
    setLoadingBookings(false);
  };

  useEffect(() => {
    loadOrders();
    loadBookings();
    const handler = async () => {
      const res = await fetch('/api/me', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setMember(data.member);
      }
    };
    window.addEventListener(BALANCE_CHANGED_EVENT, handler);
    return () => window.removeEventListener(BALANCE_CHANGED_EVENT, handler);
  }, []);

  const handleDelete = async () => {
    setDeleteError(null);
    if (!deletePassword) {
      setDeleteError('Enter your password to confirm.');
      return;
    }
    const ok = window.confirm(
      'Delete your account? Your profile, orders, bookings, wallet and coin history will be removed permanently. This cannot be undone.'
    );
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error ?? 'Could not delete your account.');
        return;
      }
      window.location.href = '/';
    } catch {
      setDeleteError('Could not reach the server. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    setStatus(null);
    if (!name.trim()) {
      setStatus({ type: 'error', text: 'Name cannot be empty.' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), address: address.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: 'error', text: data.error ?? 'Could not save changes.' });
        return;
      }
      setMember(data.member);
      setStatus({ type: 'success', text: 'Profile saved.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container">
      <div className="page-head-row">
        <div>
          <h1>Your profile</h1>
          <p className="subtitle">Manage your details, wallet and order history.</p>
        </div>
        <div className="wallet-pills">
          <button className="balance-pill balance-pill-btn" onClick={() => setPaymentOpen(true)} title="Tap to add money">
            <span className="balance-pill-label">Wallet</span>
            <strong>{formatRupees(member.money)}</strong>
          </button>
          <div className="balance-pill">
            <span className="balance-pill-label">{currencyName}</span>
            <strong>{formatCoins(member.sc, currencySymbol)}</strong>
          </div>
        </div>
      </div>

      <div className="profile-grid">
        <div className="card profile-card">
          <h2>Details</h2>
          <label className="field-label">Member ID (used to log in)</label>
          <input className="input" type="text" value={member.username} readOnly />
          <label className="field-label">Name</label>
          <input className="input" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          <label className="field-label">Phone (10 digits)</label>
          <input className="input input-num" type="text" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, '').slice(0, 10))} placeholder="9876543210" />
          <label className="field-label">Address</label>
          <textarea className="input" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} rows={3} placeholder="Street, city, pincode" />

          {status && (
            <p className={status.type === 'success' ? 'status success' : 'status error'}>{status.text}</p>
          )}

          <div className="actions">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>

          <h2 className="section-gap">Wallet</h2>
          <p className="muted">
            Pay directly from your wallet. Tap your balance to add money via UPI.
          </p>
          {member.upiId && (
            <p className="muted note">
              Saved UPI ID: <strong>{member.upiId}</strong>
            </p>
          )}
          <div className="actions">
            <button className="btn btn-primary" onClick={() => setPaymentOpen(true)}>
              Add money
            </button>
          </div>

          <h2 className="section-gap">Privacy &amp; data</h2>
          <p className="muted">
            Read the <Link href="/privacy">privacy policy</Link> to see what we store and why. You
            can delete your account and all of its data here at any time.
          </p>

          <label className="field-label" htmlFor="delete-password">
            Password
          </label>
          <input
            id="delete-password"
            className="input"
            type="password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            placeholder="Confirm with your password"
            autoComplete="current-password"
            maxLength={200}
          />
          {deleteError && <p className="status error">{deleteError}</p>}
          <div className="actions">
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete my account & data'}
            </button>
          </div>
        </div>

        <div className="profile-stack">
          <div className="card profile-card">
            <h2>Orders</h2>
            {loadingOrders ? (
              <p className="muted">Loading orders...</p>
            ) : orders.length === 0 ? (
              <p className="muted">No orders yet. Browse the menu to order something.</p>
            ) : (
              <ul className="invoice-list">
                {orders.map((order) => (
                  <li key={order.id} className="invoice-entry">
                    <div className="invoice-head-line">
                      <strong>Order {order.orderNo}</strong>
                      <span className={`order-badge ${order.status}`}>
                        {ORDER_STATUS_LABEL[order.status]}
                      </span>
                    </div>
                    <p className="muted order-meta">
                      {formatTimestamp(order.createdAt)} · {ORDER_TYPE_LABEL[order.orderType]}
                      {order.tableNumber
                        ? ` · ${TABLE_LABELS.get(order.tableNumber) ?? order.tableNumber}`
                        : ''}
                    </p>
                    {order.items.length > 0 ? (
                      <div className="invoice-table">
                        <div className="invoice-row invoice-head">
                          <span>Item</span>
                          <span>Qty</span>
                          <span>Price</span>
                          <span>Amount</span>
                        </div>
                        {order.items.map((item, index) => (
                          <div key={`${order.id}-${item.name}-${index}`} className="invoice-row">
                            <span>{item.name}</span>
                            <span>{item.quantity}</span>
                            <span>{formatRupees(item.price)}</span>
                            <span>{formatRupees(item.price * item.quantity)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="muted note">No item detail saved for this order.</p>
                    )}
                    {order.coinsUsed > 0 && (
                      <div className="invoice-line">
                        <span>{currencyName} used</span>
                        <span>{formatCoins(order.coinsUsed, currencySymbol)}</span>
                      </div>
                    )}
                    <div className="invoice-line">
                      <span>{order.status === 'cancelled' ? 'Refunded' : 'Total paid'}</span>
                      <strong>{formatRupees(order.total)}</strong>
                    </div>
                    <div className="actions actions-tight">
                      <Link href={`/orders/${order.id}`} className="btn btn-sm">
                        {isOrderClosed(order.status) ? 'View invoice' : 'Track order'}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card profile-card">
            <h2>{currencyName} history</h2>
            <p className="muted">
              Every coin earned and spent, newest first. Coins can pay for up to a set share of
              each bill, so they always stretch your wallet further without making an order free.
            </p>
            {coins.length === 0 ? (
              <p className="muted">No coin activity yet. Win a game to start earning.</p>
            ) : (
              <ul className="invoice-list">
                {coins.map((tx) => (
                  <li key={tx.id} className="invoice-entry">
                    <div className="invoice-head-line">
                      <strong>{coinDescription(tx)}</strong>
                      <span className={tx.amount >= 0 ? 'status success' : 'status error'}>
                        {tx.amount >= 0 ? '+' : ''}
                        {formatCoins(tx.amount, currencySymbol)}
                      </span>
                    </div>
                    <p className="muted order-meta">{formatTimestamp(tx.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card profile-card">
            <h2>Dine-In history</h2>
            {loadingBookings ? (
              <p className="muted">Loading bookings...</p>
            ) : bookings.length === 0 ? (
              <p className="muted">No table bookings yet. Reserve a table from the Book page.</p>
            ) : (
              <ul className="invoice-list">
                {bookings.map((b) => (
                  <li key={b.id} className="invoice-entry">
                    <div className="invoice-head-line">
                      <strong>Booking {b.bookingNo}</strong>
                      <span className="muted">{formatTimestamp(b.timestamp)}</span>
                    </div>
                    <div className="invoice-line">
                      <span>Date</span>
                      <strong>{formatDate(b.date)}</strong>
                    </div>
                    <div className="invoice-line">
                      <span>Time</span>
                      <strong>{b.slotLabel}</strong>
                    </div>
                    <div className="invoice-line">
                      <span>Table</span>
                      <strong>
                        {b.tableLabel} · {b.seats} {b.seats === 1 ? 'seat' : 'seats'}
                      </strong>
                    </div>
                    <div className="invoice-line">
                      <span>Status</span>
                      <strong className={b.status === 'cancelled' ? 'status error' : 'status success'}>
                        {b.status === 'cancelled'
                          ? 'Cancelled'
                          : b.status === 'seated'
                            ? 'Seated'
                            : 'Confirmed'}
                      </strong>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {paymentOpen && (
        <PaymentModal
          member={{ name: member.name, money: member.money }}
          onClose={() => setPaymentOpen(false)}
          onUpdated={(money, upiId) => {
            setMember((prev) => ({ ...prev, money, upiId }));
            setPaymentOpen(false);
          }}
        />
      )}
    </div>
  );
}