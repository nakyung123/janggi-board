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
import type { Side } from "./pieces";
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

/**
 * 판에 화살표로 그릴 수 있는 수. 한수쉼(제자리)이나 읽을 수 없는 수는 null.
 * 직전 수 표시, 기보에 마우스를 올린 수, 복기의 뒀어야 할 수가 쓴다.
 */
export function arrowOf(move: string | null): { from: string; to: string } | null {
  if (!move) return null;
  const { from, to } = splitMove(move);
  if (!from || !to || from === to) return null;
  return { from, to };
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

/**
 * 기보 한 줄 — 초·한 한 수씩 짝지은 것.
 * cho·han 은 기보(history) 에서의 자리. 비어 있으면 null.
 */
export interface MoveRow {
  no: number;
  cho: number | null;
  han: number | null;
}

/**
 * 기보를 줄로 나눈다. movers[i] 는 i 번째 자리를 둔 쪽이다(0 번은 시작 국면이라 null).
 *
 * 기보와 복기가 같은 번호로 말하게 하려고 한곳에 뒀다. 기보는 줄(초·한 한 쌍)로,
 * 복기는 수 하나씩 세면, 복기가 "가장 아쉬운 수 3수" 라고 짚은 수가 기보에서는 2번
 * 줄에 있게 된다. 두 패널이 위아래로 붙어 있어 바로 눈에 띈다.
 *
 * 한이 먼저 두는 국면(파일에서 불러온 판)도 있을 수 있어 순서를 가정하지 않고
 * 실제로 둔 쪽을 보고 나눈다.
 */
export function moveRows(movers: (Side | null)[]): MoveRow[] {
  const rows: MoveRow[] = [];
  for (let i = 1; i < movers.length; i += 1) {
    const mover = movers[i];
    if (!mover) continue;
    const last = rows[rows.length - 1];
    if (mover === "han" && last && last.han === null) {
      last.han = i;
    } else {
      rows.push({
        no: rows.length + 1,
        cho: mover === "cho" ? i : null,
        han: mover === "han" ? i : null,
      });
    }
  }
  return rows;
}

/** 기보에서 이 수가 놓인 줄 번호. 복기가 기보와 같은 번호로 말하게 한다. */
export function rowNumbers(movers: (Side | null)[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const row of moveRows(movers)) {
    if (row.cho !== null) map.set(row.cho, row.no);
    if (row.han !== null) map.set(row.han, row.no);
  }
  return map;
}
