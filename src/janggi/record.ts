// 기보 파일 — 저장·불러오기(JSON), 기보 목록의 판 ↔ 파일 변환
//
// 국면 하나(FEN)만으로는 어떻게 그 자리에 왔는지 알 수 없다. 그래서
// 시작 국면과 둔 수를 함께 담는다. 평가치도 같이 저장해 두면 다시 열었을 때
// 형세 그래프가 그대로 살아난다.

import type { ArchivedGame } from "./archive";
import { newGameId } from "./archive";
import { parseFen } from "./board";
import type { HistoryEntry } from "./history";
import { nextEntry, startHistory } from "./history";
import { isMoveString, splitMove } from "./notation";
import type { Side } from "./pieces";

export const RECORD_FORMAT = "janggi-board/2";
/** 급수·대국 결과가 없던 첫 형식. 읽기만 지원한다. */
const RECORD_FORMAT_V1 = "janggi-board/1";

/** FEN 에 들어갈 수 있는 글자. 줄바꿈이 섞이면 엔진 명령이 한 줄 더 생긴다. */
const FEN_TEXT = /^[A-Za-z0-9/\- ]{1,200}$/;
/** 한 판에 받아 줄 수의 한도. 장기 규칙상 200수를 넘지 않지만 넉넉히 둔다. */
const MAX_MOVES = 1000;

export interface RecordMove {
  /** 엔진 좌표. 예: a4b4 */
  move: string;
  /** 장기 기보 표기. 예: 71졸72 */
  notation: string;
  /** 초(楚) 기준 평가치. 분석 전이면 없다. */
  score?: number;
}

/** 한 진영을 누가 잡았는지. 복기할 때 "내 수" 를 가려내는 데 쓴다. */
export interface RecordPlayer {
  kind: "human" | "engine";
  /** 엔진이면 어느 급수였는지 (levels.ts 의 id) */
  level?: string;
  /** 화면에 띄울 이름. 예: "나", "6급" */
  label: string;
}

export type RecordResult = "cho" | "han" | "draw" | "unfinished";

export interface GameRecord {
  format: typeof RECORD_FORMAT;
  /** 저장한 날짜 */
  savedAt: string;
  /** 시작 국면 */
  startFen: string;
  moves: RecordMove[];
  /** 어떤 규칙으로 뒀는지 */
  variant: string;
  /** 누가 어느 쪽을 잡았는지 */
  players: Record<"cho" | "han", RecordPlayer>;
  /** 끝났으면 누가 이겼는지 */
  result: RecordResult;
  note?: string;
}

const ANONYMOUS: RecordPlayer = { kind: "human", label: "사람" };

export function buildRecord(input: {
  startFen: string;
  moves: RecordMove[];
  variant: string;
  players: Record<"cho" | "han", RecordPlayer>;
  result: RecordResult;
  note?: string;
}): GameRecord {
  return {
    format: RECORD_FORMAT,
    savedAt: new Date().toISOString(),
    startFen: input.startFen,
    moves: input.moves,
    variant: input.variant,
    players: input.players,
    result: input.result,
    note: input.note,
  };
}

/** 파일로 받은 내용을 믿지 않고 하나씩 확인한다. 이상하면 왜 이상한지 알려준다. */
export function parseRecord(text: string): GameRecord {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("기보 파일이 아닙니다. JSON 형식이 깨져 있습니다.");
  }
  return readRecord(raw);
}

/**
 * 읽어 들인 값(JSON 을 푼 것)이 기보인지 하나씩 확인해 기보로 만든다.
 */
function readRecord(raw: unknown): GameRecord {
  if (!raw || typeof raw !== "object") {
    throw new Error("기보가 아닙니다.");
  }
  const r = raw as Partial<GameRecord>;
  // 급수와 결과가 없던 첫 형식도 그대로 읽는다. 없는 항목만 채워 넣는다.
  if (r.format !== RECORD_FORMAT && r.format !== RECORD_FORMAT_V1) {
    throw new Error(
      `모르는 기보 형식입니다. (${String(r.format ?? "표시 없음")})`
    );
  }
  /*
   * 파일은 남이 보낸 것일 수 있다. 국면과 수는 엔진에게 UCI 명령 한 줄로 그대로 넘어가므로
   * 줄바꿈이나 엉뚱한 글자가 섞이면 명령이 한 줄 더 생긴다. 글자까지 보고 받는다.
   */
  if (typeof r.startFen !== "string" || !FEN_TEXT.test(r.startFen)) {
    throw new Error("시작 국면(FEN)이 없거나 형식이 맞지 않습니다.");
  }
  if (!Array.isArray(r.moves)) {
    throw new Error("수순 목록이 없습니다.");
  }
  if (r.moves.length > MAX_MOVES) {
    throw new Error(`수가 너무 많습니다. (${r.moves.length}수)`);
  }
  for (const [i, m] of r.moves.entries()) {
    if (!m || typeof m.move !== "string" || !isMoveString(m.move)) {
      throw new Error(`${i + 1}번째 수의 형식이 맞지 않습니다.`);
    }
  }

  return {
    format: RECORD_FORMAT,
    savedAt: typeof r.savedAt === "string" ? r.savedAt : "",
    startFen: r.startFen,
    moves: r.moves,
    variant: typeof r.variant === "string" ? r.variant : "janggi",
    players: {
      cho: readPlayer(r.players?.cho),
      han: readPlayer(r.players?.han),
    },
    result: readResult(r.result),
    note: typeof r.note === "string" ? r.note : undefined,
  };
}

function readPlayer(p: unknown): RecordPlayer {
  if (!p || typeof p !== "object") return ANONYMOUS;
  const v = p as Partial<RecordPlayer>;
  const kind = v.kind === "engine" ? "engine" : "human";
  return {
    kind,
    level: typeof v.level === "string" ? v.level : undefined,
    label: typeof v.label === "string" && v.label ? v.label : ANONYMOUS.label,
  };
}

function readResult(v: unknown): RecordResult {
  return v === "cho" || v === "han" || v === "draw" ? v : "unfinished";
}

/** 기보 목록의 한 판을 파일에 담을 모양으로. 누가 어느 쪽을 어떤 급수로 잡았는지와 승부까지. */
export function recordOfGame(game: ArchivedGame): GameRecord {
  const player = (side: Side): RecordPlayer =>
    game.mySide === side
      ? { kind: "human", label: "나" }
      : { kind: "engine", level: game.levelId, label: game.levelName };
  return buildRecord({
    startFen: game.history[0].fen,
    moves: game.history.slice(1).map((h) => ({
      move: h.move ?? "",
      notation: h.notation,
      score: h.score ?? undefined,
    })),
    variant: game.variant,
    players: { cho: player("cho"), han: player("han") },
    result: game.result.kind === "abandoned" ? "unfinished" : (game.result.winner ?? "draw"),
  });
}

/**
 * 파일에서 읽은 기보를 기보 목록의 한 판으로.
 *
 * 시작 국면에서 수를 하나씩 다시 두며 국면을 되살린다. 출발 자리에 기물이 없는
 * 수를 만나면 그 수를 들어 Error 를 던진다. 수가 규칙에 맞는지는 엔진만 알아서, 불러올 때
 * App 이 따로 묻는다(engine.firstIllegalMove).
 * 기보 표기는 파일에 적힌 것을 쓰지 않고 수순에서 다시 만든다. 예전 파일은 표기가 한자이고,
 * 대국 탭에서 둔 수와 같은 규칙(nextEntry)으로 만들어야 서로 맞는다.
 * 파일에는 누가 이겼는지만 있고 어떻게 끝났는지는 없어서 결과는 '불러온 기보' 다.
 * 사람이 잡은 쪽을 '나' 로 보고, 둘 다 사람이면 초로 본다.
 */
export function gameOfRecord(record: GameRecord, now = Date.now()): ArchivedGame {
  const history: HistoryEntry[] = startHistory(record.startFen);
  for (const m of record.moves) {
    const before = history[history.length - 1].fen;
    const { from, to } = splitMove(m.move);
    if (!from || !parseFen(before).board[from]) {
      throw new Error(
        `${m.notation || m.move} 을(를) 둘 수 없습니다. 기보가 국면과 맞지 않습니다.`
      );
    }
    history.push({ ...nextEntry(before, from, to), score: m.score ?? null });
  }
  if (history.length < 2) throw new Error("수가 하나도 없는 기보입니다.");

  const me: Side =
    record.players.han.kind === "human" && record.players.cho.kind !== "human" ? "han" : "cho";
  const opponent = record.players[me === "cho" ? "han" : "cho"];
  return {
    id: newGameId(now),
    // 목록은 끝난 때 순서라, 파일의 저장 날짜로 두면 불러온 판이 한참 아래에 묻힌다.
    endedAt: now,
    mySide: me,
    levelId: opponent.level ?? "",
    levelName: opponent.label,
    variant: record.variant,
    result:
      record.result === "unfinished"
        ? { kind: "abandoned", winner: null }
        : { kind: "record", winner: record.result === "draw" ? null : record.result },
    history,
    reviewed: null,
  };
}

/** 저장 파일 이름. 날짜를 넣어 여러 판을 구분한다. */
export function recordFileName(record: GameRecord): string {
  const d = record.savedAt ? new Date(record.savedAt) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `장기기보-${stamp}-${record.moves.length}수.json`;
}

export function downloadRecord(record: GameRecord): void {
  const blob = new Blob([JSON.stringify(record, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = recordFileName(record);
  a.click();
  URL.revokeObjectURL(url);
}
