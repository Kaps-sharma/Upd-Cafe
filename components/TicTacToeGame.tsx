'use client';

import { useEffect, useState } from 'react';
import { checkWin, botMove } from '@/lib/games';
import { emitBalanceChanged } from '@/lib/events';
import { DEFAULT_CURRENCY_SYMBOL } from '@/lib/store';

type Cell = 'X' | 'O' | ' ';
type Outcome = 'playing' | 'player-win' | 'bot-win' | 'draw';

interface TicTacToeGameProps {
  currencySymbol?: string;
}

export default function TicTacToeGame({ currencySymbol = DEFAULT_CURRENCY_SYMBOL }: TicTacToeGameProps) {
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(' '));
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

  const claimOutcome = async (finalBoard: Cell[], outcome: 'win' | 'lose' | 'draw') => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/tictactoe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board: finalBoard, outcome }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');
      setAttemptsLeft(typeof data.attemptsLeft === 'number' ? data.attemptsLeft : null);
      if (data.reward > 0) {
        emitBalanceChanged();
        setMessage(`Congratulations! You win and earn ${data.reward} ${currencySymbol}.`);
      } else if (outcome === 'lose') {
        setMessage(`Bot wins! Better luck next time.${data.attemptsLeft > 0 ? ` ${data.attemptsLeft} game${data.attemptsLeft === 1 ? '' : 's'} left today.` : ' You are out of games for today.'}`);
      } else {
        setMessage(`Draw! Nobody wins.${data.attemptsLeft > 0 ? ` ${data.attemptsLeft} game${data.attemptsLeft === 1 ? '' : 's'} left today.` : ' You are out of games for today.'}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setBoard(Array(9).fill(' '));
    setMessage('');
    setOutcome('playing');
    setError(null);
    refreshState();
  };

  const handleCell = (index: number) => {
    if (outcome !== 'playing' || busy || attemptsLeft === 0) return;
    if (board[index] !== ' ') return;

    const next = [...board];
    next[index] = 'X';

    if (checkWin(next, 'X')) {
      setBoard(next);
      setOutcome('player-win');
      claimOutcome(next, 'win');
      return;
    }

    const botIndex = botMove(next);
    if (botIndex != null) {
      next[botIndex] = 'O';
    }

    if (checkWin(next, 'O')) {
      setBoard(next);
      setOutcome('bot-win');
      claimOutcome(next, 'lose');
      return;
    }

    if (!next.includes(' ')) {
      setBoard(next);
      setOutcome('draw');
      claimOutcome(next, 'draw');
      return;
    }

    setBoard(next);
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