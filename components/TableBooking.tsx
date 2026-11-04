'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { BookingInvoice } from '@/lib/db';
import { TABLES, TIME_SLOTS, MAX_SEATS } from '@/lib/tables';
import { formatDateKey } from '@/lib/time';

interface Availability {
  date: string;
  maxDate: string;
  slots: { id: string; label: string; disabled: boolean }[];
  booked: Record<string, string[]>;
}

interface TableBookingProps {
  storeName: string;
  member: { name: string };
  today: string;
  maxDate: string;
  timeZone: string;
}

export default function TableBooking({
  storeName,
  member,
  today,
  maxDate,
  timeZone,
}: TableBookingProps) {
  const [seats, setSeats] = useState(2);
  const [date, setDate] = useState<string>(today);
  const [slot, setSlot] = useState<string>(TIME_SLOTS[0].id);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [booking, setBooking] = useState<BookingInvoice | null>(null);
  const [busy, setBusy] = useState(false);

  const minDate = today;

  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    fetch(`/api/book/slots?date=${encodeURIComponent(date)}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setAvailability(data.availability);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [date]);

  const rows = useMemo(() => {
    const seen = new Set<number>();
    const out: { row: number; tables: typeof TABLES }[] = [];
    for (const table of TABLES) {
      if (!seen.has(table.row)) {
        seen.add(table.row);
        out.push({ row: table.row, tables: TABLES.filter((t) => t.row === table.row) });
      }
    }
    return out;
  }, []);

  const validSlots = availability?.slots ?? [];
  const activeSlot = validSlots.find((s) => s.id === slot);
  const bookedTables = availability?.booked[slot] ?? [];

  // When the page opens (or the date changes) the first slot may already have
  // passed. Move to the first slot that is still bookable instead of leaving a
  // disabled chip selected.
  useEffect(() => {
    if (!availability) return;
    const current = availability.slots.find((s) => s.id === slot);
    if (current && !current.disabled) return;
    const firstOpen = availability.slots.find((s) => !s.disabled);
    setSlot(firstOpen?.id ?? '');
    setSelectedTable(null);
  }, [availability, slot]);

  const tableState = (id: string) => {
    const table = TABLES.find((t) => t.id === id)!;
    if (table.capacity < seats) return 'small';
    if (bookedTables.includes(id)) return 'booked';
    if (selectedTable === id) return 'selected';
    return 'free';
  };

  useEffect(() => {
    setSelectedTable((current) => {
      if (!current) return null;
      const table = TABLES.find((t) => t.id === current);
      if (!table) return null;
      if (table.capacity < seats || bookedTables.includes(current)) return null;
      return current;
    });
  }, [seats, bookedTables]);

  const pickSlot = (id: string) => {
    setSlot(id);
    setSelectedTable(null);
    setStatus(null);
  };

  const reserve = async () => {
    if (!date || !selectedTable) return;
    setStatus(null);
    setBusy(true);
    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, slot, table: selectedTable, seats }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error ?? 'Could not book the table.');
        return;
      }
      setBooking(data.booking);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setBooking(null);
    setSelectedTable(null);
    setStatus(null);
  };

  if (!date) {
    return <p className="muted">Loading availability...</p>;
  }

  if (booking) {
    return (
      <div className="container">
        <div className="card invoice-card">
          <h1>Table reserved</h1>
          <p className="subtitle">
            {storeName} · Booking {booking.bookingNo} · {formatDateKey(booking.date)} · {booking.slotLabel}
          </p>
          <div className="invoice-table">
            <div className="invoice-row invoice-head">
              <span>Detail</span>
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div className="invoice-row">
              <span>Member</span>
              <span></span>
              <span></span>
              <span>{booking.memberName}</span>
            </div>
            <div className="invoice-row">
              <span>Table</span>
              <span></span>
              <span></span>
              <span>{booking.tableLabel}</span>
            </div>
            <div className="invoice-row">
              <span>Seats</span>
              <span></span>
              <span></span>
              <span>{booking.seats}</span>
            </div>
            <div className="invoice-row">
              <span>Date</span>
              <span></span>
              <span></span>
              <span>{formatDateKey(booking.date)}</span>
            </div>
            <div className="invoice-row">
              <span>Time</span>
              <span></span>
              <span></span>
              <span>{booking.slotLabel}</span>
            </div>
          </div>
          <div className="order-total">
            <span>Status</span>
            <strong className="status success">Confirmed</strong>
          </div>
          <p className="muted note">
            We&apos;re saving a spot for you. Your reservation appears in your profile under
            Dine-In history.
          </p>
          <div className="actions">
            <Link href="/profile" className="btn btn-primary">
              View Dine-In history
            </Link>
            <button className="btn" onClick={reset}>
              Book another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container booking-page">
      <div className="page-head-row">
        <div>
          <h1>Book a table</h1>
          <p className="subtitle">
            Pick the number of seats, a date and a time. Choose a free table from the floor
            plan. Times are shown in {timeZone}.
          </p>
        </div>
        <div className="balance-pill">
          <span className="balance-pill-label">Member</span>
          <strong className="balance-pill-inline">{member.name}</strong>
        </div>
      </div>

      <div className="booking-form card">
        <div className="booking-field">
          <span className="field-label">Seats</span>
          <div className="stepper">
            <button
              className="btn btn-sm"
              onClick={() => setSeats((s) => Math.max(1, s - 1))}
              disabled={seats === 1}
              aria-label="Fewer seats"
            >
              -
            </button>
            <span className="stepper-value">
              {seats} {seats === 1 ? 'seat' : 'seats'}
            </span>
            <button
              className="btn btn-sm"
              onClick={() => setSeats((s) => Math.min(MAX_SEATS, s + 1))}
              disabled={seats === MAX_SEATS}
              aria-label="More seats"
            >
              +
            </button>
          </div>
        </div>

        <div className="booking-field">
          <span className="field-label">Date</span>
          <input
            className="input input-date"
            type="date"
            min={minDate}
            max={maxDate}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setAvailability(null);
              setSelectedTable(null);
              setStatus(null);
            }}
          />
        </div>

        <div className="booking-field booking-field-wide">
          <span className="field-label">Time slot</span>
          <div className="filter-chips booking-slots">
            {validSlots.map((s) => (
              <button
                key={s.id}
                className={slot === s.id ? 'chip active' : 'chip'}
                disabled={s.disabled}
                onClick={() => pickSlot(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
          {activeSlot?.disabled && (
            <p className="muted note">All slots for today have passed. Pick a future date.</p>
          )}
        </div>
      </div>

      <div className="card booking-layout-card">
        <h2>Floor plan</h2>
        <p className="muted">
          Showing tables for {formatDateKey(date)} · {activeSlot?.label ?? ''}. Greyed tables are
          either too small for {seats} {seats === 1 ? 'person' : 'people'} or already booked.
        </p>

        <div className="floor-row floor-kitchen">
          <span className="floor-label">Kitchen</span>
        </div>
        {rows.map(({ row, tables }) => (
          <div key={row} className="floor-row">
            {tables.map((table) => {
              const state = tableState(table.id);
              return (
                <button
                  key={table.id}
                  className={`table-tile ${state}`}
                  disabled={state === 'small' || state === 'booked'}
                  onClick={() => {
                    setSelectedTable(table.id);
                    setStatus(null);
                  }}
                  aria-label={`${table.label}, seats ${table.capacity}`}
                >
                  <span className="table-tile-label">{table.label}</span>
                  <span className="table-tile-seats">{table.capacity} seats</span>
                  {state === 'booked' && <span className="table-tile-status">Booked</span>}
                </button>
              );
            })}
            {row === 3 && (
              <div className="floor-bar">
                <span className="floor-label">Bar counter</span>
              </div>
            )}
          </div>
        ))}

        {status && <p className="status error">{status}</p>}

        <div className="booking-summary">
          <div>
            <strong>
              {selectedTable
                ? `Table ${TABLES.find((t) => t.id === selectedTable)?.label} · ${seats} seats`
                : 'No table selected yet'}
            </strong>
            <span className="muted">
              {selectedTable
                ? `${formatDateKey(date)} · ${activeSlot?.label ?? ''}`
                : 'Tap a free table on the plan above.'}
            </span>
          </div>
          <button
            className="btn btn-primary"
            onClick={reserve}
            disabled={!selectedTable || !activeSlot || busy}
          >
            {busy ? 'Booking...' : 'Reserve table'}
          </button>
        </div>
      </div>
    </div>
  );
}