'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminMember } from '@/lib/db';
import { formatCoins, formatRupees, DEFAULT_CURRENCY_SYMBOL } from '@/lib/store';

interface AdminMembersProps {
  currencySymbol?: string;
}

interface AdjustForm {
  money: string;
  coins: string;
  note: string;
}

const EMPTY_FORM: AdjustForm = { money: '', coins: '', note: '' };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function numberOrZero(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function AdminMembers({ currencySymbol = DEFAULT_CURRENCY_SYMBOL }: AdminMembersProps) {
  const [members, setMembers] = useState<AdminMember[] | null>(null);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AdjustForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setMessage(null);
    try {
      const res = await fetch('/api/admin/members', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not load members.');
      setMembers(data.members ?? []);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Could not load members.',
      });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || !members) return members ?? [];
    return members.filter((member) =>
      `${member.name} ${member.username} ${member.phone}`.toLowerCase().includes(needle)
    );
  }, [members, query]);

  const editing = members?.find((member) => member.id === editingId) ?? null;
  const moneyDelta = numberOrZero(form.money);
  const coinDelta = numberOrZero(form.coins);
  const nextMoney = editing ? round2(editing.money + moneyDelta) : 0;
  const nextCoins = editing ? round2(editing.sc + coinDelta) : 0;

  const startAdjust = (member: AdminMember) => {
    setEditingId(member.id);
    setForm(EMPTY_FORM);
    setMessage(null);
  };

  const applyAdjust = async () => {
    if (!editing) return;
    if (moneyDelta === 0 && coinDelta === 0) {
      setMessage({ type: 'error', text: 'Enter a wallet or coin amount to adjust.' });
      return;
    }
    if (nextMoney < 0 || nextCoins < 0) {
      setMessage({ type: 'error', text: 'A balance cannot go below zero.' });
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/members/${editing.id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ money: moneyDelta, coins: coinDelta, note: form.note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not adjust this member.');

      setMembers((rows) =>
        (rows ?? []).map((row) =>
          row.id === editing.id
            ? {
                ...row,
                money: data.member.money,
                sc: data.member.sc,
              }
            : row
        )
      );
      setEditingId(null);
      setForm(EMPTY_FORM);
      setMessage({ type: 'success', text: `${editing.name}'s balance was updated.` });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Could not adjust this member.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="form-card">
      <div className="card">
        <div className="page-head-row">
          <div>
            <h2>Members</h2>
            <p className="subtitle">
              Change a wallet balance or award/remove coins. Every coin change is written to the
              member&apos;s coin history with your note.
            </p>
          </div>
          <button className="btn btn-sm" onClick={load}>
            Refresh
          </button>
        </div>

        <label className="field">
          <span className="field-label">Search</span>
          <input
            className="input"
            value={query}
            placeholder="Name, member ID or phone"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        {message && (
          <p className={message.type === 'success' ? 'status success' : 'status error'}>
            {message.text}
          </p>
        )}

        {editing && (
          <div className="admin-adjust">
            <h3>Adjust {editing.name}</h3>
            <p className="muted">
              Current: {formatRupees(editing.money)} · {formatCoins(editing.sc, currencySymbol)}
            </p>
            <div className="form-grid form-grid-4">
              <label>
                <span>Wallet change (₹)</span>
                <input
                  className="input input-num"
                  type="number"
                  step="any"
                  value={form.money}
                  placeholder="e.g. 100 or -50"
                  onChange={(event) => setForm({ ...form, money: event.target.value })}
                />
              </label>
              <label>
                <span>Coin change</span>
                <input
                  className="input input-num"
                  type="number"
                  step="any"
                  value={form.coins}
                  placeholder="e.g. 200 or -100"
                  onChange={(event) => setForm({ ...form, coins: event.target.value })}
                />
              </label>
              <label className="full-span">
                <span>Reason (optional, shown to the member for coin changes)</span>
                <input
                  className="input"
                  value={form.note}
                  maxLength={120}
                  placeholder="e.g. Goodwill credit for a delayed order"
                  onChange={(event) => setForm({ ...form, note: event.target.value })}
                />
              </label>
            </div>
            <p className="muted">
              New balance: {formatRupees(Math.max(0, nextMoney))} ·{' '}
              {formatCoins(Math.max(0, nextCoins), currencySymbol)}
            </p>
            <div className="actions">
              <button className="btn btn-primary" onClick={applyAdjust} disabled={busy}>
                {busy ? 'Saving...' : 'Apply adjustment'}
              </button>
              <button
                className="btn"
                onClick={() => {
                  setEditingId(null);
                  setForm(EMPTY_FORM);
                }}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card table-card admin-menu-table">
        <h2>
          {members === null
            ? 'Members'
            : `${filtered.length} member${filtered.length === 1 ? '' : 's'}`}
        </h2>
        {members === null ? (
          <p className="muted">Loading members...</p>
        ) : filtered.length === 0 ? (
          <p className="muted">No member matches that search.</p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Phone</th>
                  <th>Wallet</th>
                  <th>Coins</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <span className="admin-member-name">
                        <strong>{member.name}</strong>
                        <small>{member.username || `#${member.id}`}</small>
                      </span>
                    </td>
                    <td>{member.phone || '—'}</td>
                    <td>{formatRupees(member.money)}</td>
                    <td>{formatCoins(member.sc, currencySymbol)}</td>
                    <td className="table-actions">
                      <button className="btn btn-sm" onClick={() => startAdjust(member)}>
                        Adjust
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted note">
          Wallet changes are applied immediately. Coin changes also appear in the member&apos;s coin
          history, so the balance is always explainable.
        </p>
      </div>
    </section>
  );
}
