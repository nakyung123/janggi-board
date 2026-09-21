// 급수 — 엔진 실력 단계
//
// 왜 이렇게 만들었는지 (엔진에 직접 물어보고 정한 것이다)
//
// 1. UCI_Elo 는 쓰지 않는다.
//    엔진에 UCI_LimitStrength / UCI_Elo(500~2850) 옵션이 있긴 하다. 그런데
//    장기 변형에서 Elo 500 과 2850 을 각각 돌려보면 둘 다 depth 15~16 으로
//    멀쩡한 수를 낸다. 이 환산표는 체스용으로 맞춰진 것이라 장기에는 눈금이
//    붙지 않는다. 숫자만 그럴듯하고 실제로 약해지지 않는다.
//
// 2. Skill Level(-20~20) 은 제대로 먹힌다.
//    초기 국면에서 여섯 번씩 돌려보면 Skill 20 은 여섯 번 다 같은 최선수를
//    고르고, Skill -20 은 최선수를 아예 고르지 않는다. 종반 국면에서는
//    Skill -20~-5 가 여덟 번 중 여덟 번 궁만 제자리에서 꼬물거렸다.
//
// 3. 시간이 아니라 노드로 자른다.
//    go nodes N 은 정확히 N 노드에서 끊긴다(요청 1000 → 실제 1000).
//    시간으로 자르면 빠른 PC 의 3급이 느린 PC 에서는 5급이 된다. 노드로
//    자르면 어느 기기에서나 같은 급수다.
//
// 그래서 한 급수 = (Skill Level, 노드 수) 한 쌍이다.

import type { SearchLimits } from "./types";

export interface Level {
  id: string;
  /** 화면에 뜨는 이름 */
  name: string;
  /** 한 줄 설명 */
  desc: string;
  /** 엔진의 Skill Level. 낮을수록 최선수를 덜 고른다. */
  skill: number;
  /** 한 수에 허용하는 탐색량 */
  nodes: number;
}

/**
 * 아래에서 위로 갈수록 세진다.
 *
 * 이름은 장기 급수를 빌려 썼을 뿐 공인 급수가 아니다. 이 앱 안에서만 쓰는
 * 눈금이고, 화면에도 그렇게 적어둔다.
 */
export const LEVELS: Level[] = [
  { id: "k18", name: "18급", desc: "규칙만 아는 수준. 기물을 그냥 둔다.", skill: -20, nodes: 2_000 },
  { id: "k15", name: "15급", desc: "한 수 앞만 본다.", skill: -17, nodes: 4_000 },
  { id: "k12", name: "12급", desc: "공짜 기물은 챙긴다.", skill: -14, nodes: 8_000 },
  { id: "k9", name: "9급", desc: "두 수짜리 수는 놓치지 않는다.", skill: -11, nodes: 16_000 },
  { id: "k6", name: "6급", desc: "포진을 갖추고 둔다.", skill: -8, nodes: 32_000 },
  { id: "k3", name: "3급", desc: "웬만한 동네 고수.", skill: -5, nodes: 70_000 },
  { id: "k1", name: "1급", desc: "실수가 드물다.", skill: -1, nodes: 150_000 },
  { id: "d1", name: "1단", desc: "빈틈을 내주면 바로 파고든다.", skill: 4, nodes: 350_000 },
  { id: "d3", name: "3단", desc: "종반이 정확하다.", skill: 9, nodes: 800_000 },
  { id: "d5", name: "5단", desc: "사람이 이기기 어렵다.", skill: 14, nodes: 2_000_000 },
  { id: "top", name: "아마최강", desc: "봐주지 않는다. 프로보다 강하다.", skill: 20, nodes: 5_000_000 },
];

/** 처음 켰을 때의 상대. 너무 세면 한 판도 못 이기고 접는다. */
export const DEFAULT_LEVEL_ID = "k6";

export const levelById = (id: string): Level =>
  LEVELS.find((l) => l.id === id) ?? LEVELS[4];

/**
 * 노드로만 자르면 약한 급수가 눈 깜짝할 새에 둬서 대국 같지가 않다.
 * 최소 생각 시간을 함께 준다. movetime 과 nodes 를 같이 주면 엔진은
 * 둘 중 먼저 닿는 쪽에서 멈추므로, 여기서는 nodes 만 걸고 기다리는 일은
 * 부르는 쪽(App)에서 한다.
 */
export const MIN_THINK_MS = 450;

export const limitsOf = (level: Level): SearchLimits => ({ nodes: level.nodes });

// --- 복기 깊이 -----------------------------------------------------------

export interface ReviewDepth {
  id: string;
  name: string;
  desc: string;
  nodes: number;
}

/**
 * 복기는 기보 한 수마다 엔진을 한 번씩 돌린다. 100수짜리 기보면 101번이다.
 * 그래서 깊이를 고를 수 있어야 한다. 아래 예상 시간은 한 수당 대략
 * 25만 노드/초 기준이다.
 */
export const REVIEW_DEPTHS: ReviewDepth[] = [
  { id: "quick", name: "빠름", desc: "100수에 약 40초", nodes: 100_000 },
  { id: "normal", name: "보통", desc: "100수에 약 3분", nodes: 500_000 },
  { id: "deep", name: "정밀", desc: "100수에 약 12분", nodes: 2_000_000 },
];

export const DEFAULT_REVIEW_DEPTH_ID = "normal";

export const reviewDepthById = (id: string): ReviewDepth =>
  REVIEW_DEPTHS.find((d) => d.id === id) ?? REVIEW_DEPTHS[1];
