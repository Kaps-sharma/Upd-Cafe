'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BookingInvoice, TodayBookings } from '@/lib/db';
import { formatDateKey } from '@/lib/time';

export default function AdminBookings() {
  const [bookings, setBookings] = useState<BookingInvoice[] | null>(null);
  const [today, setToday] = useState<TodayBookings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/bookings', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not load bookings.');
      setBookings(data.bookings ?? []);
      setToday(data.today ?? null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load bookings.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cancel = async (booking: BookingInvoice) => {
    const ok = window.confirm(
      `Cancel booking ${booking.bookingNo} for ${booking.memberName}? The table becomes available again.`
    );
    if (!ok) return;

    setBusyId(booking.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not cancel the booking.');
      setBookings((rows) => (rows ?? []).filter((row) => row.id !== booking.id));
      setToday((current) =>
        current
          ? {
              ...current,
              bookings: current.bookings.filter((row) => row.id !== booking.id),
              seats: current.bookings
                .filter((row) => row.id !== booking.id)
                .reduce((sum, row) => sum + row.seats, 0),
            }
          : current
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not cancel the booking.');
    } finally {
      setBusyId(null);
    }
  };

  const first = today?.bookings[0];
  const last = today?.bookings[today.bookings.length - 1];

  return (
    <>
      <section className="card">
        <div className="page-head-row">
          <div>
            <h2>Today at a glance</h2>
            <p className="subtitle">
              {today ? formatDateKey(today.date) : 'Reservations for today'} · in the cafe&apos;s
              time zone.
            </p>
          </div>
          <button className="btn btn-sm" onClick={load}>
            Refresh
          </button>
        </div>

        {loadError && <p className="status error">{loadError}</p>}

        {today === null ? (
          <p className="muted">Loading today&apos;s bookings...</p>
        ) : (
          <>
            <div className="admin-stats">
              <div className="admin-stat">
                <span>Bookings</span>
                <strong>{today.bookings.length}</strong>
              </div>
              <div className="admin-stat">
                <span>Guests</span>
                <strong>{today.seats}</strong>
              </div>
              <div className="admin-stat">
                <span>First arrival</span>
                <strong>{first ? first.slotLabel : '—'}</strong>
                {first && <small>{first.tableLabel}</small>}
              </div>
              <div className="admin-stat">
                <span>Last arrival</span>
                <strong>{last ? last.slotLabel : '—'}</strong>
                {last && <small>{last.tableLabel}</small>}
              </div>
            </div>

            {today.bookings.length === 0 ? (
              <p className="muted">No tables booked for today yet.</p>
            ) : (
              <ul className="invoice-list">
                {today.bookings.map((booking) => (
                  <li key={booking.id} className="invoice-entry">
                    <div className="invoice-head-line">
                      <strong>
                        {booking.slotLabel} · {booking.memberName}
                      </strong>
                      <span className="status success">
                        {booking.tableLabel} · {booking.seats}{' '}
                        {booking.seats === 1 ? 'seat' : 'seats'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="card">
        <div className="page-head-row">
          <div>
            <h2>Upcoming bookings</h2>
            <p className="subtitle">
              Confirmed reservations from today onwards. Cancelling frees the table immediately.
            </p>
          </div>
          <button className="btn btn-sm" onClick={load}>
            Refresh
          </button>
        </div>

        {actionError && <p className="status error">{actionError}</p>}

        {bookings === null ? (
          <p className="muted">Loading bookings...</p>
        ) : bookings.length === 0 ? (
          <p className="muted">No upcoming bookings.</p>
        ) : (
          <ul className="invoice-list">
            {bookings.map((booking) => (
              <li key={booking.id} className="invoice-entry">
                <div className="invoice-head-line">
                  <strong>
                    {booking.bookingNo} · {booking.memberName}
                  </strong>
                  <span className="status success">Confirmed</span>
                </div>
                <div className="invoice-line">
                  <span>Date</span>
                  <strong>{formatDateKey(booking.date)}</strong>
                </div>
                <div className="invoice-line">
                  <span>Time</span>
                  <strong>{booking.slotLabel}</strong>
                </div>
                <div className="invoice-line">
                  <span>Table</span>
                  <strong>
                    {booking.tableLabel} · {booking.seats}{' '}
                    {booking.seats === 1 ? 'seat' : 'seats'}
                  </strong>
                </div>
                <div className="actions actions-tight">
                  <button
                    className="btn btn-sm"
                    onClick={() => cancel(booking)}
                    disabled={busyId === booking.id}
                  >
                    {busyId === booking.id ? 'Cancelling...' : 'Cancel booking'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
