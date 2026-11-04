'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SalesReport } from '@/lib/db';
import { formatCoins, formatRupees, DEFAULT_CURRENCY_SYMBOL } from '@/lib/store';

interface AdminReportsProps {
  currencySymbol?: string;
}

function shortDay(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export default function AdminReports({ currencySymbol = DEFAULT_CURRENCY_SYMBOL }: AdminReportsProps) {
  const [report, setReport] = useState<SalesReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/reports', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not load the report.');
      setReport(data.report as SalesReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the report.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (report === null) {
    return (
      <section className="card">
        <h2>Sales report</h2>
        {error ? <p className="status error">{error}</p> : <p className="muted">Loading report...</p>}
      </section>
    );
  }

  const today = report.today;

  return (
    <section className="form-card">
      <div className="card">
        <div className="page-head-row">
          <div>
            <h2>Sales today</h2>
            <p className="subtitle">
              {shortDay(today.date)} · counted in {report.timeZone}. Cancelled orders are excluded.
            </p>
          </div>
          <button className="btn btn-sm" onClick={load} disabled={busy}>
            {busy ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {error && <p className="status error">{error}</p>}

        <div className="admin-stats">
          <div className="admin-stat">
            <span>Orders</span>
            <strong>{today.orders}</strong>
          </div>
          <div className="admin-stat">
            <span>Gross sales</span>
            <strong>{formatRupees(today.gross)}</strong>
          </div>
          <div className="admin-stat">
            <span>Collected</span>
            <strong>{formatRupees(today.collected)}</strong>
            <small>after coin discounts</small>
          </div>
          <div className="admin-stat">
            <span>Average ticket</span>
            <strong>{formatRupees(today.averageTicket)}</strong>
            <small>before coin discount</small>
          </div>
          <div className="admin-stat">
            <span>Coins redeemed</span>
            <strong>{formatCoins(today.coinsUsed, currencySymbol)}</strong>
            <small>worth {formatRupees(today.coinDiscount)}</small>
          </div>
        </div>

        {today.orders === 0 && (
          <p className="muted">No paid orders yet today. The numbers will appear as orders come in.</p>
        )}
      </div>

      <div className="card table-card admin-menu-table">
        <h2>Best-selling items today</h2>
        {report.bestSellers.length === 0 ? (
          <p className="muted">Nothing sold yet today.</p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Sold</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {report.bestSellers.map((item) => (
                  <tr key={item.name}>
                    <td>{item.name}</td>
                    <td>{item.quantity}</td>
                    <td>{formatRupees(item.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card table-card admin-menu-table">
        <h2>Last 7 days</h2>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Orders</th>
                <th>Collected</th>
              </tr>
            </thead>
            <tbody>
              {report.last7Days.map((day) => (
                <tr key={day.date}>
                  <td>{shortDay(day.date)}</td>
                  <td>{day.orders}</td>
                  <td>{formatRupees(day.collected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted note">
          Collected is what customers paid after coin discounts, so it matches the money in the
          wallet.
        </p>
      </div>
    </section>
  );
}
