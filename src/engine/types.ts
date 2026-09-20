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
  infinite?: boolean;
}

export interface EngineOptions {
  threads: number;
  hashMb: number;
  multiPV: number;
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
