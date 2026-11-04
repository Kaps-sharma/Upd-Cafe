'use client';

import { useState } from 'react';
import { emitBalanceChanged } from '@/lib/events';
import { DEFAULT_CURRENCY_SYMBOL } from '@/lib/store';

interface GuessResponse {
  result: 'low' | 'high' | 'win' | 'lose' | 'finished';
  moves?: number;
  movesLeft?: number;
  balance?: number;
  reward?: number;
  attemptsLeft?: number;
  cooldown?: boolean;
  retryAfterMs?: number | null;
  message: string;
}

interface LogEntry {
  text: string;
  kind: 'info' | 'win' | 'lose';
}

interface GuessGameProps {
  currencySymbol?: string;
}

export default function GuessGame({ currencySymbol = DEFAULT_CURRENCY_SYMBOL }: GuessGameProps) {
  const [gameId, setGameId] = useState<number | null>(null);
  const [guess, setGuess] = useState('');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [movesUsed, setMovesUsed] = useState(0);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [guessing, setGuessing] = useState(false);

  const startGame = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch('/api/guess/start', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not start the game.');
      setGameId(data.gameId);
      setAttemptsLeft(data.attemptsLeft);
      setMovesUsed(0);
      setEnded(false);
      setGuess('');
      setLog([
        {
          text: `Welcome to Guess the Number! You have 10 tries to guess a number between 1 and 100 and win a random 0-200 ${currencySymbol}. You get up to 3 games a day; a win starts a 24h cooldown.`,
          kind: 'info',
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the game.');
    } finally {
      setStarting(false);
    }
  };

  const push = (entry: LogEntry) => setLog((prev) => [...prev, entry]);

  const makeGuess = async () => {
    const value = Number(guess);
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      setError('Please enter a valid integer between 1 and 100.');
      return;
    }
    if (gameId == null) return;
    setGuessing(true);
    setError(null);
    try {
      const res = await fetch(`/api/guess/${gameId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guess: value }),
      });
      const data = (await res.json()) as GuessResponse;
      if (!res.ok) {
        throw new Error((data && (data as { error?: string }).error) ?? 'Something went wrong.');
      }
      setMovesUsed(data.moves ?? 0);
      if (typeof data.attemptsLeft === 'number') setAttemptsLeft(data.attemptsLeft);
      push({ text: data.message, kind: data.result === 'win' ? 'win' : data.result === 'lose' ? 'lose' : 'info' });
      if (data.result === 'win' || data.result === 'lose' || data.result === 'finished') {
        setEnded(true);
        setGameId(null);
        if (data.balance != null && data.result === 'win') emitBalanceChanged();
      }
      setGuess('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setGuessing(false);
    }
  };

  // Before the first game we have not loaded the allowance yet, so treat it as
  // playable. Only an explicit "0 tries left" disables the start button.
  const canPlayAgain = attemptsLeft === null || attemptsLeft > 0;

  return (
    <div className="container">
      <h1>Guess the Number</h1>
      <p className="subtitle">
        Guess the secret number between 1 and 100 in 10 tries to win a random 0–200 {currencySymbol}.
        You get up to 3 games a day; a win starts a 24h cooldown.
        {attemptsLeft != null &&
          (attemptsLeft > 0
            ? ` (${attemptsLeft} game${attemptsLeft === 1 ? '' : 's'} left today)`
            : ' (out of games for today)')}
      </p>

      <div className="card game-area">
        {gameId == null && !ended ? (
          <button className="btn btn-primary" onClick={startGame} disabled={starting || !canPlayAgain}>
            {starting ? 'Starting...' : attemptsLeft === 0 ? 'Out of games today' : 'Start a new game'}
          </button>
        ) : gameId != null ? (
          <>
            <div className="attempts-bar">
              <span>Attempts used: {movesUsed} / 10</span>
              <span>Moves left: {10 - movesUsed}</span>
            </div>
            <form
              className="guess-form"
              onSubmit={(e) => {
                e.preventDefault();
                makeGuess();
              }}
            >
              <input
                className="input"
                type="number"
                min={1}
                max={100}
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                placeholder="Enter your guess"
                autoFocus
              />
              <button className="btn btn-primary" type="submit" disabled={guessing}>
                {guessing ? 'Guessing...' : 'Guess'}
              </button>
            </form>
          </>
        ) : (
          <p className="muted">
            Game over.
            {canPlayAgain ? ' Start another to earn more coins.' : ' You are out of games for today.'}
          </p>
        )}

        {error && <p className="status error">{error}</p>}

        {log.length > 0 && (
          <ul className="game-log">
            {log.map((entry, i) => (
              <li key={i} className={entry.kind === 'win' ? 'game-log-win' : entry.kind === 'lose' ? 'game-log-lose' : 'game-log-info'}>
                {entry.text}
              </li>
            ))}
          </ul>
        )}

        {ended && canPlayAgain && (
          <button className="btn" onClick={startGame}>
            Play again
          </button>
        )}
      </div>
    </div>
  );
}