'use client';

import { useState } from 'react';
import { formatRupees } from '@/lib/store';
import { emitBalanceChanged } from '@/lib/events';

interface PaymentMember {
  name: string;
  money: number;
}

interface PaymentModalProps {
  member: PaymentMember;
  onClose: () => void;
  onUpdated?: (money: number, upiId: string) => void;
}

const UPI_PATTERN = /^[A-Za-z0-9_.\-]{2,}@[A-Za-z]{2,}$/;

export default function PaymentModal({ member, onClose, onUpdated }: PaymentModalProps) {
  const [upiId, setUpiId] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    setStatus(null);
    const trimmed = upiId.trim();
    const value = Number(amount);
    if (!trimmed || !UPI_PATTERN.test(trimmed)) {
      setStatus({ type: 'error', text: 'Enter a valid UPI ID (e.g. name@upi).' });
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setStatus({ type: 'error', text: 'Enter a top-up amount.' });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upiId: trimmed, amount: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: 'error', text: data.error ?? 'Top-up failed.' });
        return;
      }
      emitBalanceChanged();
      onUpdated?.(data.member.money, data.member.upiId);
      setStatus({ type: 'success', text: `Payment successful! ${formatRupees(value)} added to your wallet.` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add money">
        <h2>Add money to your wallet</h2>
        <p className="muted">
          Pay {member.name} via UPI. Enter your UPI ID and the amount. This is a demo — the amount
          is credited to your wallet immediately.
        </p>

        <label className="field-label">UPI ID</label>
        <input
          className="input"
          type="text"
          placeholder="yourname@upi"
          value={upiId}
          onChange={(e) => setUpiId(e.target.value)}
          autoComplete="off"
        />

        <label className="field-label">Amount (₹)</label>
        <input
          className="input input-num"
          type="number"
          min={1}
          placeholder="100"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <p className="muted note">Wallet balance: {formatRupees(member.money)}</p>

        {status && (
          <p className={status.type === 'success' ? 'status success' : 'status error'}>{status.text}</p>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Processing payment...' : `Pay ${formatRupees(Number(amount) || 0)}`}
          </button>
        </div>
      </div>
    </div>
  );
}