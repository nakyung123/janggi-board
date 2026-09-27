// 장기 기보 표기법
//
// 엔진은 체스식 좌표(a1~i10)를 쓰지만, 장기 기보는 숫자 두 자리를 쓴다.
//   세로줄: 왼쪽부터 1~9
//   가로줄: 위에서부터 1~9, 마지막 열째 줄은 0
//   좌표는 '가로줄 먼저, 세로줄 나중' 순서로 읽는다.
// 그래서 초의 궁 자리는 95, 한의 궁 자리는 25가 된다.
// 기보 한 수는 "출발좌표 기물명 도착좌표" 로 적는다. 예) 03 馬 84

import type { Board } from "./board";
import { fileIdxOf, rankOf } from "./board";
import { pieceInfo, sideOf } from "./pieces";

/** 엔진 좌표(a1~i10) → 장기 좌표 두 자리 문자열 */
export function toJanggiCoord(square: string): string {
  const file = fileIdxOf(square) + 1; // a=1 … i=9
  const rank = 11 - rankOf(square); // 엔진의 10단이 장기의 1번 가로줄
  return `${rank % 10}${file}`; // 열째 줄은 0으로 적는다
}

/** 궁이 제자리로 가는 수는 한수쉼이다. */
export function isPassMove(move: string, board: Board): boolean {
  const from = move.slice(0, move.length - (move.length > 4 ? 3 : 2));
  const to = move.slice(from.length);
  if (from !== to) return false;
  return board[from]?.toLowerCase() === "k";
}

/** 엔진 좌표 수를 출발/도착으로 쪼갠다. i10 처럼 세 글자 좌표가 섞여 있다. */
export function splitMove(move: string): { from: string; to: string } {
  const m = move.match(/^([a-i](?:10|[1-9]))([a-i](?:10|[1-9]))/);
  if (!m) return { from: "", to: "" };
  return { from: m[1], to: m[2] };
}

export interface MoveNotation {
  /** 기보용 짧은 표기. 예) 03馬84 */
  short: string;
  /** 읽기용 긴 표기. 예) 03 마 → 84 */
  long: string;
  from: string;
  to: string;
  /** 잡은 기물의 한글 이름 */
  captured: string | null;
}

/** 두기 직전의 판을 기준으로 한 수를 기보로 옮긴다. */
export function describeMove(move: string, before: Board): MoveNotation {
  const { from, to } = splitMove(move);
  const piece = before[from];

  if (!piece) {
    return { short: move, long: move, from, to, captured: null };
  }

  if (from === to) {
    return { short: "한수쉼", long: "한수쉼", from, to, captured: null };
  }

  const info = pieceInfo(piece);
  const target = before[to];
  const captured =
    target && sideOf(target) !== sideOf(piece) ? pieceInfo(target).name : null;

  const a = toJanggiCoord(from);
  const b = toJanggiCoord(to);

  return {
    short: `${a}${info.glyph}${b}`,
    long: `${a} ${info.name} → ${b}${captured ? ` (${captured} 잡음)` : ""}`,
    from,
    to,
    captured,
  };
}

/** 수순(PV)을 기보 문자열 배열로. 판을 따라 옮겨가며 잡은 기물까지 반영한다. */
export function describeLine(moves: string[], start: Board): string[] {
  let board = { ...start };
  const out: string[] = [];
  for (const move of moves) {
    const { from, to } = splitMove(move);
    if (!from || !board[from]) break;
    out.push(describeMove(move, board).short);
    if (from !== to) {
      const next = { ...board };
      next[to] = next[from];
      delete next[from];
      board = next;
    }
  }
  return out;
}

/** 평가 점수를 사람이 읽는 문자열로. 항상 초(楚) 시점이다. */
export function formatScore(score: number, mate: number | null): string {
  if (mate !== null) {
    if (mate === 0) return "외통";
    return `${mate > 0 ? "+" : "-"}M${Math.abs(mate)}`;
  }
  const sign = score > 0 ? "+" : "";
  return sign + score.toFixed(2);
}

/**
 * 평가 점수를 초(楚)가 이길 확률로.
 *
 * "+1.20" 보다 "62%" 가 훨씬 잘 읽힌다. 점수는 기물 몇 점을 앞선다는 뜻이라
 * 장기를 오래 둔 사람에게만 감이 오는데, 확률은 처음 보는 사람도 안다.
 *
 * 계수 K 는 어림값이다. 제대로 맞추려면 "이 점수에서 시작한 판이 실제로 몇 번
 * 이겼는가" 를 수천 판 모아야 하는데 장기에는 그런 공개 자료가 없다.
 *
 * 대신 척도만 실제로 재서 맞췄다. 시작 국면에서 한의 차 하나를 뺀 판
 * (기물 점수로 11.5점 차)을 엔진에게 물으면 +9.6 이 나온다. 즉 엔진의 1.0 은
 * 장기 점수 약 1.2 점이다. 그 자리가 85% 로 나오도록 K 를 잡았다 — 차 하나를
 * 그냥 앞선 판은 거의 이겼지만 아직 둘 것이 남은 판이라는 뜻이다.
 *
 * 실측이 아니라 눈금 맞추기일 뿐이므로 화면에서도 단정적으로 쓰지 않는다.
 */
const WIN_PROB_K = 0.18;

export function winProbability(score: number, mate: number | null): number {
  if (mate !== null) {
    if (mate === 0) return 0;
    return mate > 0 ? 1 : 0;
  }
  return 1 / (1 + Math.exp(-WIN_PROB_K * score));
}

/** 이길 확률을 "62%" 로. side 를 주면 그 진영 시점으로 뒤집는다. */
export function formatWinProbability(
  score: number,
  mate: number | null,
  side: "cho" | "han" = "cho"
): string {
  const p = winProbability(score, mate);
  const mine = side === "cho" ? p : 1 - p;
  return `${Math.round(mine * 100)}%`;
}
