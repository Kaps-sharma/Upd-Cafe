'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { MenuItem } from '@/lib/store';
import {
  formatCoins,
  formatRupees,
  SC_PER_RUPEE,
  DEFAULT_CURRENCY_SYMBOL,
} from '@/lib/store';
import { emitBalanceChanged } from '@/lib/events';
import { type CartItem, getCart, updateCartQuantity, clearCart, cartTotals } from '@/lib/cart';

interface CartMember {
  name: string;
  money: number;
  sc: number;
}

interface CartViewProps {
  storeName: string;
  currencyName: string;
  currencySymbol?: string;
  items: MenuItem[];
  member: CartMember;
  onMemberChange?: (member: CartMember) => void;
}

interface PlacedOrder {
  orderId: number;
  items: { name: string; price: number; quantity: number }[];
  total: number;
  discount: number;
  scUsed: number;
  amountPaid: number;
  details: string;
}

type Status = { type: 'success' | 'error'; text: string } | null;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export default function CartView({
  storeName,
  currencyName,
  currencySymbol = DEFAULT_CURRENCY_SYMBOL,
  items,
  member,
}: CartViewProps) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [money, setMoney] = useState(member.money);
  const [sc, setSc] = useState(member.sc);
  const [status, setStatus] = useState<Status>(null);
  const [placing, setPlacing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [scField, setScField] = useState('');
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);

  useEffect(() => {
    setCartItems(getCart());
    const sync = () => setCartItems(getCart());
    sync();
    window.addEventListener('snake:cart-changed', sync);
    return () => window.removeEventListener('snake:cart-changed', sync);
  }, []);

  const priceMap = new Map(items.map((i) => [i.name, i.price]));
  const { subtotal, count } = cartTotals(cartItems);
  const total = subtotal;

  const maxScUsable = Math.min(sc, Math.floor(total * SC_PER_RUPEE));
  const parsedSc = Number(scField);
  const scUsed = Number.isFinite(parsedSc) ? Math.min(Math.max(0, Math.floor(parsedSc)), maxScUsable) : 0;
  const discount = round2(scUsed / SC_PER_RUPEE);
  const amountToPay = round2(total - discount);
  const shortfall = round2(amountToPay - money);

  const refreshBalance = async () => {
    const res = await fetch('/api/me', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setMoney(data.member.money);
      setSc(data.member.sc);
    }
  };

  const placeOrder = async () => {
    setPlacing(true);
    setStatus(null);
    try {
      const res = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cartItems.map((i) => ({ name: i.name, quantity: i.quantity })),
          scUsed,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: 'error', text: data.error ?? 'Something went wrong.' });
        setReviewing(false);
        return;
      }
      setPlaced(data as PlacedOrder);
      setReviewing(false);
      setCartItems([]);
      clearCart();
      setScField('');
      emitBalanceChanged();
      refreshBalance();
    } finally {
      setPlacing(false);
    }
  };

  const openReview = () => {
    if (count === 0) {
      setStatus({ type: 'error', text: 'Your cart is empty.' });
      return;
    }
    if (money < amountToPay) {
      setStatus({
        type: 'error',
        text:
          scUsed > 0
            ? `Insufficient money — you need ${formatRupees(shortfall)} more. Add Snake Coins or top up your wallet.`
            : `Insufficient money — you need ${formatRupees(shortfall)} more. Apply Snake Coins as a discount or top up your wallet.`,
      });
      return;
    }
    setStatus(null);
    setReviewing(true);
  };

  if (placed) {
    return (
      <div className="container">
        <div className="card invoice-card">
          <h1>Order confirmed</h1>
          <p className="subtitle">
            {storeName} · Order #{String(placed.orderId).padStart(4, '0')} ·{' '}
            {new Date().toLocaleString(undefined, {
              dateStyle: 'long',
              timeStyle: 'short',
            })}
          </p>

          <div className="invoice-table">
            <div className="invoice-row invoice-head">
              <span>Item</span>
              <span>Qty</span>
              <span>Price</span>
              <span>Amount</span>
            </div>
            {placed.items.map((item) => (
              <div key={item.name} className="invoice-row">
                <span>{item.name}</span>
                <span>{item.quantity}</span>
                <span>{formatRupees(item.price)}</span>
                <span>{formatRupees(round2(item.price * item.quantity))}</span>
              </div>
            ))}
          </div>

          <div className="order-line">
            <span>Subtotal</span>
            <strong>{formatRupees(placed.total)}</strong>
          </div>
          <div className="order-line">
            <span>{currencyName} discount ({formatCoins(placed.scUsed, currencySymbol)})</span>
            <span className="discount-amount">
              {placed.discount > 0 ? `−${formatRupees(placed.discount)}` : formatRupees(0)}
            </span>
          </div>
          <div className="order-total">
            <span>Total paid</span>
            <strong>{formatRupees(placed.amountPaid)}</strong>
          </div>
          <p className="muted note">
            Paid from your wallet. A copy of this invoice is saved under{' '}
            <Link href="/profile">your profile</Link>.
          </p>
          <div className="actions">
            <Link href="/menu" className="btn btn-primary">
              Order more
            </Link>
            <Link href="/profile" className="btn">
              View invoices
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container cart-page">
      <div className="page-head-row">
        <div>
          <h1>Your cart</h1>
          <p className="subtitle">
            {count === 0
              ? 'Nothing in your cart yet.'
              : `${count} item${count === 1 ? '' : 's'} ready to order from ${storeName}.`}
          </p>
        </div>
        <div className="wallet-pills">
          <Link href="/profile" className="balance-pill balance-pill-link">
            <span className="balance-pill-label">Wallet</span>
            <strong>{formatRupees(money)}</strong>
          </Link>
          <div className="balance-pill">
            <span className="balance-pill-label">{currencyName}</span>
            <strong>{formatCoins(sc, currencySymbol)}</strong>
          </div>
        </div>
      </div>

      {count === 0 ? (
        <div className="card empty-cart">
          <p className="muted">Your cart is empty.</p>
          <Link href="/menu" className="btn btn-primary">
            Browse the menu
          </Link>
        </div>
      ) : (
        <div className="card order-summary">
          <ul className="order-list">
            {cartItems.map((item) => {
              const menuItem = items.find((i) => i.name === item.name);
              const price = menuItem ? menuItem.price : item.price;
              return (
                <li key={item.name} className="cart-line">
                  <div className="cart-line-info">
                    <span className="cart-line-name">{item.name}</span>
                    <span className="muted">{formatRupees(price)} each</span>
                  </div>
                  <div className="stepper">
                    <button
                      className="btn btn-sm"
                      onClick={() => updateCartQuantity(item.name, item.quantity - 1)}
                      aria-label={`Remove one ${item.name}`}
                    >
                      -
                    </button>
                    <span className="stepper-value">{item.quantity}</span>
                    <button
                      className="btn btn-sm"
                      onClick={() => updateCartQuantity(item.name, item.quantity + 1)}
                      aria-label={`Add one ${item.name}`}
                    >
                      +
                    </button>
                  </div>
                  <strong>{formatRupees(round2(price * item.quantity))}</strong>
                </li>
              );
            })}
          </ul>

          <div className="order-line">
            <span>Subtotal</span>
            <strong>{formatRupees(total)}</strong>
          </div>

          {sc > 0 && total > 0 && (
            <div className="discount-box">
              <label>
                <span>Apply {currencyName}</span>
                <div className="discount-controls">
                  <input
                    className="input input-sm input-num"
                    type="number"
                    min={0}
                    max={sc}
                    value={scField}
                    placeholder="0"
                    onChange={(e) => setScField(e.target.value)}
                  />
                  <button
                    className="btn btn-sm"
                    onClick={() => setScField(String(maxScUsable))}
                    disabled={maxScUsable === 0}
                  >
                    Use max
                  </button>
                </div>
              </label>
              <p className="muted note">
                {scUsed > 0
                  ? `You save ${formatRupees(discount)} using ${formatCoins(scUsed, currencySymbol)}.`
                  : `100 ${currencySymbol} = ₹1. You have ${formatCoins(sc, currencySymbol)}.`}
              </p>
            </div>
          )}

          <div className="order-line">
            <span>{currencyName} discount</span>
            <span className="discount-amount">
              {scUsed > 0 ? `−${formatRupees(discount)}` : formatRupees(0)}
            </span>
          </div>

          <div className="order-total">
            <span>To pay</span>
            <strong>{formatRupees(amountToPay)}</strong>
          </div>

          {money < amountToPay && (
            <p className="status error">
              You need {formatRupees(shortfall)} more to pay. Add Snake Coins or top up your wallet.
            </p>
          )}

          {status && (
            <p className={status.type === 'success' ? 'status success' : 'status error'}>
              {status.text}
            </p>
          )}

          <div className="actions">
            <button className="btn btn-primary" onClick={openReview} disabled={placing || count === 0}>
              Review &amp; pay
            </button>
            <Link href="/menu" className="btn">
              Keep shopping
            </Link>
          </div>
        </div>
      )}

      {reviewing && (
        <div className="modal-overlay" onClick={() => setReviewing(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Confirm your order</h2>
            <p className="muted">
              {member.name} · {new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
            <ul className="order-list">
              {cartItems.map((item) => {
                const menuItem = items.find((i) => i.name === item.name);
                const price = menuItem ? menuItem.price : item.price;
                return (
                  <li key={item.name}>
                    <span>
                      {item.name} x{item.quantity}
                    </span>
                    <span>{formatRupees(round2(price * item.quantity))}</span>
                  </li>
                );
              })}
            </ul>
            <div className="order-line">
              <span>Subtotal</span>
              <strong>{formatRupees(total)}</strong>
            </div>
            <div className="order-line">
              <span>{currencyName} discount</span>
              <span>{scUsed > 0 ? `−${formatRupees(discount)}` : '—'}</span>
            </div>
            <div className="order-total">
              <span>Amount to pay</span>
              <strong>{formatRupees(amountToPay)}</strong>
            </div>
            <div className="order-total">
              <span>Wallet after</span>
              <strong>{formatRupees(round2(money - amountToPay))}</strong>
            </div>
            <div className="order-total">
              <span>{currencyName} after</span>
              <strong>{formatCoins(round2(sc - scUsed), currencySymbol)}</strong>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setReviewing(false)} disabled={placing}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={placeOrder} disabled={placing}>
                {placing ? 'Paying...' : `Pay ${formatRupees(amountToPay)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}