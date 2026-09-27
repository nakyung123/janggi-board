// 대국 시계
//
// 초읽기는 규칙이 미묘해서 말로만 맞춰두면 반드시 틀린다.
// "회 안에 두면 회수가 줄지 않는다" 가 핵심이고, 그게 여기 걸려 있다.

import { describe, expect, it } from "vitest";
import type { ClockSettings, SideClock } from "./clock";
import {
  CUSTOM_CLOCK_ID,
  DEFAULT_CUSTOM_CLOCK,
  clampCustomClock,
  clockPresetById,
  clockView,
  describeClock,
  resolveClock,
  commitMove,
  flaggedSide,
  formatMain,
  initialClocks,
  moveBudgetMs,
  tickClock,
  withFlagged,
} from "./clock";

/** 1분 + 10초 3회. 손으로 셈하기 좋은 값으로 줄여 쓴다. */
const S: ClockSettings = {
  enabled: true,
  mainSeconds: 60,
  byoyomiSeconds: 10,
  byoyomiCount: 3,
};

describe("제한시간", () => {
  it("처음에는 양쪽 다 제한시간을 다 갖고 있다", () => {
    const c = initialClocks(S);
    expect(c.cho.mainMs).toBe(60_000);
    expect(c.han.mainMs).toBe(60_000);
    expect(c.cho.inByoyomi).toBe(false);
    expect(c.cho.periods).toBe(3);
  });

  it("둘 차례인 쪽의 시간만 깎는다", () => {
    const c = tickClock(initialClocks(S), "cho", 5_000, S);
    expect(c.cho.mainMs).toBe(55_000);
    expect(c.han.mainMs).toBe(60_000);
  });

  it("제한시간이 0이 되어야 초읽기로 넘어간다", () => {
    let c = tickClock(initialClocks(S), "cho", 59_900, S);
    expect(c.cho.inByoyomi).toBe(false);

    c = tickClock(c, "cho", 100, S);
    expect(c.cho.inByoyomi).toBe(true);
    expect(c.cho.mainMs).toBe(0);
    expect(c.cho.periods).toBe(3);
  });

  it("제한시간을 넘겨 쓴 만큼은 첫 회에서 이어 깎는다", () => {
    // 63초를 한 번에 흘리면 3초는 초읽기 첫 회에서 빠진다
    const c = tickClock(initialClocks(S), "cho", 63_000, S);
    expect(c.cho.inByoyomi).toBe(true);
    expect(c.cho.byoyomiMs).toBe(7_000);
    expect(c.cho.periods).toBe(3);
  });
});

describe("초읽기", () => {
  /** 제한시간을 다 쓰고 초읽기에 막 들어간 상태 */
  const inByoyomi = () => tickClock(initialClocks(S), "cho", 60_000, S);

  it("회 안에 두면 회수가 줄지 않고 그 회가 다시 찬다", () => {
    let c = inByoyomi();
    c = tickClock(c, "cho", 9_000, S); // 9초 생각
    expect(c.cho.byoyomiMs).toBe(1_000);
    expect(c.cho.periods).toBe(3);

    c = commitMove(c, "cho", S); // 두었다
    expect(c.cho.byoyomiMs).toBe(10_000); // 처음부터 다시
    expect(c.cho.periods).toBe(3); // 회수는 그대로
  });

  it("회를 넘기면 회수가 하나 준다", () => {
    let c = inByoyomi();
    c = tickClock(c, "cho", 10_500, S);
    expect(c.cho.periods).toBe(2);
    expect(c.cho.byoyomiMs).toBe(9_500);
  });

  it("오래 자리를 비우면 여러 회가 한꺼번에 날아간다", () => {
    const c = tickClock(inByoyomi(), "cho", 25_000, S);
    expect(c.cho.periods).toBe(1);
    expect(c.cho.flagged).toBe(false);
  });

  it("회수를 다 쓰면 시간패", () => {
    const c = tickClock(inByoyomi(), "cho", 60_000, S);
    expect(c.cho.flagged).toBe(true);
    expect(flaggedSide(c)).toBe("cho");
  });

  it("시간패한 쪽의 시계는 더 깎이지 않는다", () => {
    const dead = tickClock(inByoyomi(), "cho", 60_000, S);
    expect(tickClock(dead, "cho", 5_000, S)).toBe(dead);
  });

  it("초읽기 회차 수가 0인 설정은 제한시간이 끝나면 바로 시간패", () => {
    const none: ClockSettings = { ...S, byoyomiSeconds: 0, byoyomiCount: 0 };
    const c = tickClock(initialClocks(none), "cho", 60_000, none);
    expect(c.cho.flagged).toBe(true);
  });

  it("제한시간 없이 초읽기만 쓰는 설정도 된다", () => {
    const only: ClockSettings = { ...S, mainSeconds: 0 };
    expect(initialClocks(only).cho.inByoyomi).toBe(true);
  });

  it("제한시간 중에 둔 것은 시계에 아무 영향이 없다", () => {
    const c = tickClock(initialClocks(S), "cho", 5_000, S);
    expect(commitMove(c, "cho", S)).toBe(c);
  });
});

describe("엔진에게 줄 한 수 예산", () => {
  it("제한시간은 25수로 나눠 쓴다", () => {
    expect(moveBudgetMs(initialClocks(S).cho, S)).toBe(60_000 / 25);
  });

  it("초읽기 중에는 그 회의 8할까지만 쓴다", () => {
    const c = tickClock(initialClocks(S), "cho", 60_000, S);
    expect(moveBudgetMs(c.cho, S)).toBe(8_000);
  });

  it("8할만 쓰는 한 초읽기에서 시간패할 수 없다", () => {
    // 예산만큼 생각하고 두기를 되풀이해도 회수가 줄지 않아야 한다
    let c = tickClock(initialClocks(S), "cho", 60_000, S);
    for (let i = 0; i < 50; i++) {
      c = tickClock(c, "cho", moveBudgetMs(c.cho, S), S);
      c = commitMove(c, "cho", S);
    }
    expect(c.cho.flagged).toBe(false);
    expect(c.cho.periods).toBe(3);
  });

  it("시간패한 뒤에도 0을 주지는 않는다", () => {
    const dead = tickClock(tickClock(initialClocks(S), "cho", 60_000, S), "cho", 60_000, S);
    expect(moveBudgetMs(dead.cho, S)).toBeGreaterThan(0);
  });
});

describe("화면에 띄우는 값", () => {
  it("1분이 넘으면 분:초, 아래면 소수 한 자리", () => {
    expect(formatMain(600_000)).toBe("10:00");
    expect(formatMain(61_000)).toBe("1:01");
    expect(formatMain(59_400)).toBe("59.4");
  });

  it("초읽기는 남은 초만 센다", () => {
    const c = tickClock(initialClocks(S), "cho", 63_000, S);
    const v = clockView(c.cho);
    expect(v.inByoyomi).toBe(true);
    expect(v.text).toBe("7");
    expect(v.periods).toBe(3);
  });

  it("시간패는 글자로 알린다", () => {
    const dead = tickClock(tickClock(initialClocks(S), "cho", 60_000, S), "cho", 60_000, S);
    expect(clockView(dead.cho).text).toBe("시간패");
    expect(clockView(dead.cho).flagged).toBe(true);
  });
});

describe("시계 설정 목록", () => {
  it("모르는 id 는 기본값으로 떨어진다", () => {
    expect(clockPresetById("없는-설정").id).toBe("normal");
  });

  it("시계 없음 설정은 꺼져 있다", () => {
    expect(clockPresetById("off").enabled).toBe(false);
  });
});

// 마지막 5초 카운트다운
//
// "남은 시간을 잘 알려주지 않아 시간패한다" 는 불만이 장기 앱마다 반복된다.
// 숫자가 0 이 되기 전에 눈에 걸리게 하는 값이라, 너무 일찍 떠도 너무 늦게
// 떠도 쓸모가 없다.
describe("초읽기 카운트다운", () => {
  const 초읽기 = (ms: number, periods = 3): SideClock => ({
    mainMs: 0, inByoyomi: true, byoyomiMs: ms, periods, flagged: false,
  });

  it("여유가 있으면 세지 않는다", () => {
    expect(clockView(초읽기(30_000)).countdown).toBeNull();
    expect(clockView(초읽기(5_001)).countdown).toBeNull();
  });

  it("5초부터 센다", () => {
    expect(clockView(초읽기(5_000)).countdown).toBe(5);
    expect(clockView(초읽기(4_200)).countdown).toBe(5);
    expect(clockView(초읽기(3_000)).countdown).toBe(3);
    expect(clockView(초읽기(1_100)).countdown).toBe(2);
  });

  it("0 은 보여주지 않는다", () => {
    // "0" 이 뜨면 아직 둘 수 있는데 끝난 줄 안다
    expect(clockView(초읽기(0)).countdown).toBe(1);
    expect(clockView(초읽기(200)).countdown).toBe(1);
  });

  it("시간패한 뒤에는 세지 않는다", () => {
    const c: SideClock = { mainMs: 0, inByoyomi: true, byoyomiMs: 0, periods: 0, flagged: true };
    expect(clockView(c).countdown).toBeNull();
  });

  it("초읽기가 없는 설정이면 제한시간 끝을 센다", () => {
    // 초읽기 0회면 제한시간이 다하는 순간이 곧 시간패다
    const c: SideClock = { mainMs: 3_000, inByoyomi: false, byoyomiMs: 0, periods: 0, flagged: false };
    expect(clockView(c).countdown).toBe(3);
  });

  it("초읽기가 남아 있으면 제한시간 끝은 세지 않는다", () => {
    // 아직 초읽기로 넘어갈 여지가 있어서 급한 상황이 아니다
    const c: SideClock = { mainMs: 3_000, inByoyomi: false, byoyomiMs: 0, periods: 3, flagged: false };
    expect(clockView(c).countdown).toBeNull();
  });
});

// 시계 직접 입력
//
// 프리셋에 없는 조합을 맞추는 자리다. 사람이 아무 숫자나 넣을 수 있어서,
// 말이 안 되는 값이 시계로 흘러가면 첫 수부터 시간패한다.
describe("직접 입력 시계", () => {
  it("범위를 벗어난 값은 잘라낸다", () => {
    const c = clampCustomClock({
      enabled: true, mainSeconds: -60, byoyomiSeconds: 9999, byoyomiCount: 999,
    });
    expect(c.mainSeconds).toBe(0);
    expect(c.byoyomiSeconds).toBeLessThanOrEqual(300);
    expect(c.byoyomiCount).toBeLessThanOrEqual(20);
  });

  it("제한시간도 초읽기도 없으면 시계를 끈다", () => {
    // 이걸 켜 두면 남은 시간 0으로 시작해서 첫 수에 시간패한다
    const c = clampCustomClock({
      enabled: true, mainSeconds: 0, byoyomiSeconds: 0, byoyomiCount: 0,
    });
    expect(c.enabled).toBe(false);
  });

  it("제한시간만 있어도 시계는 돈다", () => {
    const c = clampCustomClock({
      enabled: true, mainSeconds: 600, byoyomiSeconds: 0, byoyomiCount: 0,
    });
    expect(c.enabled).toBe(true);
    expect(c.byoyomiCount).toBe(0);
  });

  it("초읽기 길이가 0이면 회수도 0이다", () => {
    // "0초 3회" 는 3회가 곧바로 날아간다는 뜻이라 회수만 남겨두면 안 된다
    const c = clampCustomClock({
      enabled: true, mainSeconds: 600, byoyomiSeconds: 0, byoyomiCount: 3,
    });
    expect(c.byoyomiCount).toBe(0);
  });

  it("소수점은 반올림한다", () => {
    const c = clampCustomClock({
      enabled: true, mainSeconds: 90.6, byoyomiSeconds: 30.2, byoyomiCount: 3.7,
    });
    expect(c.mainSeconds).toBe(91);
    expect(c.byoyomiSeconds).toBe(30);
    expect(c.byoyomiCount).toBe(4);
  });
});

describe("시계 설명 문구", () => {
  it("제한시간과 초읽기를 함께 읽는다", () => {
    expect(describeClock({
      enabled: true, mainSeconds: 900, byoyomiSeconds: 40, byoyomiCount: 5,
    })).toBe("15분 + 40초 5회");
  });

  it("초읽기가 없으면 제한시간만", () => {
    expect(describeClock({
      enabled: true, mainSeconds: 600, byoyomiSeconds: 0, byoyomiCount: 0,
    })).toBe("10분");
  });

  it("분과 초가 섞이면 둘 다 읽는다", () => {
    expect(describeClock({
      enabled: true, mainSeconds: 90, byoyomiSeconds: 0, byoyomiCount: 0,
    })).toBe("1분 30초");
  });

  it("꺼져 있으면 시계 없음", () => {
    expect(describeClock({
      enabled: false, mainSeconds: 0, byoyomiSeconds: 0, byoyomiCount: 0,
    })).toBe("시계 없음");
  });
});

describe("시계 해석", () => {
  it("프리셋 id 는 프리셋 값을 준다", () => {
    expect(resolveClock("normal", DEFAULT_CUSTOM_CLOCK).mainSeconds).toBe(600);
  });

  it("직접 입력 id 는 넘겨준 값을 잘라서 준다", () => {
    const c = resolveClock(CUSTOM_CLOCK_ID, {
      enabled: true, mainSeconds: 1200, byoyomiSeconds: 999, byoyomiCount: 2,
    });
    expect(c.mainSeconds).toBe(1200);
    expect(c.byoyomiSeconds).toBe(300);
  });
});

describe("되살린 판의 시간패", () => {
  it("시간패한 쪽만 다 쓴 모습이 된다", () => {
    const out = withFlagged(initialClocks(S), "cho");
    expect(out.cho.flagged).toBe(true);
    expect(out.cho.mainMs).toBe(0);
    expect(out.cho.periods).toBe(0);
    // 상대 시계는 건드리지 않는다.
    expect(out.han.flagged).toBe(false);
    expect(out.han.mainMs).toBe(60_000);
  });

  it("시간패가 없으면 그대로 둔다", () => {
    const before = initialClocks(S);
    expect(withFlagged(before, null)).toBe(before);
  });

  it("flaggedSide 가 되살린 시간패를 그대로 읽는다", () => {
    // 시계는 저장하지 않으므로, 되살릴 때 이 둘이 어긋나면 시계는 가득 찬 채
    // "시간패" 배너만 뜬다.
    expect(flaggedSide(withFlagged(initialClocks(S), "han"))).toBe("han");
  });
});
