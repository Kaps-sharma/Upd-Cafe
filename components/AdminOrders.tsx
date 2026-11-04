'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatRupees } from '@/lib/store';
import {
  ORDER_NEXT,
  ORDER_NEXT_ACTION,
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  type Order,
  type OrderStatus,
} from '@/lib/orders';
import { TABLES } from '@/lib/tables';

const TABLE_LABELS = new Map(TABLES.map((table) => [table.id, table.label]));

const BOARDS: { status: OrderStatus; title: string; hint: string }[] = [
  { status: 'pending', title: 'New', hint: 'Waiting to be started' },
  { status: 'preparing', title: 'Preparing', hint: 'On the bar now' },
  { status: 'ready', title: 'Ready', hint: 'Ready to serve' },
];

const POLL_MS = 8000;

interface AdminOrdersProps {
  initialOpen: Order[];
  initialClosed: Order[];
}

function placeOf(order: Order): string {
  if (order.orderType === 'dine_in') {
    return order.tableNumber
      ? `Table ${TABLE_LABELS.get(order.tableNumber) ?? order.tableNumber}`
      : 'Dine-in';
  }
  return ORDER_TYPE_LABEL[order.orderType];
}

function clockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export default function AdminOrders({ initialOpen, initialClosed }: AdminOrdersProps) {
  const [open, setOpen] = useState<Order[]>(initialOpen);
  const [closed, setClosed] = useState<Order[]>(initialClosed);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    setMounted(true);
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/orders', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (!alive.current) return;
      setOpen(data.open ?? []);
      setClosed(data.closed ?? []);
    } catch {
      // Ignore a dropped poll; the next one retries.
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const act = async (order: Order, body: { status?: OrderStatus; action?: 'cancel' }) => {
    setBusyId(order.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not update the order.');
        return;
      }
      const updated = data.order as Order;
      const stillOpen = ['pending', 'preparing', 'ready'].includes(updated.status);
      setOpen((rows) =>
        stillOpen
          ? rows.map((row) => (row.id === updated.id ? updated : row))
          : rows.filter((row) => row.id !== updated.id)
      );
      setClosed((rows) =>
        stillOpen
          ? rows.filter((row) => row.id !== updated.id)
          : [updated, ...rows.filter((row) => row.id !== updated.id)].slice(0, 25)
      );
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const cancel = (order: Order) => {
    const ok = window.confirm(
      `Cancel order ${order.orderNo}? ${formatRupees(order.total)} is refunded to the customer's wallet.`
    );
    if (ok) act(order, { action: 'cancel' });
  };

  const totalOpen = open.length;

  return (
    <section className="admin-orders">
      <div className="page-head-row">
        <div>
          <h2>Live orders</h2>
          <p className="subtitle">
            {totalOpen === 0
              ? 'Nothing waiting right now. New orders appear here automatically.'
              : `${totalOpen} order${totalOpen === 1 ? '' : 's'} in the queue.`}
          </p>
        </div>
        <button className="btn btn-sm" onClick={load}>
          Refresh
        </button>
      </div>

      {error && <p className="status error">{error}</p>}

      <div className="order-board">
        {BOARDS.map((board) => {
          const rows = open.filter((order) => order.status === board.status);
          return (
            <div key={board.status} className={`order-column col-${board.status}`}>
              <header className="order-column-head">
                <span className="order-column-title">{board.title}</span>
                <span className="order-column-count">{rows.length}</span>
              </header>
              <p className="muted order-column-hint">{board.hint}</p>

              {rows.length === 0 ? (
                <p className="muted order-column-empty">—</p>
              ) : (
                <ul className="order-card-list">
                  {rows.map((order) => {
                    const next = ORDER_NEXT[order.status];
                    const busy = busyId === order.id;
                    return (
                      <li key={order.id} className="order-card">
                        <div className="order-card-head">
                          <strong>{order.orderNo}</strong>
                          <span className="muted" title={clockTime(order.createdAt)}>
                            {mounted ? ago(order.createdAt) : ''}
                          </span>
                        </div>
                        <p className="order-card-meta">
                          {order.memberName} · {placeOf(order)}
                        </p>
                        <ul className="order-card-items">
                          {order.items.map((item, index) => (
                            <li key={`${order.id}-${item.name}-${index}`}>
                              <span className="order-card-qty">{item.quantity}×</span>
                              {item.name}
                            </li>
                          ))}
                        </ul>
                        {order.note && <p className="order-card-note">“{order.note}”</p>}
                        <div className="order-card-foot">
                          <strong>{formatRupees(order.total)}</strong>
                          <span className="muted">{mounted ? clockTime(order.createdAt) : ''}</span>
                        </div>
                        <div className="order-card-actions">
                          {next && (
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => act(order, { status: next })}
                              disabled={busy}
                            >
                              {ORDER_NEXT_ACTION[order.status]}
                            </button>
                          )}
                          <button
                            className="btn btn-sm"
                            onClick={() => cancel(order)}
                            disabled={busy}
                          >
                            Cancel
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <section className="order-history">
        <h2>Recently closed</h2>
        {closed.length === 0 ? (
          <p className="muted">No completed or cancelled orders yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Where</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Closed</th>
                </tr>
              </thead>
              <tbody>
                {closed.map((order) => (
                  <tr key={order.id}>
                    <td>{order.orderNo}</td>
                    <td>{order.memberName}</td>
                    <td>{placeOf(order)}</td>
                    <td>{formatRupees(order.total)}</td>
                    <td>
                      <span className={`order-badge ${order.status}`}>
                        {ORDER_STATUS_LABEL[order.status]}
                      </span>
                    </td>
                    <td>{mounted ? clockTime(order.updatedAt) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
