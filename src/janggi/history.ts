// 기보 — 시작 국면에서 한 수씩 쌓은 국면 목록
//
// 대국 탭의 두던 판, 기보 탭에서 연 지난 판, 파일에서 불러온 판이 모두 이 모양이다.
// history[0] 은 시작 국면(move 가 null)이고, history[i] 는 i 번째 수를 둔 뒤의 국면이다.
// 그래서 '지금 보고 있는 수의 번호(cursor)' 가 곧 배열의 자리다.

import type { Square } from "./board";
import { applyMove, parseFen, toFen } from "./board";
import { describeMove, hangulNotation } from "./notation";
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

/**
 * 저장해 둔 기보가 지금도 읽을 수 있는 모양인지.
 *
 * localStorage 는 사람이 직접 고칠 수 있고 옛 형식의 값도 남아 있다. 모양만 맞고
 * FEN 이 깨진 칸도 거른다 - 판을 그리다가 터지는 것보다 처음부터 버리는 편이 낫다.
 */
export function isHistory(v: unknown): v is HistoryEntry[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > 1000) return false;
  return v.every((e) => {
    if (typeof e !== "object" || e === null) return false;
    const h = e as Record<string, unknown>;
    if (typeof h.fen !== "string" || h.fen.length > 200) return false;
    if (typeof h.notation !== "string") return false;
    if (h.move !== null && typeof h.move !== "string") return false;
    if (h.mover !== null && h.mover !== "cho" && h.mover !== "han") return false;
    if (h.score !== null && typeof h.score !== "number") return false;
    try {
      return Object.keys(parseFen(h.fen).board).length > 0;
    } catch {
      return false;
    }
  });
}
