'use client';

import { useEffect, useState } from 'react';
import { emitBalanceChanged } from '@/lib/events';
import { DEFAULT_CURRENCY_SYMBOL } from '@/lib/store';

interface Question {
  id: number;
  question: string;
  options: string[];
}

interface Result {
  score: number;
  total: number;
  passed: boolean;
  reward: number;
  balance: number | null;
  attemptsLeft: number;
  cooldown: boolean;
  retryAfterMs: number | null;
  currencySymbol: string;
}

interface QuizGameProps {
  currencySymbol?: string;
}

export default function QuizGame({ currencySymbol = DEFAULT_CURRENCY_SYMBOL }: QuizGameProps) {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/quiz', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (Array.isArray(data.questions)) {
          setQuestions(data.questions);
          setAnswers(new Array<number>(data.questions.length).fill(-1));
          setAttemptsLeft(data.attemptsLeft);
        } else {
          setError(data.error ?? 'Could not load the quiz.');
        }
      })
      .catch(() => setError('Could not load the quiz.'));
  }, []);

  if (error && !questions) {
    return (
      <div className="container">
        <h1>Quiz</h1>
        <p className="status error">{error}</p>
      </div>
    );
  }

  if (!questions) {
    return (
      <div className="container">
        <h1>Quiz</h1>
        <p className="muted">Loading questions...</p>
      </div>
    );
  }

  const allAnswered = answers.every((a) => a !== -1);
  const answeredCount = answers.filter((a) => a !== -1).length;

  const selectAnswer = (questionIndex: number, optionIndex: number) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[questionIndex] = optionIndex;
      return next;
    });
  };

  const submit = async () => {
    if (!allAnswered) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');
      setResult(data);
      setAttemptsLeft(data.attemptsLeft);
      if (data.reward > 0) emitBalanceChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    const canRetry = result.attemptsLeft > 0;
    return (
      <div className="container">
        <h1>Quiz result</h1>
        <div className="card result-card">
          <p className="result-score">
            Your score is {result.score} out of {result.total}.
          </p>
          {result.passed ? (
            <>
              <p className="status success">
                Congratulations! You won {result.reward} {result.currencySymbol}.
              </p>
              <p className="muted">
                Since you won, new games unlock after 24 hours. Come back tomorrow for more!
              </p>
            </>
          ) : result.attemptsLeft > 0 ? (
            <>
              <p className="status error">Sorry, you did not score enough to win money.</p>
              <p className="muted">
                {result.attemptsLeft} try{result.attemptsLeft === 1 ? '' : 's'} left today. A win
                or running out of tries starts a 24h cooldown.
              </p>
            </>
          ) : (
            <>
              <p className="status error">Sorry, you did not score enough to win money.</p>
              <p className="muted">You are out of tries for today. Try again in 24 hours.</p>
            </>
          )}
          {canRetry && (
            <button className="btn" onClick={() => setResult(null)}>
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>Snake Cafe Quiz</h1>
      <p className="subtitle">
        Answer at least 6 of the {questions.length} questions correctly to win a random 0–200{' '}
        {currencySymbol}. You get up to 3 tries a day; scoring 6+ starts a 24h cooldown.
        {attemptsLeft != null &&
          (attemptsLeft > 0
            ? ` (${attemptsLeft} try${attemptsLeft === 1 ? '' : 's'} left today)`
            : ' (out of tries for today)')}
        {answeredCount < questions.length && ` (${answeredCount}/${questions.length} answered)`}
      </p>

      {questions.map((q, qIndex) => (
        <div key={q.id} className="card quiz-question">
          <p className="quiz-question-text">
            Q{qIndex + 1}: {q.question}
          </p>
          <div className="option-list">
            {q.options.map((option, oIndex) => {
              const selected = answers[qIndex] === oIndex;
              return (
                <button
                  key={oIndex}
                  className={selected ? 'option selected' : 'option'}
                  onClick={() => selectAnswer(qIndex, oIndex)}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {error && <p className="status error">{error}</p>}

      <div className="actions">
        <button
          className="btn btn-primary"
          onClick={submit}
          disabled={!allAnswered || submitting || attemptsLeft === 0}
        >
          {submitting ? 'Checking...' : attemptsLeft === 0 ? 'Out of tries today' : 'Submit answers'}
        </button>
      </div>
    </div>
  );
}