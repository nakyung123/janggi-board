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

/*
 * 시계는 두 가지뿐이다 - '시계를 쓴다(5분) / 안 쓴다'. 고를 것이 많으면 처음 온
 * 사람은 무엇이 보통인지 모르고, 실제로 쓰는 길이는 5분대 하나다. 이름은 짧게
 * "5분" 이고, 초읽기까지 적은 전체 설명(describeClock)은 화면 읽기 프로그램에만 붙여 읽힌다.
 *
 * 옛 판에서 남긴 id(normal·long·custom 같은 것)는 clockPresetById 가 기본값으로 떨군다.
 */
export const CLOCK_PRESETS: ClockPreset[] = [
  { id: "off", name: "시계 없음", enabled: false, mainSeconds: 0, byoyomiSeconds: 0, byoyomiCount: 0 },
  { id: "five", name: "5분", enabled: true, mainSeconds: 300, byoyomiSeconds: 30, byoyomiCount: 3 },
];

/*
 * 기본은 5분 + 30초 3회. 카카오 장기가 쓰는 5분대가 실제로 사람들이 두는 길이다.
 * 10분이면 한 판에 스무 분 넘게 걸려 들어와서 한 판 두고 나가는 흐름에 맞지 않는다.
 * 제한시간이 끝나도 초읽기로 넘어가므로 갑자기 시간패하지는 않는다.
 */
export const DEFAULT_CLOCK_ID = "five";

/** "5분 + 30초 3회" 처럼 읽기 좋게. */
export function describeClock(c: ClockSettings): string {
  if (!c.enabled) return "시계 없음";
  const parts: string[] = [];
  if (c.mainSeconds > 0) {
    const m = Math.floor(c.mainSeconds / 60);
    const sec = c.mainSeconds % 60;
    parts.push(sec === 0 ? `${m}분` : m === 0 ? `${sec}초` : `${m}분 ${sec}초`);
  }
  if (c.byoyomiSeconds > 0 && c.byoyomiCount > 0) {
    parts.push(`${c.byoyomiSeconds}초 ${c.byoyomiCount}회`);
  }
  return parts.join(" + ") || "시계 없음";
}

/*
 * 모르는 id 면 기본값으로 떨어진다. 기본값도 id 로 찾는다 - CLOCK_PRESETS[2] 처럼
 * 자리로 가리키면 목록 가운데에 하나를 끼워 넣을 때 뜻이 조용히 바뀐다.
 */
export const clockPresetById = (id: string): ClockPreset =>
  CLOCK_PRESETS.find((p) => p.id === id) ??
  CLOCK_PRESETS.find((p) => p.id === DEFAULT_CLOCK_ID) ??
  CLOCK_PRESETS[0];

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
 * 한쪽을 시간 다 쓴 모습으로 만든다.
 *
 * 되살린 판에 쓴다. 시계 자체는 저장하지 않는다 — 새로고침한 동안 시간이
 * 얼마나 흘렀는지 알 길이 없어서 되살린 값을 믿을 수 없기 때문이다. 다만
 * '시간패로 끝났다' 는 사실은 남겨두므로, 그 쪽 시계도 0 으로 맞춰준다.
 * 안 그러면 시계가 가득 찬 채로 "시간패" 가 적혀 앞뒤가 맞지 않는다.
 */
export function withFlagged(state: ClockState, side: Side | null): ClockState {
  if (!side) return state;
  return {
    ...state,
    [side]: { ...state[side], mainMs: 0, byoyomiMs: 0, periods: 0, flagged: true },
  };
}

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

/**
 * 남은 시간의 비율 (0~1). 줄어드는 막대의 길이다.
 *
 * 숫자만 있으면 "얼마나 남았나"를 읽어서 계산해야 한다. 막대는 보면 바로
 * 안다. 제한시간 중에는 제한시간 전체에 대한 비율, 초읽기 중에는 그 회
 * 전체에 대한 비율이라 - 초읽기에서는 한 수 둘 때마다 막대가 도로 찬다.
 * 그게 초읽기가 실제로 하는 일이라 눈으로 그대로 보인다.
 */
export function clockRatio(c: SideClock, s: ClockSettings): number {
  if (c.flagged) return 0;
  const full = (c.inByoyomi ? s.byoyomiSeconds : s.mainSeconds) * 1000;
  if (full <= 0) return 0;
  const left = c.inByoyomi ? c.byoyomiMs : c.mainMs;
  return Math.max(0, Math.min(1, left / full));
}

export interface ClockView {
  text: string;
  inByoyomi: boolean;
  periods: number;
  /** 얼마 안 남아서 눈에 띄게 해야 하는지 */
  urgent: boolean;
  flagged: boolean;
  /**
   * 마지막 몇 초를 세는 중인지 (5,4,3,2,1). 아니면 null.
   *
   * "남은 시간이 얼마인지 잘 알려주지 않아 시간패한다" 는 불만이 장기 앱마다
   * 반복된다. 숫자가 작아질 때 따로 표시해서 눈에 걸리게 한다.
   */
  countdown: number | null;
}

/** 이 시간부터 초를 센다. */
const COUNTDOWN_FROM_MS = 5_000;

/** 이 시간부터 초읽기 소리를 낸다(hooks/useGameClock.ts). 숫자를 키우는 5초보다 앞서 귀로 먼저 알린다. */
const ALARM_FROM_MS = 10_000;

/**
 * 다 쓰면 무언가를 잃는 시간이 몇 ms 남았는지. 그런 시간이 아니면 null.
 *
 * 초읽기 중이면 이번 회의 남은 시간이다(다 쓰면 한 회가 줄거나 시간패).
 * 초읽기가 남은 채 제한시간을 쓰는 중이면 null 이다 - 제한시간이 끝나도
 * 초읽기로 넘어갈 뿐 잃는 것이 없다. 초읽기가 없는 설정이면 제한시간 끝이 곧
 * 시간패라 제한시간을 센다.
 */
function stakeMs(c: SideClock): number | null {
  if (c.flagged) return null;
  if (c.inByoyomi) return c.byoyomiMs;
  return c.periods === 0 ? c.mainMs : null;
}

/** 남은 시간을 1초 단위로 올려 센다. 0 은 보여주지 않는다 - 아직 둘 수 있다. */
function secondsLeft(ms: number, from: number): number | null {
  if (ms > from) return null;
  return Math.max(1, Math.ceil(Math.max(0, ms) / 1000));
}

function countdownOf(ms: number): number | null {
  return secondsLeft(ms, COUNTDOWN_FROM_MS);
}

/**
 * 초읽기 소리를 낼 초(10, 9, … 1). 소리를 낼 때가 아니면 null.
 * 값이 바뀔 때마다 한 번 울리면 1초에 한 번이 된다.
 */
export function alarmSecondOf(c: SideClock): number | null {
  const ms = stakeMs(c);
  return ms === null ? null : secondsLeft(ms, ALARM_FROM_MS);
}

export function clockView(c: SideClock): ClockView {
  if (c.flagged) {
    return {
      text: "시간패", inByoyomi: false, periods: 0,
      urgent: true, flagged: true, countdown: null,
    };
  }
  if (c.inByoyomi) {
    return {
      text: formatByoyomi(c.byoyomiMs),
      inByoyomi: true,
      periods: c.periods,
      urgent: true,
      flagged: false,
      countdown: countdownOf(c.byoyomiMs),
    };
  }
  const stake = stakeMs(c);
  return {
    text: formatMain(c.mainMs),
    inByoyomi: false,
    periods: c.periods,
    urgent: c.mainMs < 30_000,
    flagged: false,
    // 초읽기가 없는 설정이면 제한시간 끝이 곧 시간패라 여기서도 센다(stakeMs).
    countdown: stake === null ? null : countdownOf(stake),
  };
}
