// 좌표계와 FEN 변환
//
// 장기판은 9줄(가로) × 10단(세로)이고, 기물은 칸이 아니라 '선의 교차점'에 놓인다.
// Fairy-Stockfish 는 파일을 a~i, 랭크를 1~10 으로 부르며
// FEN 의 첫 구획이 10단(맨 위, 한 진영), 마지막 구획이 1단(맨 아래, 초 진영)이다.

import type { PieceChar, Side } from "./pieces";
import { 은는 } from "./korean";
import { sideOf } from "./pieces";

export const FILES = 9;
export const RANKS = 10;
export const FILE_LETTERS = "abcdefghi";

/** "a1" ~ "i10" 형태의 교차점 이름 */
export type Square = string;

/** 파일 인덱스(0=a) 와 랭크(1~10) 로 교차점 이름을 만든다. */
export const sq = (fileIdx: number, rank: number): Square =>
  FILE_LETTERS[fileIdx] + rank;

export const fileIdxOf = (s: Square): number => FILE_LETTERS.indexOf(s[0]);
export const rankOf = (s: Square): number => Number(s.slice(1));

/** 교차점 → 기물. 비어 있는 교차점은 키 자체가 없다. */
export type Board = Record<Square, PieceChar>;

export interface Position {
  board: Board;
  turn: Side;
  halfmove: number;
  fullmove: number;
}

export const START_FEN =
  "rnba1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR w - - 0 1";

/** 궁성: d~f 파일 × 1~3단(초) / 8~10단(한) */
export const PALACE_FILES = [3, 4, 5];
export const CHO_PALACE_RANKS = [1, 2, 3];
export const HAN_PALACE_RANKS = [8, 9, 10];

export function palaceOf(s: Square): Side | null {
  if (!PALACE_FILES.includes(fileIdxOf(s))) return null;
  const r = rankOf(s);
  if (CHO_PALACE_RANKS.includes(r)) return "cho";
  if (HAN_PALACE_RANKS.includes(r)) return "han";
  return null;
}

export function parseFen(fen: string): Position {
  const parts = fen.trim().split(/\s+/);
  const rows = parts[0].split("/");
  if (rows.length !== RANKS) {
    throw new Error(`FEN 의 단 수가 ${rows.length}개입니다. 10개여야 합니다.`);
  }

  const board: Board = {};
  rows.forEach((row, rowIdx) => {
    const rank = RANKS - rowIdx; // 첫 줄이 10단
    let fileIdx = 0;
    // 숫자는 연속된 빈 교차점 개수. 두 자리(10)까지 나올 수 있다.
    for (const token of row.match(/\d+|[a-zA-Z]/g) ?? []) {
      if (/\d/.test(token)) {
        fileIdx += Number(token);
      } else {
        if (fileIdx < FILES) board[sq(fileIdx, rank)] = token as PieceChar;
        fileIdx += 1;
      }
    }
    if (fileIdx !== FILES) {
      throw new Error(`${rank}단의 칸 수가 ${fileIdx}개입니다. 9개여야 합니다.`);
    }
  });

  return {
    board,
    turn: parts[1] === "b" ? "han" : "cho",
    halfmove: Number(parts[4] ?? 0) || 0,
    fullmove: Number(parts[5] ?? 1) || 1,
  };
}

export function toFen(pos: Position): string {
  const rows: string[] = [];
  for (let rank = RANKS; rank >= 1; rank--) {
    let row = "";
    let empty = 0;
    for (let f = 0; f < FILES; f++) {
      const piece = pos.board[sq(f, rank)];
      if (piece) {
        if (empty) row += empty;
        empty = 0;
        row += piece;
      } else {
        empty += 1;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  const turn = pos.turn === "cho" ? "w" : "b";
  return `${rows.join("/")} ${turn} - - ${pos.halfmove} ${pos.fullmove}`;
}

/** 편집 중인 판이 엔진에 넘길 만한 상태인지 미리 걸러낸다. */
export function validate(pos: Position): string[] {
  const problems: string[] = [];
  const chars = Object.values(pos.board);
  for (const side of ["cho", "han"] as Side[]) {
    const kings = chars.filter((c) => sideOf(c) === side && c.toLowerCase() === "k");
    const label = side === "cho" ? "초" : "한";
    if (kings.length === 0) problems.push(`${label}의 궁이 없습니다.`);
    if (kings.length > 1) problems.push(`${label}의 궁이 ${kings.length}개입니다.`);
  }
  for (const [square, piece] of Object.entries(pos.board)) {
    const t = piece.toLowerCase();
    if (t === "k" || t === "a") {
      const owner = palaceOf(square);
      if (owner !== sideOf(piece)) {
        const label = sideOf(piece) === "cho" ? "초" : "한";
        const name = t === "k" ? "궁" : "사";
        // "사은" 이 아니라 "사는" 이어야 한다. 받침에 따라 갈리므로 조사 함수를 쓴다.
        problems.push(
          `${square}: ${label}의 ${은는(name)} 자기 궁성 안에만 놓을 수 있습니다.`
        );
      }
    }
  }
  return problems;
}

/**
 * 무르기가 돌아갈 자리.
 *
 * 한 칸만 되감으면 상대(엔진) 차례에 멈춘다. 그런데 기보 끝이 아니면 엔진은
 * 두지 않으므로 판이 조용히 멈춘 것처럼 보인다 — 내 기물을 눌러도 아무 일도
 * 일어나지 않고 안내도 없다. 그래서 내 차례가 나올 때까지 되감는다.
 *
 * @param fens   기보의 각 국면 FEN. fens[0] 이 시작 국면이다.
 * @param cursor 지금 보고 있는 자리
 * @param mySide 내가 잡은 쪽. 구경 중이거나 대국이 아니면 null — 이때는 한 칸만 간다.
 */
export function undoTarget(
  fens: string[],
  cursor: number,
  mySide: Side | null
): number {
  if (cursor <= 0) return 0;
  if (mySide === null) return cursor - 1;
  let i = cursor - 1;
  // 시작 국면(0)보다 더 갈 곳은 없다.
  while (i > 0 && parseFen(fens[i]).turn !== mySide) i -= 1;
  return i;
}
