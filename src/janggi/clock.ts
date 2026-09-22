// 대국 시계
//
// 한국 장기·바둑의 초읽기 방식을 그대로 쓴다.
//
//   1. 제한시간을 먼저 쓴다.
//   2. 제한시간이 바닥나면 초읽기로 넘어간다.
//   3. 초읽기 한 회 안에 두면 회수가 줄지 않고, 그 회가 처음부터 다시 찬다.
//   4. 한 회를 넘기면 회수가 하나 줄고 다음 회가 시작된다.
//   5. 회수를 다 쓰면 시간패.
//
// 시계는 첫 수가 놓여야 돌기 시작한다. 급수를 고르고 상차림을 맞추는 동안
// 시간이 깎이면 곤란하기 때문이다.
//
// 여기는 순수 계산만 한다. 언제 얼마나 흘렀는지는 부르는 쪽이 알려준다.

import type { Side } from "./pieces";

export interface ClockSettings {
  enabled: boolean;
  /** 제한시간 (초) */
  mainSeconds: number;
  /** 초읽기 한 회의 길이 (초) */
  byoyomiSeconds: number;
  /** 초읽기 횟수 */
  byoyomiCount: number;
}

export interface ClockPreset extends ClockSettings {
  id: string;
  name: string;
}

export const CLOCK_PRESETS: ClockPreset[] = [
  { id: "off", name: "시계 없음", enabled: false, mainSeconds: 0, byoyomiSeconds: 0, byoyomiCount: 0 },
  { id: "blitz", name: "3분 + 30초 3회", enabled: true, mainSeconds: 180, byoyomiSeconds: 30, byoyomiCount: 3 },
  { id: "normal", name: "10분 + 30초 3회", enabled: true, mainSeconds: 600, byoyomiSeconds: 30, byoyomiCount: 3 },
  { id: "long", name: "20분 + 1분 5회", enabled: true, mainSeconds: 1200, byoyomiSeconds: 60, byoyomiCount: 5 },
];

export const DEFAULT_CLOCK_ID = "normal";

export const clockPresetById = (id: string): ClockPreset =>
  CLOCK_PRESETS.find((p) => p.id === id) ?? CLOCK_PRESETS[2];

export interface SideClock {
  /** 남은 제한시간 (ms) */
  mainMs: number;
  /** 지금 초읽기 중인지 */
  inByoyomi: boolean;
  /** 이번 초읽기 회에 남은 시간 (ms) */
  byoyomiMs: number;
  /** 남은 초읽기 횟수 */
  periods: number;
  /** 시간을 다 썼는지 */
  flagged: boolean;
}

export type ClockState = Record<Side, SideClock>;

function freshSide(s: ClockSettings): SideClock {
  return {
    mainMs: s.mainSeconds * 1000,
    inByoyomi: s.mainSeconds === 0 && s.byoyomiCount > 0,
    byoyomiMs: s.byoyomiSeconds * 1000,
    periods: s.byoyomiCount,
    flagged: false,
  };
}

export const initialClocks = (s: ClockSettings): ClockState => ({
  cho: freshSide(s),
  han: freshSide(s),
});

/**
 * 시간을 흘려보낸다. 둘 차례인 쪽의 시계만 준다.
 * 제한시간이 바닥나면 남은 시간은 초읽기에서 이어 깎는다.
 */
export function tickClock(
  state: ClockState,
  side: Side,
  elapsedMs: number,
  s: ClockSettings
): ClockState {
  const cur = state[side];
  if (cur.flagged || elapsedMs <= 0) return state;

  let { mainMs, inByoyomi, byoyomiMs, periods } = cur;
  let left = elapsedMs;

  if (!inByoyomi) {
    if (mainMs > left) {
      return { ...state, [side]: { ...cur, mainMs: mainMs - left } };
    }
    // 제한시간을 다 썼다. 남은 만큼은 초읽기에서 빠진다.
    left -= mainMs;
    mainMs = 0;
    if (periods <= 0) {
      return { ...state, [side]: { ...cur, mainMs: 0, flagged: true } };
    }
    inByoyomi = true;
    byoyomiMs = s.byoyomiSeconds * 1000;
  }

  // 한 회를 넘길 때마다 회수가 하나씩 준다. 오래 자리를 비웠으면 여러 회가 날아간다.
  while (left > 0) {
    if (byoyomiMs > left) {
      byoyomiMs -= left;
      left = 0;
      break;
    }
    left -= byoyomiMs;
    periods -= 1;
    if (periods <= 0) {
      return {
        ...state,
        [side]: { ...cur, mainMs: 0, inByoyomi: true, byoyomiMs: 0, periods: 0, flagged: true },
      };
    }
    byoyomiMs = s.byoyomiSeconds * 1000;
  }

  return { ...state, [side]: { ...cur, mainMs, inByoyomi, byoyomiMs, periods } };
}

/**
 * 수를 두고 났을 때. 초읽기 중이었다면 이번 회를 처음부터 다시 채운다.
 * 이게 초읽기의 핵심이다 — 회 안에 두기만 하면 회수는 줄지 않는다.
 */
export function commitMove(
  state: ClockState,
  side: Side,
  s: ClockSettings
): ClockState {
  const cur = state[side];
  if (!cur.inByoyomi || cur.flagged) return state;
  return { ...state, [side]: { ...cur, byoyomiMs: s.byoyomiSeconds * 1000 } };
}

/**
 * 엔진이 한 수에 쓸 시간(ms).
 *
 * 높은 급수는 한 수에 500만 노드까지 본다. 보통 PC 에서 20초쯤 걸리는 양이라,
 * 10분 시계로 두면 엔진이 서른 수쯤에서 제 시간을 다 쓰고 시간패한다.
 * 사람이 그러듯 엔진도 남은 시간을 보고 생각을 끊어야 한다.
 *
 *   제한시간 중 — 앞으로 몇 수가 남았는지 알 수 없으니 25수로 나눠 쓴다.
 *   초읽기 중  — 그 회의 8할까지만 쓴다. 회가 넘어가면 횟수가 깎인다.
 *
 * 초읽기는 회 안에만 두면 횟수가 줄지 않으므로, 8할씩만 쓰는 한 엔진이
 * 시간패하는 일은 없다.
 */
export function moveBudgetMs(c: SideClock, s: ClockSettings): number {
  if (c.flagged) return 300;
  if (c.inByoyomi) return Math.max(300, s.byoyomiSeconds * 800);
  return Math.max(300, c.mainMs / 25);
}

export const flaggedSide = (state: ClockState): Side | null =>
  state.cho.flagged ? "cho" : state.han.flagged ? "han" : null;

/** 남은 시간을 "09:12" 로. 1분 미만이면 "48.3" 처럼 소수 한 자리까지 보여준다. */
export function formatMain(ms: number): string {
  const total = Math.max(0, ms);
  if (total < 60_000) return (total / 1000).toFixed(1);
  const sec = Math.ceil(total / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** 초읽기는 남은 초만 큼직하게 센다. */
export const formatByoyomi = (ms: number): string =>
  String(Math.ceil(Math.max(0, ms) / 1000));

export interface ClockView {
  text: string;
  inByoyomi: boolean;
  periods: number;
  /** 얼마 안 남아서 눈에 띄게 해야 하는지 */
  urgent: boolean;
  flagged: boolean;
}

export function clockView(c: SideClock): ClockView {
  if (c.flagged) {
    return { text: "시간패", inByoyomi: false, periods: 0, urgent: true, flagged: true };
  }
  if (c.inByoyomi) {
    return {
      text: formatByoyomi(c.byoyomiMs),
      inByoyomi: true,
      periods: c.periods,
      urgent: true,
      flagged: false,
    };
  }
  return {
    text: formatMain(c.mainMs),
    inByoyomi: false,
    periods: c.periods,
    urgent: c.mainMs < 30_000,
    flagged: false,
  };
}
