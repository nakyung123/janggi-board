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
  /** janggi(표준) · janggimodern(카카오 호환) · janggitraditional(빅장 무승부) */
  variant: "janggi" | "janggimodern" | "janggitraditional" | "janggicasual";
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

/** UCI 의 position 명령 한 줄로 만든다. */
export function positionCommand(ref: PositionRef): string {
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
 * 엔진은 "이미 뒀다" 고 보고 영영 두지 않는다. 실제로 무르고 같은 수를 다시
 * 두면 판이 멈췄고, 새로고침 말고는 빠져나올 길이 없었다.
 *
 * 그래서 기억은 '그 국면에 머무는 동안' 만 유효하다. 국면이 달라지는 순간
 * 버린다. 무르기뿐 아니라 기보 이동·기보 불러오기·편집까지 한 번에 덮인다.
 */
export function forgetIfMoved(remembered: string | null, key: string): string | null {
  return remembered === key ? remembered : null;
}
