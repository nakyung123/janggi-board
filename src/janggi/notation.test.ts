// 이길 확률
//
// 평가 점수를 % 로 바꾸는 곡선이다. 계수는 실측이 아니라 어림값이라 "63% 가
// 맞느냐" 는 여기서 따질 수 없다. 대신 어림값이어도 반드시 지켜야 할 성질이
// 있고, 그게 틀리면 화면에 앞뒤가 안 맞는 숫자가 나간다.
//
//   - 점수가 오르면 확률도 오른다 (뒤집히면 안 된다)
//   - 0점은 50%
//   - 초와 한의 확률을 더하면 100%
//   - 외통은 0% 또는 100%

import { describe, expect, it } from "vitest";
import type { Side } from "./pieces";
import {
  formatScore,
  formatWinProbability,
  moveRows,
  rowNumbers,
  winProbability,
} from "./notation";

describe("이길 확률", () => {
  it("팽팽하면 반반이다", () => {
    expect(winProbability(0, null)).toBeCloseTo(0.5, 10);
  });

  it("점수가 오르면 확률도 오른다", () => {
    const 점수 = [-30, -13, -5, -2, 0, 2, 5, 13, 30];
    const 확률 = 점수.map((s) => winProbability(s, null));
    for (let i = 1; i < 확률.length; i++) {
      expect(확률[i]).toBeGreaterThan(확률[i - 1]);
    }
  });

  it("초가 유리하면 50% 를 넘고 불리하면 밑돈다", () => {
    expect(winProbability(5, null)).toBeGreaterThan(0.5);
    expect(winProbability(-5, null)).toBeLessThan(0.5);
  });

  it("양쪽 확률을 더하면 1이다", () => {
    for (const s of [-13, -1, 0, 1, 13]) {
      const p = winProbability(s, null);
      expect(p + (1 - p)).toBeCloseTo(1, 10);
    }
  });

  it("0 과 1 을 벗어나지 않는다", () => {
    for (const s of [-1000, -20, 0, 20, 1000]) {
      const p = winProbability(s, null);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it("외통은 확률이 아니라 결과다", () => {
    expect(winProbability(0, 3)).toBe(1); // 초가 외통을 건다
    expect(winProbability(0, -3)).toBe(0); // 한이 외통을 건다
    expect(winProbability(0, 0)).toBe(0); // 이미 외통을 맞았다
  });

  it("차 하나를 그냥 앞서면 거의 이긴 판이다", () => {
    // 계수를 고른 근거다. 아래 값은 엔진에게 직접 물어서 잰 것이다.
    //   시작 국면에서 한의 차 하나를 뺀 판 → 엔진 평가치 +9.60
    // 이 자리가 85% 근처여야 한다. 더 낮으면 이긴 판을 팽팽하다고 하고,
    // 더 높으면 아직 둘 것이 남은 판을 끝났다고 말하게 된다.
    const 차하나 = winProbability(9.6, null);
    expect(차하나).toBeGreaterThan(0.8);
    expect(차하나).toBeLessThan(0.9);

    // 졸 하나(엔진 평가치로 약 1.7)는 약간 유리한 정도여야 한다
    const 졸하나 = winProbability(1.7, null);
    expect(졸하나).toBeGreaterThan(0.53);
    expect(졸하나).toBeLessThan(0.65);
  });
});

describe("확률 표기", () => {
  it("퍼센트로 적는다", () => {
    expect(formatWinProbability(0, null)).toBe("50%");
  });

  it("한 시점은 뒤집힌다", () => {
    // 초가 이길 확률이 62% 면 한은 38% 다
    const cho = formatWinProbability(3, null, "cho");
    const han = formatWinProbability(3, null, "han");
    const n = (s: string) => Number(s.replace("%", ""));
    expect(n(cho) + n(han)).toBe(100);
    expect(n(cho)).toBeGreaterThan(n(han));
  });

  it("점수 표기는 그대로다", () => {
    // 확률을 붙이면서 기존 표기가 바뀌면 기보와 분석이 어긋난다
    expect(formatScore(0, null)).toBe("0.00");
    expect(formatScore(1.5, null)).toBe("+1.50");
    expect(formatScore(0, 3)).toBe("+M3");
    expect(formatScore(0, 0)).toBe("외통");
  });
});

describe("기보 줄 나누기", () => {
  // movers[0] 은 시작 국면이라 항상 null 이다.
  const 초한 = (n: number): (Side | null)[] => {
    const out: (Side | null)[] = [null];
    for (let i = 0; i < n; i += 1) out.push(i % 2 === 0 ? "cho" : "han");
    return out;
  };

  it("초·한 두 수가 한 줄이 된다", () => {
    expect(moveRows(초한(4))).toEqual([
      { no: 1, cho: 1, han: 2 },
      { no: 2, cho: 3, han: 4 },
    ]);
  });

  it("초가 마지막에 혼자 남으면 한 자리는 빈다", () => {
    expect(moveRows(초한(3))).toEqual([
      { no: 1, cho: 1, han: 2 },
      { no: 2, cho: 3, han: null },
    ]);
  });

  it("한이 먼저 두는 국면도 나눈다", () => {
    // 편집해서 만든 판은 한부터 둘 수 있다. 첫 줄의 초 자리는 비워둔다.
    const movers: (Side | null)[] = [null, "han", "cho", "han"];
    expect(moveRows(movers)).toEqual([
      { no: 1, cho: null, han: 1 },
      { no: 2, cho: 2, han: 3 },
    ]);
  });

  it("복기가 기보와 같은 번호로 말한다", () => {
    // 세 번째 수(초의 두 번째 수)는 기보에서 2번 줄이다. 예전에는 복기가
    // 이것을 "3수" 라고 불러서, 기보 3번 줄을 찾으면 다른 수가 있었다.
    const no = rowNumbers(초한(4));
    expect(no.get(1)).toBe(1);
    expect(no.get(2)).toBe(1);
    expect(no.get(3)).toBe(2);
    expect(no.get(4)).toBe(2);
  });
});
