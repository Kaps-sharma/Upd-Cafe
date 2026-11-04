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
import { ORDER_TYPE_LABEL, ORDER_TYPE_HINT, ORDER_STATUS_LABEL } from '@/lib/orders';
import type { OrderType, OrderStatus } from '@/lib/orders';
import { TABLES } from '@/lib/tables';

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
  maxDiscountPercent?: number;
  /** Table id preselected from a scanned table QR code. */
  initialTable?: string;
  onMemberChange?: (member: CartMember) => void;
}

interface PlacedOrder {
  orderId: number;
  orderNo: string;
  status: OrderStatus;
  orderType: OrderType;
  tableNumber: string;
  note: string;
  createdAt: string;
  items: { name: string; price: number; quantity: number }[];
  total: number;
  discount: number;
  scUsed: number;
  amountPaid: number;
  details: string;
}

type Status = { type: 'success' | 'error'; text: string } | null;

const ORDER_TYPES: OrderType[] = ['dine_in', 'takeaway', 'delivery'];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
}

export default function CartView({
  storeName,
  currencyName,
  currencySymbol = DEFAULT_CURRENCY_SYMBOL,
  items,
  member,
  maxDiscountPercent = 50,
  initialTable = '',
}: CartViewProps) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [money, setMoney] = useState(member.money);
  const [sc, setSc] = useState(member.sc);
  const [status, setStatus] = useState<Status>(null);
  const [placing, setPlacing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [scField, setScField] = useState('');
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [tableNumber, setTableNumber] = useState(initialTable);
  const [note, setNote] = useState('');

  useEffect(() => {
    setCartItems(getCart());
    const sync = () => setCartItems(getCart());
    sync();
    window.addEventListener('snake:cart-changed', sync);
    return () => window.removeEventListener('snake:cart-changed', sync);
  }, []);

  // A table scanned on /menu is remembered for the whole visit.
  useEffect(() => {
    if (initialTable) return;
    try {
      const saved = window.sessionStorage.getItem('cafe:table');
      if (saved && TABLES.some((table) => table.id === saved)) setTableNumber(saved);
    } catch {
      // Storage can be unavailable in private mode; the cart still works.
    }
  }, [initialTable]);

  const { subtotal, count } = cartTotals(cartItems);
  const total = subtotal;

  const capFraction = Math.min(100, Math.max(0, maxDiscountPercent)) / 100;
  const maxScUsable = Math.min(sc, Math.floor(total * capFraction * SC_PER_RUPEE));
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
          orderType,
          tableNumber,
          note,
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
      setNote('');
      try {
        window.sessionStorage.removeItem('cafe:table');
      } catch {
        // Ignore storage failures.
      }
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
    if (orderType === 'dine_in' && !tableNumber) {
      setStatus({ type: 'error', text: 'Pick the table you are sitting at.' });
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
        <div className="card invoice-card printable">
          <div className="invoice-head-line">
            <h1>Order confirmed</h1>
            <span className={`order-badge ${placed.status}`}>
              {ORDER_STATUS_LABEL[placed.status]}
            </span>
          </div>
          <p className="subtitle">
            {storeName} · Order {placed.orderNo} · {formatWhen(placed.createdAt)}
          </p>
          <p className="muted order-meta">
            {ORDER_TYPE_LABEL[placed.orderType]}
            {placed.tableNumber
              ? ` · ${TABLES.find((t) => t.id === placed.tableNumber)?.label ?? placed.tableNumber}`
              : ''}
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

          {placed.note && <p className="muted note">Note: {placed.note}</p>}

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
            Paid from your wallet. The kitchen has your order and will update its status as it goes.
          </p>
          <div className="actions no-print">
            <Link href={`/orders/${placed.orderId}`} className="btn btn-primary">
              Track this order
            </Link>
            <Link href="/menu" className="btn">
              Order more
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

          <div className="order-type-box">
            <span className="field-label">How would you like it?</span>
            <div className="type-options">
              {ORDER_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={orderType === type ? 'type-option active' : 'type-option'}
                  onClick={() => setOrderType(type)}
                  aria-pressed={orderType === type}
                >
                  <strong>{ORDER_TYPE_LABEL[type]}</strong>
                  <span>{ORDER_TYPE_HINT[type]}</span>
                </button>
              ))}
            </div>
          </div>

          {orderType === 'dine_in' && (
            <label className="field">
              <span className="field-label">Your table</span>
              <select
                className="input"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
              >
                <option value="">Select your table…</option>
                {TABLES.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.label} · seats {table.capacity}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field">
            <span className="field-label">Note for the kitchen (optional)</span>
            <textarea
              className="input"
              rows={2}
              maxLength={200}
              value={note}
              placeholder="Less sugar, extra shot, no cutlery…"
              onChange={(e) => setNote(e.target.value)}
            />
            <span className="muted note">{note.length}/200</span>
          </label>

          {sc > 0 && total > 0 && (
            <div className="discount-box">
              <label>
                <span>Apply {currencyName}</span>
                <div className="discount-controls">
                  <input
                    className="input input-sm input-num"
                    type="number"
                    min={0}
                    max={maxScUsable}
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
                {` Coins can cover up to ${maxDiscountPercent}% of this bill (max ${formatCoins(
                  maxScUsable,
                  currencySymbol
                )}).`}
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
              {member.name} · {ORDER_TYPE_LABEL[orderType]}
              {orderType === 'dine_in' && tableNumber
                ? ` · ${TABLES.find((t) => t.id === tableNumber)?.label ?? tableNumber}`
                : ''}
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
            {note && <p className="muted note">Note: {note}</p>}
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
