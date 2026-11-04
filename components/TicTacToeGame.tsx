'use client';

import { useEffect, useState } from 'react';
import { emitBalanceChanged } from '@/lib/events';
import { DEFAULT_CURRENCY_SYMBOL } from '@/lib/store';

type Cell = 'X' | 'O' | ' ';
type Outcome = 'playing' | 'player-win' | 'bot-win' | 'draw';

interface MoveResponse {
  board: string;
  result: 'active' | 'win' | 'lose' | 'draw';
  reward?: number;
  attemptsLeft?: number;
  error?: string;
}

interface TicTacToeGameProps {
  currencySymbol?: string;
}

function attemptsNote(attemptsLeft?: number) {
  if (typeof attemptsLeft !== 'number') return '';
  return attemptsLeft > 0
    ? ` ${attemptsLeft} game${attemptsLeft === 1 ? '' : 's'} left today.`
    : ' You are out of games for today.';
}

export default function TicTacToeGame({ currencySymbol = DEFAULT_CURRENCY_SYMBOL }: TicTacToeGameProps) {
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(' ') as Cell[]);
  const [message, setMessage] = useState('');
  const [outcome, setOutcome] = useState<Outcome>('playing');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);

  const refreshState = () => {
    fetch('/api/tictactoe', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        setAttemptsLeft(typeof data.attemptsLeft === 'number' ? data.attemptsLeft : null);
        if (data.cooldown) {
          setError('No turns left. Try again tomorrow.');
        }
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    refreshState();
  }, []);

  const reset = () => {
    setBoard(Array(9).fill(' ') as Cell[]);
    setMessage('');
    setOutcome('playing');
    setError(null);
    refreshState();
  };

  /** The server owns the board: we only send the square, it answers with the move. */
  const handleCell = async (index: number) => {
    if (outcome !== 'playing' || busy || attemptsLeft === 0) return;
    if (board[index] !== ' ') return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/tictactoe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cell: index }),
      });
      const data = (await res.json()) as MoveResponse;
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');

      setBoard(data.board.split('') as Cell[]);

      if (data.result === 'active') return;

      if (data.result === 'win') {
        setOutcome('player-win');
        emitBalanceChanged();
        setMessage(
          data.reward && data.reward > 0
            ? `Congratulations! You win and earn ${data.reward} ${currencySymbol}.`
            : 'Congratulations! You win.'
        );
      } else if (data.result === 'lose') {
        setOutcome('bot-win');
        setMessage(`Bot wins! Better luck next time.${attemptsNote(data.attemptsLeft)}`);
      } else {
        setOutcome('draw');
        setMessage(`Draw! Nobody wins.${attemptsNote(data.attemptsLeft)}`);
      }
      setAttemptsLeft(typeof data.attemptsLeft === 'number' ? data.attemptsLeft : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const canPlayAgain = attemptsLeft !== null && attemptsLeft > 0;

  return (
    <div className="container">
      <h1>Tic Tac Toe</h1>
      <p className="subtitle">
        You are X. Beat the bot to win a random 0–200 {currencySymbol}. You get up to 3 games a day;
        a win starts a 24h cooldown.
        {attemptsLeft != null &&
          (attemptsLeft > 0
            ? ` (${attemptsLeft} game${attemptsLeft === 1 ? '' : 's'} left today)`
            : ' (out of games for today)')}
      </p>

      <div className="card game-area ttt-wrap">
        <div className="ttt-board">
          {board.map((cell, index) => (
            <button
              key={index}
              className={cell !== ' ' ? `ttt-cell ttt-${cell.toLowerCase()}` : 'ttt-cell'}
              onClick={() => handleCell(index)}
              disabled={outcome !== 'playing' || busy || cell !== ' ' || attemptsLeft === 0}
            >
              {cell}
            </button>
          ))}
        </div>

        {message && (
          <p className={outcome === 'player-win' ? 'status success' : 'status'}>{message}</p>
        )}
        {error && <p className="status error">{error}</p>}

        {outcome !== 'playing' && canPlayAgain && (
          <button className="btn" onClick={reset} disabled={busy}>
            Play again
          </button>
        )}
        {outcome !== 'playing' && !canPlayAgain && (
          <p className="muted">You are out of games for today. Try again in 24 hours.</p>
        )}
      </div>
    </div>
  );
}
