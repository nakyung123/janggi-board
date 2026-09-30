// 복기 — 어디다 두는 게 좋았는지 가려내고 그 이유를 적는다
//
// 설명은 전부 엔진에서 나온 사실만 엮어서 만든다. 쓰는 재료는 네 가지다.
//   · 엔진이 고른 최선수와 그 이후 수순
//   · 실제로 둔 수
//   · 두기 전과 둔 뒤의 평가치 차이 (= 손해)
//   · 그 수 이후 상대가 무엇을 잡는가
// 포진 이름이나 전략 해설은 붙이지 않는다. 지어내게 되고, 복기에서 틀린 설명은
// 아무 설명도 없는 것보다 해롭다.
//
// 평가치를 장기 점수로 읽어도 되는 근거
// ------------------------------------
// 초기 국면에서 기물을 하나씩 빼고 40만 노드로 평가시켜 눈금을 재봤다.
//   병(2점) → 2.30   마(5점) → 4.54   포(7점) → 5.20   차(13점) → 9.42
// 낮은 쪽에서는 엔진 점수 1.0 이 대략 장기 1점이고, 위로 갈수록 눌린다.
// 그래서 손해를 기물로 옮길 때는 폭을 넓게 잡고 "쯤" 을 붙여 말한다.

import type {
  AnalysisSnapshot,
  PositionProbe,
  PositionRef,
  SearchLimits,
} from "../engine/types";
import type { Board } from "./board";
import { parseFen } from "./board";
import { describeLine, describeMove, splitMove } from "./notation";
import type { Side } from "./pieces";
import { SIDE_LABEL } from "./pieces";
import { 으로, 을를, 이가 } from "./korean";

export type MoveGrade =
  /** 엔진과 같은 수 */
  | "best"
  /** 최선은 아니지만 손해랄 게 없다 */
  | "good"
  /** 조금 손해 */
  | "inaccuracy"
  /** 기물 하나가 왔다 갔다 할 손해 */
  | "mistake"
  /** 판이 뒤집힐 손해 */
  | "blunder";

export const GRADE_LABEL: Record<MoveGrade, string> = {
  best: "최선수",
  good: "좋은 수",
  inaccuracy: "부정확",
  mistake: "실수",
  blunder: "악수",
};

/** 목록에서 한눈에 구분되게 붙이는 기호 */
export const GRADE_MARK: Record<MoveGrade, string> = {
  best: "★",
  good: "·",
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
};

/**
 * 손해를 등급으로 나누는 경계.
 * 위에 적은 눈금대로면 1.0 은 졸 반 짝, 3.0 은 상·사 하나쯤이다.
 */
const INACCURACY = 0.3;
const MISTAKE = 1.0;
const BLUNDER = 3.0;

/**
 * 외통 점수를 그대로 빼면 손해가 수백이 된다.
 * 이기는 외통에서 더 빠른 외통으로 바뀐 것뿐인데 악수로 찍히면 곤란하니,
 * 양쪽 끝을 잘라 같은 값으로 만든다.
 */
const CAP = 20;

export const clampScore = (score: number, mate: number | null): number =>
  mate !== null
    ? mate > 0
      ? CAP
      : -CAP
    : Math.max(-CAP, Math.min(CAP, score));

/**
 * 승률 곡선의 기울기. 점수 1 이 승률을 얼마나 옮기는지.
 *
 * 체스에서 쓰는 곡선(폰 하나 앞서면 약 59%, 룩 하나면 약 86%)을 위의 눈금에 맞췄다.
 * 병 하나가 엔진 2.30, 차 하나가 9.42 라서 0.18 이면 졸 하나 60%, 마 하나 69%,
 * 차 하나 84% 쯤이다.
 */
const WIN_K = 0.18;

/**
 * 평가치(초 기준)를 초가 이길 가능성(0~1)으로 어림한다.
 *
 * 알파장기의 승률은 실제 대국 결과로 배운 신경망이 내는 값이지만, 이 엔진은 점수만 낸다.
 * 그래서 점수를 로지스틱 곡선 1 / (1 + e^(−k·점수)) 에 얹어 옮긴다 - 어림값이다.
 * 잘라 낸 끝(±CAP, 외통)은 끝난 판으로 보고 1 / 0 이다.
 */
export function winChance(score: number): number {
  if (score >= CAP) return 1;
  if (score <= -CAP) return 0;
  return 1 / (1 + Math.exp(-WIN_K * score));
}

/** 화면에 적는 초의 승률(%, 정수). 한은 100 에서 뺀 값이라 둘의 합이 늘 100 이다. */
export const winPercent = (score: number): number => Math.round(winChance(score) * 100);

/**
 * @param tolerance 경계를 늘리는 배수. 1이면 절대 기준 그대로다.
 *   고른 급수에 맞춰 눈높이를 낮출 때 쓴다 (engine/levels 의 gradeToleranceOf).
 */
export function gradeOf(
  loss: number,
  playedBest: boolean,
  tolerance = 1
): MoveGrade {
  if (playedBest) return "best";
  const k = Math.max(1, tolerance);
  if (loss < INACCURACY * k) return "good";
  if (loss < MISTAKE * k) return "inaccuracy";
  if (loss < BLUNDER * k) return "mistake";
  return "blunder";
}

/** 손해가 기물로 치면 얼마쯤인지. 경계가 흐릿해서 폭을 넓게 잡는다. */
function lossInPieces(loss: number): string | null {
  if (loss >= 8) return "차 한 짝쯤";
  if (loss >= 4.2) return "마나 포 한 짝쯤";
  if (loss >= 2) return "졸 한 짝쯤";
  return null;
}

export interface ReviewInput {
  /** history 안에서 이 수가 만든 국면의 위치 */
  index: number;
  mover: Side;
  /** 두기 직전의 판 */
  before: Board;
  /** 두고 난 뒤의 판 */
  after: Board;
  /** 실제로 둔 수 (엔진 좌표) */
  played: string;
  /** 엔진이 고른 최선수 */
  best: string | null;
  /** 최선수로 시작하는 엔진 수순 */
  bestPv: string[];
  /** 둔 뒤 국면에서 엔진이 보는 상대의 응수 */
  replyPv: string[];
  /** 두기 전 평가 (초 기준, 이미 잘라낸 값) */
  scoreBefore: number;
  /** 둔 뒤 평가 (초 기준, 이미 잘라낸 값) */
  scoreAfter: number;
  /** 최선수를 두면 장군이 되는지. 엔진에 따로 물어본 값. */
  bestGivesCheck: boolean;
  /**
   * 등급 경계를 늘리는 배수. 없으면 1(절대 기준)이다.
   * 고른 급수에 맞춰 눈높이를 낮출 때 쓴다.
   */
  tolerance?: number;
}

/**
 * 한 수의 설명. 복기 카드가 줄마다 이름을 붙여 보여준다(엔진의 수 / 그 뒤).
 * 한 덩어리 문장으로 두면 무엇이 최선이고 무엇이 벌어지는지 가려 읽기 어려웠다.
 */
export interface MoveNote {
  /** 둔 수를 한마디로. 최선수·좋은 수, 예전 복기의 설명 한 덩어리가 여기 온다. */
  verdict: string | null;
  /** 엔진이 고른 수(기보 표기). 최선수를 뒀으면 null. */
  best: string | null;
  /** 엔진의 수가 무엇을 하는 자리였는지. 예: "마를 잡는 자리" */
  bestDoes: string | null;
  /** 둔 뒤 벌어지는 일. 예: "초가 43졸33으로 마를 가져갑니다." */
  after: string | null;
}

export interface ReviewedMove {
  index: number;
  mover: Side;
  played: string;
  playedNotation: string;
  best: string | null;
  bestNotation: string | null;
  /** 최선수부터 이어지는 엔진 수순 (기보 표기) */
  bestLine: string[];
  scoreBefore: number;
  scoreAfter: number;
  /** 둔 쪽이 본 손해. 최선수면 0. */
  loss: number;
  grade: MoveGrade;
  /** 화면에 띄우는 설명 */
  note: MoveNote;
}

export function reviewMove(input: ReviewInput): ReviewedMove {
  const {
    index, mover, before, after,
    played, best, bestPv, replyPv,
    scoreBefore, scoreAfter, bestGivesCheck,
  } = input;

  // 평가치는 언제나 초 기준이다. 한이 둔 수의 손해는 부호가 반대다.
  const raw = mover === "cho" ? scoreBefore - scoreAfter : scoreAfter - scoreBefore;
  const playedBest = Boolean(best) && best === played;
  // 엔진이 고른 수를 그대로 뒀으면 손해는 0이다. 두 국면을 따로 탐색하는 터라
  // 같은 수인데도 잔값이 남는데, 그건 깊이 차이지 손해가 아니다.
  // 그대로 두면 "최선수 -0.29" 같은 말이 안 되는 줄이 뜨고 평균까지 흐려진다.
  const loss = playedBest ? 0 : Math.max(0, raw);
  const grade = gradeOf(loss, playedBest, input.tolerance);

  const playedNotation = describeMove(played, before).short;
  const bestNotation = best ? describeMove(best, before).short : null;
  const bestLine = best ? describeLine(bestPv.slice(0, 6), before) : [];

  return {
    index,
    mover,
    played,
    playedNotation,
    best,
    bestNotation,
    bestLine,
    scoreBefore,
    scoreAfter,
    loss,
    grade,
    note: buildNote({
      grade, loss, mover, before, after,
      played, best, bestGivesCheck, replyPv, playedBest,
    }),
  };
}

interface NoteInput {
  grade: MoveGrade;
  loss: number;
  mover: Side;
  before: Board;
  after: Board;
  played: string;
  best: string | null;
  bestGivesCheck: boolean;
  replyPv: string[];
  playedBest: boolean;
}

function buildNote(c: NoteInput): MoveNote {
  const opponent: Side = c.mover === "cho" ? "han" : "cho";
  const note: MoveNote = { verdict: null, best: null, bestDoes: null, after: null };

  // ① 최선수를 그대로 뒀으면 더 할 말이 없다.
  if (c.playedBest) {
    const played = describeMove(c.played, c.before);
    note.verdict = played.captured
      ? `엔진도 같은 수를 골랐습니다. ${을를(played.captured)} 잡는 자리입니다.`
      : "엔진도 같은 수를 골랐습니다.";
    return note;
  }

  // ② 손해가 없으면 굳이 나무라지 않는다.
  if (c.grade === "good") {
    note.verdict = "최선은 아니지만 손해는 없습니다.";
  }

  // ③ 최선수가 무엇이었고, 그 수가 무엇을 하는지
  if (c.best) {
    const bestMove = describeMove(c.best, c.before);
    const does: string[] = [];
    if (bestMove.captured) does.push(`${을를(bestMove.captured)} 잡`);
    if (c.bestGivesCheck) does.push("장군을 부르");
    note.best = bestMove.short;
    note.bestDoes = does.length > 0 ? `${does.join("고 ")}는 자리` : null;
  }

  // ④ 둔 수 때문에 무엇을 잃는가 — 상대의 응수에서 그대로 읽는다
  const reply = c.replyPv[0];
  const replyMove = reply ? describeMove(reply, c.after) : null;
  const loses = Boolean(replyMove?.captured && replyMove.short !== reply);
  if (replyMove && loses) {
    note.after =
      `${이가(SIDE_LABEL[opponent])} ${으로(replyMove.short)} ` +
      `${을를(replyMove.captured!)} 가져갑니다.`;
  } else if (c.grade === "mistake" || c.grade === "blunder") {
    // 잡히는 기물이 없는데도 손해라면 자리가 나빠진 것이다. 이것도 엔진이 알려준
    // 사실이므로 그대로 적고, 손해가 기물로 치면 얼마쯤인지 붙인다.
    //
    // 무엇이 잡히는지 말했으면(위) 손해를 기물로 또 환산하지 않는다. 손해에는 놓친
    // 기회까지 섞여 있어서, "포를 가져갑니다 … 차 한 짝쯤" 처럼 앞뒤가 어긋나 보인다.
    const piece = lossInPieces(c.loss);
    note.after = piece
      ? `당장 잡히는 기물은 없지만 자리가 나빠집니다. ${piece} 손해입니다.`
      : "당장 잡히는 기물은 없지만 자리가 나빠집니다.";
  }

  return note;
}

/**
 * 짚어 볼 만한 수 - 부정확·실수·악수. 복기 카드의 '이전·다음 아쉬운 수' 가 이 수들을 오간다.
 *
 * 손해 숫자로 다시 재지 않고 매겨진 등급을 본다. 등급 경계는 급수 눈높이에 따라 늘어나는데
 * 여기만 절대 기준으로 재면, 등급은 "좋은 수" 라면서 같은 수를 아쉬운 수로 짚게 된다.
 */
export const isSlip = (r: ReviewedMove): boolean =>
  r.grade === "inaccuracy" || r.grade === "mistake" || r.grade === "blunder";

/**
 * 예전 복기(설명이 한 덩어리 문장 comment 였던 때)를 지금 모양으로. 그 문장을 한마디(verdict)
 * 자리에 그대로 둔다 - 다시 쪼갤 재료(엔진의 응수)가 남아 있지 않다. 이미 지금 모양이면 그대로다.
 */
export function noteOf(r: ReviewedMove & { comment?: unknown }): MoveNote {
  if (r.note && typeof r.note === "object") return r.note;
  return {
    verdict: typeof r.comment === "string" && r.comment ? r.comment : null,
    best: null,
    bestDoes: null,
    after: null,
  };
}

// --- 요약 ----------------------------------------------------------------

export interface SideSummary {
  side: Side;
  counts: Record<MoveGrade, number>;
  moves: number;
  /**
   * 엔진의 최선수와 같은 수를 둔 비율 (0~1).
   *
   * 둔 수가 없으면 0이다. 급수를 재는 값이 아니라 "이 한 판에서 엔진과 얼마나
   * 같이 봤는가" 일 뿐이다. 판이 짧으면 크게 흔들린다.
   */
  accuracy: number;
}

export function summarize(reviewed: ReviewedMove[], side: Side): SideSummary {
  const mine = reviewed.filter((r) => r.mover === side);
  const counts: Record<MoveGrade, number> = {
    best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0,
  };
  for (const r of mine) counts[r.grade] += 1;

  return {
    side,
    counts,
    moves: mine.length,
    accuracy: mine.length ? counts.best / mine.length : 0,
  };
}

/** 복기 목록에서 그 수의 화살표를 그릴 때 쓴다. */
export function bestArrowOf(r: ReviewedMove | null) {
  if (!r?.best) return null;
  const { from, to } = splitMove(r.best);
  if (!from || !to || from === to) return null;
  return { from, to };
}

// --- 기보 한 판 훑기 -----------------------------------------------------

/**
 * 복기가 엔진에게 요구하는 것은 두 가지뿐이라, 클래스를 통째로 받지 않고
 * 이 모양만 받는다. janggi 폴더가 엔진 구현에 매이지 않게 하려는 것이다.
 */
export interface ReviewEngine {
  analyzeOnce(ref: PositionRef, limits: SearchLimits): Promise<AnalysisSnapshot>;
  probe(ref: PositionRef): Promise<PositionProbe>;
}

export interface ReviewProgress {
  /** 끝낸 국면 수 */
  done: number;
  /** 봐야 할 국면 수 */
  total: number;
}

export interface RunReviewOptions {
  engine: ReviewEngine;
  startFen: string;
  /** 기보의 모든 수 (엔진 좌표) */
  moves: string[];
  /** 한 국면에 쓸 탐색량 */
  nodes: number;
  /** 등급 경계를 늘리는 배수. 고른 급수에 맞춰 눈높이를 낮출 때 쓴다. */
  tolerance?: number;
  onProgress: (p: ReviewProgress) => void;
  /** true 를 돌려주면 그 자리에서 그만둔다 */
  shouldStop: () => boolean;
}

/** 한 수 둔 판. 장기에는 승진이 없어서 기물을 옮기는 게 전부다. */
function advance(board: Board, move: string): Board {
  const { from, to } = splitMove(move);
  if (!from || !board[from]) return board;
  const next = { ...board };
  if (from !== to) {
    next[to] = next[from];
    delete next[from];
  }
  return next;
}

/**
 * 기보를 처음부터 끝까지 한 수씩 훑는다.
 *
 * 국면마다 엔진을 한 번씩 돌린다. 수가 n 개면 국면은 n+1 개다. 한 국면의
 * 평가치는 그 앞 수의 '둔 뒤 점수'이자 다음 수의 '두기 전 점수'라서,
 * 국면당 한 번이면 충분하다.
 */
export async function runReview(opts: RunReviewOptions): Promise<ReviewedMove[]> {
  const { engine, startFen, moves, nodes, tolerance, onProgress, shouldStop } = opts;

  const positions = moves.length + 1;
  const scores: number[] = [];
  const bests: (string | null)[] = [];
  const pvs: string[][] = [];

  onProgress({ done: 0, total: positions });

  for (let i = 0; i < positions; i++) {
    if (shouldStop()) return [];

    const snap = await engine.analyzeOnce(
      { startFen, moves: moves.slice(0, i) },
      { nodes }
    );
    const line = snap.lines[0];

    // 대국이 끝난 국면에는 둘 수가 없어 줄이 비어 있다. 앞 점수를 이어 쓴다.
    scores.push(
      line ? clampScore(line.score, line.mate) : (scores[i - 1] ?? 0)
    );
    bests.push(snap.bestmove ?? line?.pv[0] ?? null);
    pvs.push(line?.pv ?? []);

    onProgress({ done: i + 1, total: positions });
  }

  // 모아둔 점수를 수 단위로 엮는다.
  const reviewed: ReviewedMove[] = [];
  let board = parseFen(startFen).board;
  const startsWithCho = startFen.split(/\s+/)[1] !== "b";

  for (let m = 0; m < moves.length; m++) {
    if (shouldStop()) return reviewed;

    const played = moves[m];
    const before = board;
    const after = advance(before, played);
    const mover: Side = (m % 2 === 0) === startsWithCho ? "cho" : "han";
    const best = bests[m];

    // 최선수가 장군인지는 판만 봐서는 알 수 없다. 규칙 판정은 전부 엔진 몫이라
    // 그 수를 둔 국면을 따로 한 번 물어본다. 실제로 둔 수와 같으면 물을 것도 없다.
    let bestGivesCheck = false;
    if (best && best !== played) {
      try {
        const probe = await engine.probe({
          startFen,
          moves: [...moves.slice(0, m), best],
        });
        bestGivesCheck = probe.checkers.length > 0;
      } catch {
        bestGivesCheck = false;
      }
    }

    reviewed.push(
      reviewMove({
        index: m + 1,
        mover,
        before,
        after,
        played,
        best,
        bestPv: pvs[m],
        replyPv: pvs[m + 1] ?? [],
        scoreBefore: scores[m],
        scoreAfter: scores[m + 1] ?? scores[m],
        bestGivesCheck,
        tolerance,
      })
    );

    board = after;
  }

  return reviewed;
}
