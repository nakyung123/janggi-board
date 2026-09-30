// 장기 기물 정의
//
// Fairy-Stockfish 의 janggi 변형은 기물을 아래 문자로 표현한다(variant.cpp 기준).
//   r 車(차)  n 馬(마)  b 象(상)  a 士(사)  k 宮(궁)  c 包(포)  p 卒/兵(졸·병)
// 대문자 = 먼저 두는 쪽 = 초(楚), 소문자 = 나중에 두는 쪽 = 한(漢).
// 초가 선수이고 한이 1.5점 덤을 받는 장기 규칙과 일치한다.

export type Side = "cho" | "han";

export type PieceType = "r" | "n" | "b" | "a" | "k" | "c" | "p";

/** FEN 한 글자. 대문자는 초, 소문자는 한. */
export type PieceChar =
  | "R" | "N" | "B" | "A" | "K" | "C" | "P"
  | "r" | "n" | "b" | "a" | "k" | "c" | "p";

export const sideOf = (ch: PieceChar): Side =>
  ch === ch.toUpperCase() ? "cho" : "han";

export const typeOf = (ch: PieceChar): PieceType =>
  ch.toLowerCase() as PieceType;

export const charOf = (type: PieceType, side: Side): PieceChar =>
  (side === "cho" ? type.toUpperCase() : type) as PieceChar;

export interface PieceInfo {
  /** 한글 이름. 기보 표기에 쓴다(03마84). */
  name: string;
  /** 기물 점수 (장기 점수제) */
  score: number;
  /** 판에서 차지하는 상대 크기. 궁이 가장 크고 졸이 가장 작다. */
  size: number;
}

// 졸은 진영에 따라 이름이 다르다(초는 졸, 한은 병). 판 위에 새기는 한자(楚/漢, 卒/兵…)는
// 글꼴이 아니라 그림이라 glyphs.ts 가 따로 들고 있다.
const PIECES: Record<PieceType, Record<Side, PieceInfo>> = {
  k: {
    cho: { name: "궁", score: 0, size: 1.0 },
    han: { name: "궁", score: 0, size: 1.0 },
  },
  r: {
    cho: { name: "차", score: 13, size: 0.9 },
    han: { name: "차", score: 13, size: 0.9 },
  },
  c: {
    cho: { name: "포", score: 7, size: 0.9 },
    han: { name: "포", score: 7, size: 0.9 },
  },
  n: {
    cho: { name: "마", score: 5, size: 0.82 },
    han: { name: "마", score: 5, size: 0.82 },
  },
  b: {
    cho: { name: "상", score: 3, size: 0.82 },
    han: { name: "상", score: 3, size: 0.82 },
  },
  a: {
    cho: { name: "사", score: 3, size: 0.72 },
    han: { name: "사", score: 3, size: 0.72 },
  },
  p: {
    cho: { name: "졸", score: 2, size: 0.72 },
    han: { name: "병", score: 2, size: 0.72 },
  },
};

export const pieceInfo = (ch: PieceChar): PieceInfo =>
  PIECES[typeOf(ch)][sideOf(ch)];

export const SIDE_LABEL: Record<Side, string> = { cho: "초", han: "한" };

/** 한(漢)이 후수로서 받는 덤. 점수제 판정에 쓰인다. */
export const HAN_DEOM = 1.5;

/** 한 진영이 판 위에 남긴 기물 점수 합계(궁 제외) + 덤 */
export function materialScore(chars: PieceChar[], side: Side): number {
  const base = chars
    .filter((c) => sideOf(c) === side)
    .reduce((sum, c) => sum + pieceInfo(c).score, 0);
  return side === "han" ? base + HAN_DEOM : base;
}
