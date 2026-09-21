// 기보 저장·불러오기
//
// 국면 하나(FEN)만으로는 어떻게 그 자리에 왔는지 알 수 없다. 그래서
// 시작 국면과 둔 수를 함께 담는다. 평가치도 같이 저장해 두면 다시 열었을 때
// 형세 그래프가 그대로 살아난다.

export const RECORD_FORMAT = "janggi-board/2";
/** 급수·대국 결과가 없던 첫 형식. 읽기만 지원한다. */
const RECORD_FORMAT_V1 = "janggi-board/1";

export interface RecordMove {
  /** 엔진 좌표. 예: a4b4 */
  move: string;
  /** 장기 기보 표기. 예: 71卒72 */
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

  const r = raw as Partial<GameRecord>;
  // 급수와 결과가 없던 첫 형식도 그대로 읽는다. 없는 항목만 채워 넣는다.
  if (r.format !== RECORD_FORMAT && r.format !== RECORD_FORMAT_V1) {
    throw new Error(
      `모르는 기보 형식입니다. (${String(r.format ?? "표시 없음")})`
    );
  }
  if (typeof r.startFen !== "string" || !r.startFen.includes("/")) {
    throw new Error("시작 국면(FEN)이 없거나 형식이 맞지 않습니다.");
  }
  if (!Array.isArray(r.moves)) {
    throw new Error("수순 목록이 없습니다.");
  }
  for (const [i, m] of r.moves.entries()) {
    if (!m || typeof m.move !== "string") {
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
