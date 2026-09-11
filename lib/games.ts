export interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  answerIndex: number;
}

export interface QuizResult {
  score: number;
  total: number;
  reward: number;
  balance: number | null;
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  { id: 1, question: 'What is the capital of India?', options: ['New Delhi', 'Mumbai', 'Kolkata', 'Bangalore'], answerIndex: 0 },
  { id: 2, question: 'How many continents are there?', options: ['5', '6', '7', '8'], answerIndex: 2 },
  { id: 3, question: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter', 'Saturn'], answerIndex: 1 },
  { id: 4, question: 'What is the chemical symbol for water?', options: ['HO', 'H2O', 'O2', 'H2'], answerIndex: 1 },
  { id: 5, question: 'Who is known as the father of computers?', options: ['Alan Turing', 'Bill Gates', 'Steve Jobs', 'Charles Babbage'], answerIndex: 3 },
  { id: 6, question: 'What is the largest ocean on Earth?', options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], answerIndex: 3 },
  { id: 7, question: 'Which country is famous for the Eiffel Tower?', options: ['Italy', 'Germany', 'France', 'Spain'], answerIndex: 2 },
  { id: 8, question: 'What is the boiling point of water in Celsius?', options: ['90', '100', '110', '120'], answerIndex: 1 },
  { id: 9, question: "Who wrote 'Romeo and Juliet'?", options: ['Charles Dickens', 'Jane Austen', 'William Shakespeare', 'Ernest Hemingway'], answerIndex: 2 },
  { id: 10, question: 'What is the currency of Japan?', options: ['Yuan', 'Won', 'Yen', 'Ringgit'], answerIndex: 2 },
];

export const QUIZ_PASS_SCORE = 6;

/** Every game gives a member 3 turns; after all are used a cooldown kicks in. */
export const MAX_GAME_TURNS = 3;
export const GAME_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Winning a game awards a random 0–200 Snake Coins. */
export function randomGameReward(): number {
  return Math.floor(Math.random() * 201);
}

export function publicQuizQuestions() {
  return QUIZ_QUESTIONS.map(({ id, question, options }) => ({ id, question, options }));
}

export function gradeQuiz(answers: number[]): { score: number; total: number } {
  const total = QUIZ_QUESTIONS.length;
  let score = 0;
  for (let i = 0; i < total; i++) {
    if (answers[i] === QUIZ_QUESTIONS[i]?.answerIndex) score++;
  }
  return { score, total };
}

export const TIC_TAC_TOE_WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function checkWin(board: string[], player: 'X' | 'O'): boolean {
  return TIC_TAC_TOE_WIN_LINES.some(
    ([a, b, c]) => board[a] === player && board[b] === player && board[c] === player
  );
}

export function botMove(board: string[]): number | null {
  const empty: number[] = [];
  for (let i = 0; i < board.length; i++) if (board[i] === ' ') empty.push(i);
  if (empty.length === 0) return null;

  // take the winning move if available
  for (const index of empty) {
    const copy = [...board];
    copy[index] = 'O';
    if (checkWin(copy, 'O')) return index;
  }

  // usually block the player's winning move, occasionally take a gamble
  const blocks: number[] = [];
  for (const index of empty) {
    const copy = [...board];
    copy[index] = 'X';
    if (checkWin(copy, 'X')) blocks.push(index);
  }
  if (blocks.length > 0 && Math.random() < 0.7) {
    return blocks[Math.floor(Math.random() * blocks.length)];
  }

  return empty[Math.floor(Math.random() * empty.length)];
}

export function isValidTicTacToeOutcome(
  board: string[],
  outcome: 'win' | 'lose' | 'draw'
): boolean {
  if (!Array.isArray(board) || board.length !== 9) return false;
  if (!board.every((cell) => cell === 'X' || cell === 'O' || cell === ' ')) return false;
  const xCount = board.filter((cell) => cell === 'X').length;
  const oCount = board.filter((cell) => cell === 'O').length;
  if (xCount !== oCount && xCount !== oCount + 1) return false;
  const xWins = checkWin(board, 'X');
  const oWins = checkWin(board, 'O');
  if (outcome === 'win') return xWins && !oWins;
  if (outcome === 'lose') return oWins && !xWins;
  return board.every((cell) => cell !== ' ') && !xWins && !oWins;
}