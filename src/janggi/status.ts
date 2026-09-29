// 대국 상태 판정
//
// 규칙 판정은 전부 엔진에게 맡긴다. 여기서는 엔진이 알려준 세 가지
// (합법수, 장군 여부, 판 위의 기물)를 사람이 읽을 말로 옮기기만 한다.
//
// 외통을 "둘 수가 하나도 없음"으로 판정하면 안 된다. 장기에는 한수쉼이 있어서
// 궁이 잡히게 생긴 자리에서도 엔진은 한수쉼 하나는 내놓기 때문이다.
// 엔진 동작을 확인해 보면 이렇게 갈린다.
//
//   피할 수 있는 장군 → 실제 도피수를 내놓는다 (한수쉼은 아예 안 준다)
//   외통             → 한수쉼 하나만 남는다
//
// 그래서 판정 기준은 "장군인데 한수쉼 말고는 둘 게 없음" 이다.

import type { Position, Square } from "./board";
import { validate } from "./board";
import { 이가 } from "./korean";
import { splitMove } from "./notation";
import type { Side } from "./pieces";
import { SIDE_LABEL, materialScore, sideOf } from "./pieces";

export type GameStatus =
  /** 편집하다 만 판처럼 대국으로 성립하지 않는 국면 */
  | { kind: "invalid"; problems: string[] }
  /** 외통 — 장군을 맞았는데 피할 수가 없다 */
  | { kind: "checkmate"; loser: Side; winner: Side }
  /** 수몰 — 장군은 아닌데 둘 수 있는 수가 없다 */
  | { kind: "stalemate"; loser: Side; winner: Side }
  /** 장군 — 아직 피할 수 있다 */
  | { kind: "check"; side: Side; by: Square[] }
  /** 수 제한에 걸려 점수로 갈렸다 */
  | { kind: "points"; winner: Side | null; cho: number; han: number }
  | { kind: "playing" };

/**
 * 수 제한. 이 수를 넘기면 점수로 승부를 가린다.
 *
 * 카카오장기가 쓰는 값이라 그대로 맞췄다. 여기서 어긋나면 그쪽에서 온 사람은
 * 끝나야 할 판이 안 끝난다고 느낀다. 양쪽을 합한 총 수(플라이)다.
 */
export const MOVE_LIMIT = 200;

/** 출발과 도착이 같은 수 = 한수쉼 */
function isPassMove(move: string): boolean {
  const { from, to } = splitMove(move);
  return Boolean(from) && from === to;
}

export interface StatusInput {
  position: Position;
  legal: Set<string>;
  checkers: string[];
  /** 엔진 응답을 아직 못 받았으면 판정을 미룬다 */
  ready: boolean;
  /** 지금까지 둔 총 수. 수 제한을 재는 데 쓴다. */
  plies?: number;
  /** 점수제를 쓰는 규칙인지. 전통 규칙에는 점수제가 없다. */
  pointsRule?: boolean;
}

export function gameStatus(input: StatusInput): GameStatus {
  const { position, legal, checkers, ready } = input;

  const problems = validate(position);
  if (problems.length > 0) return { kind: "invalid", problems };

  // 엔진 응답 전에는 "수가 없다"를 대국 종료로 오해하면 안 된다.
  if (!ready) return { kind: "playing" };

  const loser = position.turn;
  const winner: Side = loser === "cho" ? "han" : "cho";

  // 한수쉼은 궁이 제자리로 가는 수로 표기된다. 그것 말고 실제로 둘 수 있는 수.
  const realMoves = [...legal].filter((m) => !isPassMove(m));

  if (realMoves.length === 0) {
    return checkers.length > 0
      ? { kind: "checkmate", loser, winner }
      : legal.size === 0
        ? { kind: "stalemate", loser, winner }
        : { kind: "playing" }; // 한수쉼만 가능한 평범한 국면은 아직 대국 중
  }

  // 외통이 먼저다. 제한 수에 걸리는 그 수가 외통이면 점수가 아니라 외통으로 끝난다.
  if (input.pointsRule && (input.plies ?? 0) >= MOVE_LIMIT) {
    const s = scoreBoard(position);
    return { kind: "points", winner: s.leader, cho: s.cho, han: s.han };
  }

  if (checkers.length > 0) {
    return { kind: "check", side: position.turn, by: checkers };
  }
  return { kind: "playing" };
}

export const isGameOver = (s: GameStatus): boolean =>
  s.kind === "checkmate" || s.kind === "stalemate" || s.kind === "points";

/** 대국이 끝나는 다섯 가지 길. */
export type OutcomeKind = "checkmate" | "stalemate" | "points" | "resign" | "flag";

export interface Outcome {
  kind: OutcomeKind;
  /** 이긴 쪽. 점수가 같아 비겼으면 null */
  winner: Side | null;
}

/**
 * 대국이 어떻게 끝났는지 한곳에서 답한다.
 *
 * 끝나는 길이 다섯인데 쓰는 자리마다 따로 훑다 보니 매번 몇 가지가 빠졌다.
 * 기보에 적는 승부에서는 시간패와 점수가 빠져 전부 'unfinished' 로 저장됐고,
 * 대국 패널의 결과 줄에서는 수몰과 점수가 빠져 판이 끝났는데 아무 말도 없었고,
 * 기권 버튼은 그 두 경우에 끝난 판에서도 눌렸다. 같은 실수가 세 군데서 따로
 * 났으니 목록을 각자 들고 있는 것이 문제다. 여기서 한 번 답하고 나머지는 묻는다.
 *
 * 기권과 시간패가 먼저다. 둘은 '국면' 이 아니라 '대국' 에 붙는 결과라 기보를
 * 되짚는 중에도 그대로인 반면, 나머지 셋은 지금 보고 있는 국면의 판정이다.
 */
export function outcomeOf(
  status: GameStatus,
  resigned: Side | null,
  flagged: Side | null
): Outcome | null {
  if (resigned) return { kind: "resign", winner: resigned === "cho" ? "han" : "cho" };
  if (flagged) return { kind: "flag", winner: flagged === "cho" ? "han" : "cho" };
  if (status.kind === "checkmate") return { kind: "checkmate", winner: status.winner };
  if (status.kind === "stalemate") return { kind: "stalemate", winner: status.winner };
  if (status.kind === "points") return { kind: "points", winner: status.winner };
  return null;
}

const OUTCOME_HOW: Record<OutcomeKind, string> = {
  checkmate: "외통",
  stalemate: "둘 수가 없음",
  points: `${MOVE_LIMIT}수 점수`,
  resign: "기권",
  flag: "시간패",
};

/** 끝난 사연을 한 줄로. "외통 - 초가 이겼습니다." */
export function outcomeMessage(o: Outcome): string {
  const how = OUTCOME_HOW[o.kind];
  if (o.winner === null) return `${how} - 비겼습니다.`;
  return `${how} - ${이가(SIDE_LABEL[o.winner])} 이겼습니다.`;
}

/** 배너에 띄울 한 줄. 상태마다 말투가 다르다. */
export function statusMessage(s: GameStatus): string | null {
  switch (s.kind) {
    case "checkmate":
      return `외통 - ${SIDE_LABEL[s.winner]} 승`;
    case "stalemate":
      return `둘 수가 없습니다 - ${SIDE_LABEL[s.winner]} 승`;
    case "check":
      return `${SIDE_LABEL[s.side]} 장군`;
    case "points":
      return s.winner === null
        ? `${MOVE_LIMIT}수 - 점수가 같아 비겼습니다 (${s.cho} : ${s.han})`
        : `${MOVE_LIMIT}수 - 점수로 ${SIDE_LABEL[s.winner]} 승 (${s.cho} : ${s.han})`;
    case "invalid":
      return "대국으로 성립하지 않는 국면입니다";
    default:
      return null;
  }
}

export interface ScoreBoard {
  cho: number;
  han: number;
  /** 앞선 쪽. 같으면 null */
  leader: Side | null;
  diff: number;
}

/**
 * 장기 점수제. 한(漢)은 후수라서 1.5점 덤을 미리 받는다.
 * 대국이 길어져 점수로 가릴 때 이 숫자가 승부를 정한다.
 */
export function scoreBoard(position: Position): ScoreBoard {
  const pieces = Object.values(position.board);
  const cho = materialScore(pieces, "cho");
  const han = materialScore(pieces, "han");
  const diff = Math.abs(cho - han);
  return {
    cho,
    han,
    leader: cho === han ? null : cho > han ? "cho" : "han",
    diff,
  };
}

/** 판에서 사라진 기물 목록. 잡힌 기물을 보여줄 때 쓴다. */
export function capturedPieces(position: Position, side: Side): string[] {
  // 처음 판에 있던 구성
  const full = ["r", "r", "n", "n", "b", "b", "a", "a", "c", "c", "p", "p", "p", "p", "p"];
  const alive = Object.values(position.board)
    .filter((p) => sideOf(p) === side)
    .map((p) => p.toLowerCase())
    .filter((t) => t !== "k");

  const rest = [...alive];
  const lost: string[] = [];
  for (const type of full) {
    const at = rest.indexOf(type);
    if (at === -1) lost.push(type);
    else rest.splice(at, 1);
  }
  return lost;
}
