// UCI 정보 라인 파서
//
// 엔진은 탐색 중 아래 같은 줄을 초당 수십 번 흘려보낸다.
//   info depth 11 seldepth 14 multipv 3 score cp -3 nodes 262135 nps 173944 ... pv b1c3 b10c8 ...
// 이걸 UI 가 쓰기 좋은 형태로 바꾼다.

import type { AnalysisLine } from "./types";

export interface ParsedInfo extends Partial<AnalysisLine> {
  nodes?: number;
  nps?: number;
  timeMs?: number;
  hashfull?: number;
}

const num = (v: string | undefined) => (v === undefined ? undefined : Number(v));

/**
 * @param choToMove 현재 둘 차례가 초인지. 엔진 점수는 '둘 차례 쪽' 기준이라
 *                  한 차례면 부호를 뒤집어 항상 초 시점으로 맞춘다.
 */
export function parseInfo(line: string, choToMove: boolean): ParsedInfo | null {
  if (!line.startsWith("info ") || !line.includes(" depth ")) return null;
  // 하한/상한 표시가 붙은 줄은 값이 확정되지 않아 건너뛴다.
  if (line.includes(" lowerbound") || line.includes(" upperbound")) return null;

  const tokens = line.split(/\s+/);
  const get = (key: string) => {
    const i = tokens.indexOf(key);
    return i === -1 ? undefined : tokens[i + 1];
  };

  const pvIdx = tokens.indexOf("pv");
  const pv = pvIdx === -1 ? undefined : tokens.slice(pvIdx + 1);

  const sign = choToMove ? 1 : -1;
  const scoreIdx = tokens.indexOf("score");
  let score: number | undefined;
  let mate: number | null | undefined;
  if (scoreIdx !== -1) {
    const kind = tokens[scoreIdx + 1];
    const value = Number(tokens[scoreIdx + 2]);
    if (kind === "cp") {
      score = (value * sign) / 100;
      mate = null;
    } else if (kind === "mate") {
      mate = value * sign;
      score = value * sign > 0 ? 999 : -999;
    }
  }

  return {
    depth: num(get("depth")),
    seldepth: num(get("seldepth")),
    multipv: num(get("multipv")) ?? 1,
    score,
    mate,
    pv,
    nodes: num(get("nodes")),
    nps: num(get("nps")),
    timeMs: num(get("time")),
    hashfull: num(get("hashfull")),
  };
}

/** `go perft 1` 응답에서 합법수만 뽑는다. 각 줄은 "a4b4: 1" 형태다. */
export function parsePerftMoves(lines: string[]): string[] {
  const moves: string[] = [];
  for (const line of lines) {
    const m = line.match(/^([a-i](?:10|[1-9])[a-i](?:10|[1-9])[a-z]?):\s*\d+$/);
    if (m) moves.push(m[1]);
  }
  return moves;
}
