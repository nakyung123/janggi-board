// 기보 — 시작 국면에서 한 수씩 쌓은 국면 목록
//
// 대국 탭의 두던 판, 기보 탭에서 연 지난 판, 파일에서 불러온 판이 모두 이 모양이다.
// history[0] 은 시작 국면(move 가 null)이고, history[i] 는 i 번째 수를 둔 뒤의 국면이다.
// 그래서 '지금 보고 있는 수의 번호(cursor)' 가 곧 배열의 자리다.

import type { Square } from "./board";
import { applyMove, parseFen, toFen } from "./board";
import { describeMove, hangulNotation, isMoveString } from "./notation";
import type { Side } from "./pieces";

export interface HistoryEntry {
  /** 이 국면의 FEN */
  fen: string;
  /** 이 국면을 만든 수(엔진 좌표, 예: a4b4). 시작 국면은 null. */
  move: string | null;
  /** 기보 표기(예: 03마84). 시작 국면은 "시작". */
  notation: string;
  /** 이 수를 둔 쪽. 시작 국면은 null. */
  mover: Side | null;
  /** 이 국면의 초(楚) 기준 평가치. 복기를 돌리기 전에는 null. 형세 그래프가 쓴다. */
  score: number | null;
}

/** 시작 국면 하나만 있는 기보. */
export function startHistory(fen: string): HistoryEntry[] {
  return [{ fen, move: null, notation: "시작", mover: null, score: null }];
}

/** before 국면에서 from → to 를 둔 다음 칸. from === to 는 한수쉼이다. */
export function nextEntry(before: string, from: Square, to: Square): HistoryEntry {
  const pos = parseFen(before);
  return {
    fen: toFen(applyMove(pos, from, to)),
    move: from + to,
    notation: describeMove(from + to, pos.board).short,
    mover: pos.turn,
    score: null,
  };
}

/** 기보 표기를 지금 표기(한글)로. 브라우저에 남은 예전 판은 한자로 적혀 있다(hangulNotation). */
export function hangulHistory(history: HistoryEntry[]): HistoryEntry[] {
  return history.map((h) => ({ ...h, notation: hangulNotation(h.notation) }));
}

/** 기보에서 실제로 둔 수만(시작 국면 빼고). 엔진에 국면을 넘길 때 쓴다. */
export function movesOf(history: HistoryEntry[]): string[] {
  return history
    .slice(1)
    .map((h) => h.move)
    .filter((m): m is string => Boolean(m));
}

/** FEN 에 들어갈 수 있는 글자. 줄바꿈이 섞이면 엔진 명령이 한 줄 더 생긴다. */
const FEN_TEXT = /^[A-Za-z0-9/\- ]{1,200}$/;

/**
 * 기보 한 칸이 지금도 읽을 수 있는 모양인지. **글자만 본다.**
 *
 * 브라우저에 남은 값도 밖에서 온 값이다 - 사람이 직접 고칠 수 있고, 옛 형식의 값도
 * 남아 있다. 국면과 수는 엔진에게 UCI 명령 한 줄로 그대로 넘어가므로 글자까지 본다.
 * 줄바꿈이 섞이면 명령이 한 줄 더 생긴다(engine/types.ts 의 positionCommand).
 *
 * **두던 판과 지난 판이 같은 잣대를 써야 한다.** 한동안 둘이 따로 있었고, 두던 판 쪽만
 * 고쳐서 지난 판 쪽(archive.ts 의 isPly)에 구멍이 남았다. 그래서 여기 하나로 모았다.
 */
export function isHistoryEntry(v: unknown): v is HistoryEntry {
  if (typeof v !== "object" || v === null) return false;
  const h = v as Record<string, unknown>;
  if (typeof h.fen !== "string" || !FEN_TEXT.test(h.fen)) return false;
  if (typeof h.notation !== "string" || h.notation.length > 60) return false;
  if (h.move !== null && (typeof h.move !== "string" || !isMoveString(h.move))) return false;
  if (h.mover !== null && h.mover !== "cho" && h.mover !== "han") return false;
  if (h.score !== null && typeof h.score !== "number") return false;
  return true;
}

/** 이 국면이 실제로 판으로 그려지는지. 글자 검사보다 비싸다(10만 번에 1초). */
export function canDraw(fen: string): boolean {
  try {
    return Object.keys(parseFen(fen).board).length > 0;
  } catch {
    return false;
  }
}

/**
 * 저장해 둔 기보가 지금도 읽을 수 있는 모양인지.
 *
 * 글자를 보고(isHistoryEntry), 국면이 실제로 그려지는지까지 본다 - 판을 그리다가
 * 터지는 것보다 처음부터 버리는 편이 낫다. 두던 판은 하나뿐이라 전부 그려 봐도 싸다.
 */
export function isHistory(v: unknown): v is HistoryEntry[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > 1000) return false;
  return v.every((e) => isHistoryEntry(e) && canDraw(e.fen));
}
