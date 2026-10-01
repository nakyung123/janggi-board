// 엔진과 주고받는 값의 모양 — 탐색 결과, 탐색 한계, 엔진 설정, 국면, 규칙(variant)

/** 탐색 중 엔진이 흘려보내는 후보 수순 하나 */
export interface AnalysisLine {
  multipv: number;
  depth: number;
  seldepth: number;
  /** 초(楚) 시점 점수. 양수면 초가 유리하다. */
  score: number;
  /** 외통까지 남은 수. 값이 있으면 score 는 무시한다. */
  mate: number | null;
  pv: string[];
}

export interface AnalysisSnapshot {
  lines: AnalysisLine[];
  depth: number;
  nodes: number;
  nps: number;
  timeMs: number;
  hashfull: number;
  /** 탐색이 끝났으면 최선수 */
  bestmove: string | null;
  running: boolean;
}

export interface SearchLimits {
  depth?: number;
  movetimeMs?: number;
  /**
   * 탐색할 노드 수. 급수 대국이 쓴다.
   * 시간으로 자르면 빠른 PC 의 3급이 느린 PC 에서는 5급이 되므로,
   * 기기에 상관없이 같은 실력을 내려면 노드로 잘라야 한다.
   */
  nodes?: number;
  infinite?: boolean;
}

export interface EngineOptions {
  threads: number;
  hashMb: number;
  multiPV: number;
  /**
   * 엔진의 Skill Level(-20~20). 낮을수록 최선수를 덜 고른다.
   * 급수를 만드는 두 손잡이 중 하나다(나머지 하나는 SearchLimits.nodes).
   */
  skill: number;
  variant: Variant;
}

/**
 * 이 앱이 쓰는 장기 규칙(Fairy-Stockfish 의 변형 이름).
 *   janggi            표준 - 빅장은 점수로, 200수 뒤 점수로
 *   janggimodern      현대(카카오 호환) - 빅장 없음, 같은 수 되풀이 금지
 *   janggitraditional 전통 - 빅장은 무승부, 점수제 없음
 */
export type Variant = "janggi" | "janggimodern" | "janggitraditional";

export const VARIANTS: readonly Variant[] = ["janggi", "janggimodern", "janggitraditional"];

export function isVariant(v: unknown): v is Variant {
  return typeof v === "string" && (VARIANTS as readonly string[]).includes(v);
}

/**
 * 저장해 둔 엔진 설정(급수가 정하는 skill 은 빼고)이 지금도 쓸 수 있는 모양인지.
 * localStorage 는 사람이 고칠 수 있고 옛 값도 남아 있어서, 어긋나면 기본값으로 돌아간다.
 */
export function isEnginePrefs(v: unknown): v is Omit<EngineOptions, "skill"> {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.threads === "number" && p.threads >= 1 && p.threads <= 16 &&
    typeof p.hashMb === "number" && p.hashMb >= 16 &&
    typeof p.multiPV === "number" && p.multiPV >= 1 && p.multiPV <= 8 &&
    isVariant(p.variant)
  );
}

export interface LoadProgress {
  stage: string;
  loaded: number;
  total: number;
}

/**
 * 국면 한 번 살펴본 결과.
 * 규칙 판정은 전부 엔진이 하므로, UI 는 이 세 가지만 보고 상태를 정한다.
 */
export interface PositionProbe {
  /** 엔진이 해석해 되돌려준 FEN. 입력이 이상하면 null */
  fen: string | null;
  /** 지금 궁을 노리고 있는 기물들의 자리. 비어 있지 않으면 장군 */
  checkers: string[];
  /** 둘 수 있는 모든 수. 0개면 대국이 끝난 것 */
  legal: string[];
}

/**
 * 엔진에 넘길 국면.
 *
 * 현재 FEN 만 넘기면 안 된다. 장기의 장군반복 금지와 빅장 규칙은 "어떤 수순으로
 * 여기까지 왔는가"를 봐야 판정되기 때문이다. 실제로 같은 판이라도 수순을 함께
 * 넘기면 합법수가 달라진다.
 */
export interface PositionRef {
  /** 기보의 시작 국면 */
  startFen: string;
  /** 시작 국면에서 지금까지 둔 수 */
  moves: string[];
}

/**
 * UCI 는 **줄 단위** 프로토콜이다. 명령 한 줄 안에 줄바꿈이 끼면 그 뒤가 다른 명령이 된다.
 *
 * 국면과 수는 밖에서 들어올 수 있다(기보 파일, 브라우저에 남아 있던 값). 그 값이 그대로
 * 명령 줄에 들어가므로, 줄바꿈이 섞이면 엔진에게 시키지 않은 일을 시킬 수 있다.
 *
 *   position fen <판>\ngo infinite   →  position 한 줄 + go 한 줄
 *
 * 엔진은 wasm 안에 갇혀 있어 파일도 그물도 건드리지 못하지만, 탐색을 멈추지 않게 하거나
 * 설정을 바꿔 분석을 어그러뜨릴 수는 있다. 들어오는 쪽에서도 거르고(janggi/record.ts,
 * janggi/history.ts) 나가는 쪽인 여기서도 막는다 - 한쪽만 막으면 나중에 생기는 새 경로가
 * 그대로 뚫린다.
 */
const UCI_SAFE = /^[A-Za-z0-9/\- ]+$/;

/** UCI 의 position 명령 한 줄로 만든다. */
export function positionCommand(ref: PositionRef): string {
  if (!UCI_SAFE.test(ref.startFen) || ref.moves.some((m) => !UCI_SAFE.test(m))) {
    throw new Error("국면에 쓸 수 없는 글자가 들어 있습니다.");
  }
  return ref.moves.length
    ? `position fen ${ref.startFen} moves ${ref.moves.join(" ")}`
    : `position fen ${ref.startFen}`;
}

/** React 의존성 비교용 열쇠. 같은 국면이면 같은 문자열이 된다. */
export function positionKey(ref: PositionRef): string {
  return ref.startFen + "|" + ref.moves.join(" ");
}

/**
 * "엔진이 방금 이 국면에서 뒀다" 는 기억을 언제까지 들고 있을지.
 *
 * 이 기억이 필요한 이유: 착수를 예약해 둔 사이에 effect 가 다시 돌면 같은
 * 국면에서 두 번 두게 된다. 그래서 한 번 둔 국면을 적어 두고 건너뛴다.
 *
 * 이 기억을 버려야 하는 이유: 무르면 그 국면이 되돌아온다. 기억이 남아 있으면
 * 엔진은 "이미 뒀다" 고 보고 영영 두지 않는다 - 무르고 같은 수를 다시 두면 판이
 * 멈추고, 새로고침 말고는 빠져나올 길이 없다.
 *
 * 그래서 기억은 '그 국면에 머무는 동안' 만 유효하다. 국면이 달라지는 순간
 * 버린다. 무르기·기보 이동·새 대국이 한 번에 덮인다.
 */
export function forgetIfMoved(remembered: string | null, key: string): string | null {
  return remembered === key ? remembered : null;
}
