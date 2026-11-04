import { NextRequest, NextResponse } from 'next/server';
import { getAuthMember } from '@/lib/auth';
import {
  creditReward,
  getStoreSettings,
  getGameState,
  getActiveGameSession,
  createGameSession,
  updateSessionBoard,
  finishGameSession,
  recordGameOutcome,
} from '@/lib/db';
import { botMove, checkWin, randomGameReward } from '@/lib/games';

export const runtime = 'nodejs';

type Cell = 'X' | 'O' | ' ';
const EMPTY_BOARD = '         ';

function parseBoard(raw: string): Cell[] {
  return raw
    .padEnd(9, ' ')
    .slice(0, 9)
    .split('')
    .map((cell) => (cell === 'X' || cell === 'O' ? cell : ' ')) as Cell[];
}

export async function GET() {
  const member = await getAuthMember();
  if (!member) {
    return NextResponse.json({ error: 'Not logged in.' }, { status: 401 });
  }
  const state = await getGameState(member.id, 'tictactoe');
  return NextResponse.json({
    allowed: state.allowed,
    cooldown: state.cooldown,
    retryAfterMs: state.retryAfterMs,
    attemptsLeft: state.attemptsLeft,
  });
}

/**
 * The board is owned by the server: the browser sends only the square the
 * member wants, and the reply contains the board after the bot has answered.
 * A client can therefore never claim a win it did not play.
 */
export async function POST(req: NextRequest) {
  const member = await getAuthMember();
  if (!member) {
    return NextResponse.json({ error: 'Not logged in.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const cell = Number(body?.cell);
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) {
    return NextResponse.json({ error: 'Pick a square on the board.' }, { status: 400 });
  }

  const before = await getGameState(member.id, 'tictactoe');
  if (!before.allowed) {
    return NextResponse.json(
      {
        error: 'No turns left. Try again later.',
        retryAfterMs: before.retryAfterMs,
        attemptsLeft: 0,
        cooldown: true,
      },
      { status: 429 }
    );
  }

  let session = await getActiveGameSession(member.id, 'tictactoe');
  if (!session) {
    session = await createGameSession(member.id, 'tictactoe', undefined, EMPTY_BOARD);
  }

  const board = parseBoard(session.board);
  if (board[cell] !== ' ') {
    return NextResponse.json(
      { error: 'That square is already taken.', board: board.join('') },
      { status: 409 }
    );
  }

  board[cell] = 'X';
  let result: 'active' | 'win' | 'lose' | 'draw' = 'active';

  if (checkWin(board, 'X')) {
    result = 'win';
  } else if (!board.includes(' ')) {
    result = 'draw';
  } else {
    const botIndex = botMove(board);
    if (botIndex !== null) board[botIndex] = 'O';
    if (checkWin(board, 'O')) result = 'lose';
    else if (!board.includes(' ')) result = 'draw';
  }

  await updateSessionBoard(session.id, board.join(''), session.moves + 1);

  if (result === 'active') {
    return NextResponse.json({
      board: board.join(''),
      result,
      attemptsLeft: before.attemptsLeft,
    });
  }

  await finishGameSession(
    session.id,
    result === 'win' ? 'won' : result === 'lose' ? 'lost' : 'draw'
  );

  const settings = await getStoreSettings();
  const state = await recordGameOutcome(member.id, 'tictactoe', result === 'win');

  let reward = 0;
  let balance: number | null = null;
  if (result === 'win') {
    reward = randomGameReward();
    balance = await creditReward(member.id, reward, 'tictactoe');
  }

  return NextResponse.json({
    board: board.join(''),
    result,
    reward,
    balance,
    attemptsLeft: state.attemptsLeft,
    retryAfterMs: state.retryAfterMs,
    cooldown: state.cooldown,
    currencySymbol: settings.currencySymbol,
  });
}
