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
