'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { formatCoins, formatRupees, DEFAULT_CURRENCY_SYMBOL } from '@/lib/store';
import { emitBalanceChanged } from '@/lib/events';
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_HINT,
  ORDER_TYPE_LABEL,
  PROGRESS_STEPS,
  isOrderClosed,
  progressStep,
  type Order,
} from '@/lib/orders';
import { TABLES } from '@/lib/tables';

const TABLE_LABELS = new Map(TABLES.map((table) => [table.id, table.label]));

const POLL_MS = 6000;

interface OrderTrackerProps {
  initialOrder: Order;
  storeName: string;
  currencyName: string;
  currencySymbol?: string;
  gstPercent?: number;
  fssaiNumber?: string;
  gstin?: string;
  invoiceNote?: string;
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function placeOf(order: Order): string {
  if (order.orderType === 'dine_in' && order.tableNumber) {
    return `Table ${TABLE_LABELS.get(order.tableNumber) ?? order.tableNumber}`;
  }
  return ORDER_TYPE_LABEL[order.orderType];
}

export default function OrderTracker({
  initialOrder,
  storeName,
  currencyName,
  currencySymbol = DEFAULT_CURRENCY_SYMBOL,
  gstPercent = 0,
  fssaiNumber = '',
  gstin = '',
  invoiceNote = '',
}: OrderTrackerProps) {
  const [order, setOrder] = useState<Order>(initialOrder);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Keep the page live while the order is still open. Polling is plenty for a
  // café-sized app and avoids the complexity of websockets.
  useEffect(() => {
    if (isOrderClosed(order.status)) return;

    const tick = async () => {
      try {
        const res = await fetch(`/api/orders/${order.id}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (alive.current && data.order) setOrder(data.order as Order);
      } catch {
        // A dropped poll is not worth showing an error for; the next one retries.
      }
    };

    const timer = setInterval(tick, POLL_MS);
    return () => clearInterval(timer);
  }, [order.id, order.status]);

  const step = progressStep(order.status);

  // Menu prices already include GST, so the tax is the part of the total that
  // belongs to the government. Nothing is added to what the member paid.
  const gstAmount =
    gstPercent > 0
      ? Math.round(((order.total * gstPercent) / (100 + gstPercent)) * 100) / 100
      : 0;

  const cancel = async () => {
    const ok = window.confirm(
      `Cancel order ${order.orderNo}? The amount you paid is refunded to your wallet.`
    );
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not cancel the order.');
        return;
      }
      setOrder(data.order as Order);
      emitBalanceChanged();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <div className="page-head-row no-print">
        <div>
          <h1>Order {order.orderNo}</h1>
          <p className="subtitle">
            {placeOf(order)} · {formatWhen(order.createdAt)}
          </p>
        </div>
        <Link href="/profile" className="btn">
          All my orders
        </Link>
      </div>

      <div className="card printable">
        <div className="invoice-head-line">
          <div>
            <h2 className="invoice-store">{storeName}</h2>
            <p className="muted">
              Order {order.orderNo} · {placeOf(order)}
            </p>
          </div>
          <span className={`order-badge ${order.status}`}>{ORDER_STATUS_LABEL[order.status]}</span>
        </div>

        {order.status === 'cancelled' ? (
          <div className="tracker-cancelled">
            <strong>Cancelled</strong>
            <p className="muted">{ORDER_STATUS_HINT.cancelled}</p>
          </div>
        ) : (
          <>
            <p className="tracker-hint">{ORDER_STATUS_HINT[order.status]}</p>
            <ol className="tracker-steps">
              {PROGRESS_STEPS.map((item, index) => {
                const state = index < step ? 'done' : index === step ? 'current' : 'todo';
                return (
                  <li key={item.status} className={`tracker-step ${state}`}>
                    <span className="tracker-dot" aria-hidden="true" />
                    <span className="tracker-label">{item.label}</span>
                  </li>
                );
              })}
            </ol>
          </>
        )}

        <div className="invoice-table">
          <div className="invoice-row invoice-head">
            <span>Item</span>
            <span>Qty</span>
            <span>Price</span>
            <span>Amount</span>
          </div>
          {order.items.map((item, index) => (
            <div key={`${item.name}-${index}`} className="invoice-row">
              <span>{item.name}</span>
              <span>{item.quantity}</span>
              <span>{formatRupees(item.price)}</span>
              <span>{formatRupees(item.price * item.quantity)}</span>
            </div>
          ))}
        </div>

        {order.note && <p className="muted note">Note: {order.note}</p>}

        <div className="order-line">
          <span>Subtotal</span>
          <strong>{formatRupees(order.subtotal)}</strong>
        </div>
        {order.coinDiscount > 0 && (
          <div className="order-line">
            <span>
              {currencyName} discount ({formatCoins(order.coinsUsed, currencySymbol)})
            </span>
            <span className="discount-amount">−{formatRupees(order.coinDiscount)}</span>
          </div>
        )}
        {gstPercent > 0 && (
          <div className="order-line">
            <span>Includes GST @ {gstPercent}%</span>
            <span>{formatRupees(gstAmount)}</span>
          </div>
        )}
        <div className="order-total">
          <span>{order.status === 'cancelled' ? 'Refunded' : 'Total paid'}</span>
          <strong>{formatRupees(order.total)}</strong>
        </div>

        {(gstin || fssaiNumber || invoiceNote) && (
          <div className="invoice-footer">
            {gstin && <p>GSTIN: {gstin}</p>}
            {fssaiNumber && <p>FSSAI licence no. {fssaiNumber}</p>}
            {invoiceNote && <p>{invoiceNote}</p>}
          </div>
        )}

        <p className="muted note">
          Placed {formatWhen(order.createdAt)} · Last update {formatWhen(order.updatedAt)}
        </p>

        {error && <p className="status error">{error}</p>}

        <div className="actions no-print">
          {order.status === 'pending' && (
            <button className="btn" onClick={cancel} disabled={busy}>
              {busy ? 'Cancelling...' : 'Cancel order'}
            </button>
          )}
          <button className="btn" onClick={() => window.print()} disabled={busy}>
            Print invoice
          </button>
        </div>
      </div>
    </div>
  );
}
