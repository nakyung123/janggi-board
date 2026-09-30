// 기보 목록(지난 판) — 모양, 넣고 바꾸기, 읽어 온 값 검사, 결과 표시, 쪽 번호
//
// 판이 끝나면 그 판을 통째로 남기고, 두던 중에 새 대국을 누르면 '중단' 으로 남긴다.
// 한 수도 두지 않은 판은 남기지 않는다. 기보 탭은 이 목록에서 한 판을 골라 연다 -
// 대국 탭의 두던 판과는 따로 든다.
//
// 저장은 브라우저(localStorage)라 크기에 한도가 있다. 복기까지 돌린 100수짜리
// 판이 4만 자 남짓이라 100판이면 한도(대개 500만 자)에 가깝다. 그래서 최근
// ARCHIVE_LIMIT 판만 두고, 그래도 넘치면 hooks/useArchive.ts 가 오래된 판부터 버린다.

import type { HistoryEntry } from "./history";
import type { Side } from "./pieces";
import type { ReviewedMove } from "./review";
import type { Outcome } from "./status";

/**
 * 판이 어떻게 끝났는지.
 *
 * 끝나는 길 다섯과 '불러온 기보'(Outcome 주석) 말고 하나가 더 있다. 두던 중에
 * 새 대국을 누른 판, 또는 끝나지 않은 채 저장된 파일은 '중단' 이다.
 */
export type ArchivedKind = Outcome["kind"] | "abandoned";

export interface ArchivedResult {
  kind: ArchivedKind;
  /** 이긴 쪽. 비겼거나 끝나지 않았으면 null */
  winner: Side | null;
}

export interface ArchivedGame {
  id: string;
  /** 끝난 때(ms). 목록은 이 순서로 선다. */
  endedAt: number;
  mySide: Side;
  levelId: string;
  /** 급수 이름. 급수 사다리가 바뀌어도 그때 이름으로 남도록 따로 적는다. */
  levelName: string;
  variant: string;
  result: ArchivedResult;
  history: HistoryEntry[];
  /** 복기를 돌렸으면 그 결과. 다시 열 때 또 돌리지 않는다. */
  reviewed: ReviewedMove[] | null;
}

export const ARCHIVE_LIMIT = 100;

/** 판마다 붙는 이름표. 시각과 난수를 붙여 같은 밀리초에 두 판이 생겨도 갈린다. */
export function newGameId(now = Date.now(), rand = Math.random): string {
  return now.toString(36) + "-" + Math.floor(rand() * 36 ** 4).toString(36);
}

/**
 * 판을 목록에 넣는다. 같은 id 가 있으면 바꾼다.
 *
 * 한 판이 여러 번 들어올 수 있다. 끝나는 순간 한 번, 복기를 돌리면 또 한 번,
 * 끝난 뒤 무르고 다시 두어 다르게 끝나면 또 한 번. 그때마다 새 줄이 생기면
 * 같은 판이 목록에 여럿 선다.
 */
export function upsertGame(
  list: ArchivedGame[],
  game: ArchivedGame,
  limit = ARCHIVE_LIMIT
): ArchivedGame[] {
  const rest = list.filter((g) => g.id !== game.id);
  return [game, ...rest].sort((a, b) => b.endedAt - a.endedAt).slice(0, limit);
}

/** 진 쪽이 어떻게 졌는지. 이긴 쪽은 '패' 를 '승' 으로 바꿔 읽는다. */
const HOW: Record<ArchivedKind, string> = {
  checkmate: "외통",
  stalemate: "",
  points: "점수",
  bikjang: "빅장",
  // 양쪽 한수쉼은 점수로 갈린 것이라 목록에서는 점수승·점수패로 적는다.
  passes: "점수",
  resign: "기권",
  flag: "시간",
  abandoned: "",
  record: "",
};

export interface ResultTag {
  /** "기권패", "외통승", "무승부", "중단" */
  text: string;
  tone: "win" | "lose" | "draw" | "none";
}

/**
 * 목록에 적을 승부. 늘 '내' 쪽에서 본다.
 *
 * 카카오장기의 "楚 기권패" 처럼 어떻게 끝났는지까지 붙인다. 이겼는지만 적으면
 * 목록을 훑으며 '시간에 쫓겨 진 판' 을 골라낼 수 없다.
 */
export function resultTag(game: Pick<ArchivedGame, "result" | "mySide">): ResultTag {
  const { kind, winner } = game.result;
  if (kind === "abandoned") return { text: "중단", tone: "none" };
  if (winner === null) return { text: "무승부", tone: "draw" };
  const won = winner === game.mySide;
  return { text: HOW[kind] + (won ? "승" : "패"), tone: won ? "win" : "lose" };
}

/**
 * 끝난 때를 사람 말로. "방금 전", "12분 전", "3시간 전", "어제", "8월 28일".
 * 한 해가 지나면 연도까지 적는다.
 */
export function whenLabel(endedAt: number, now = Date.now()): string {
  const min = Math.floor((now - endedAt) / 60_000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  if (min < 24 * 60) return `${Math.floor(min / 60)}시간 전`;

  const d = new Date(endedAt);
  const today = new Date(now);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return "어제";
  }
  const md = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return d.getFullYear() === today.getFullYear() ? md : `${d.getFullYear()}년 ${md}`;
}

// --- 읽어 온 값 확인 ----------------------------------------------------------
//
// 목록은 사람이 고칠 수도 있는 자리(localStorage)에서 온다. 한 판이 깨졌다고
// 목록 전체를 버리면 안 되므로, 판마다 따져서 멀쩡한 것만 남긴다.

const SIDES = ["cho", "han"];
/*
 * 받아 줄 결과 종류. 배열로 적어 두었을 때는 끝나는 길(빅장·양쪽 한수쉼)을 늘리면서
 * 여기를 빠뜨려, 그렇게 끝난 판이 새로고침하면 목록에서 사라질 뻔했다. 종류마다
 * 키를 두는 표로 두면 하나라도 빠질 때 타입 검사가 잡는다.
 */
const KIND_TABLE: Record<ArchivedKind, true> = {
  checkmate: true,
  stalemate: true,
  points: true,
  bikjang: true,
  passes: true,
  resign: true,
  flag: true,
  abandoned: true,
  record: true,
};
const KINDS = Object.keys(KIND_TABLE) as ArchivedKind[];

function isPly(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.fen === "string" &&
    p.fen.length < 200 &&
    typeof p.notation === "string" &&
    (p.move === null || typeof p.move === "string") &&
    (p.mover === null || SIDES.includes(p.mover as string)) &&
    (p.score === null || typeof p.score === "number")
  );
}

export function isArchivedGame(v: unknown): v is ArchivedGame {
  if (typeof v !== "object" || v === null) return false;
  const g = v as Record<string, unknown>;
  const r = g.result as Record<string, unknown> | null;
  return (
    typeof g.id === "string" &&
    typeof g.endedAt === "number" &&
    SIDES.includes(g.mySide as string) &&
    typeof g.levelId === "string" &&
    typeof g.levelName === "string" &&
    typeof g.variant === "string" &&
    typeof r === "object" &&
    r !== null &&
    KINDS.includes(r.kind as ArchivedKind) &&
    (r.winner === null || SIDES.includes(r.winner as string)) &&
    Array.isArray(g.history) &&
    g.history.length >= 2 &&
    g.history.length <= 1000 &&
    g.history.every(isPly) &&
    (g.reviewed === null || Array.isArray(g.reviewed))
  );
}

/**
 * 읽어 온 목록에서 멀쩡한 판만 새 순서로. 목록 모양조차 아니면 빈 목록.
 *
 * 수보다 복기 결과가 적은 판은 '복기 전' 으로 되돌린다. 중간에 멈춘 복기가 그대로
 * 저장되던 때(2945fdb 까지)의 판이다 - 두면 '복기함' 이 붙은 채 성적표가 0수로 뜬다.
 */
export function readArchive(v: unknown): ArchivedGame[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isArchivedGame)
    .map((g) =>
      g.reviewed && g.reviewed.length !== g.history.length - 1 ? { ...g, reviewed: null } : g
    )
    .sort((a, b) => b.endedAt - a.endedAt)
    .slice(0, ARCHIVE_LIMIT);
}

/**
 * 기보 목록 아래의 쪽 번호. 0 부터 센 쪽 번호와 줄임표("gap")를 늘어놓는다.
 *
 * 쪽이 일곱 이하면 다 보인다. 그보다 많으면 처음·끝과 지금 쪽 앞뒤 하나씩만
 * 두고 사이를 줄임표로 접는다(1 … 4 5 6 … 9). 줄임표가 쪽 하나만 가리게
 * 되면 줄임표 대신 그 쪽을 그냥 보인다 - "1 … 3" 보다 "1 2 3" 이 짧다.
 * 칸 수가 일곱으로 늘 같아서 쪽을 넘겨도 번호 줄의 폭이 흔들리지 않는다.
 */
export function pageItems(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const run = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);
  // 앞쪽 끝 가까이면 앞 다섯, 뒤쪽 끝 가까이면 뒤 다섯을 붙여 보인다.
  if (current <= 3) return [...run(0, 4), "gap", total - 1];
  if (current >= total - 4) return [0, "gap", ...run(total - 5, total - 1)];
  return [0, "gap", current - 1, current, current + 1, "gap", total - 1];
}
