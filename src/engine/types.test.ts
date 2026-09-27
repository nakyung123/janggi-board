// 엔진에 넘기는 국면
//
// 국면을 '열쇠 문자열' 로 눌러서 React 의존성 비교에 쓴다. 그 열쇠를 가지고
// "엔진이 이 국면에서 이미 뒀는지" 를 기억하는데, 이 기억을 언제 버리느냐가
// 실제로 대국을 멈춰 세운 적이 있다. 그래서 여기 박아둔다.

import { describe, expect, it } from "vitest";
import { forgetIfMoved, positionCommand, positionKey } from "./types";

const START = "rnba1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR w - - 0 1";

describe("국면 열쇠", () => {
  it("수순이 다르면 열쇠도 다르다", () => {
    // 같은 판이라도 어떻게 왔는지에 따라 합법수가 달라진다(장군반복·빅장).
    expect(positionKey({ startFen: START, moves: ["a4a5"] })).not.toBe(
      positionKey({ startFen: START, moves: ["c4c5"] })
    );
  });

  it("수가 없으면 moves 를 붙이지 않는다", () => {
    expect(positionCommand({ startFen: START, moves: [] })).toBe(
      `position fen ${START}`
    );
  });
});

describe("엔진이 이미 둔 국면 기억하기", () => {
  const k1 = positionKey({ startFen: START, moves: ["a4a5"] });
  const k2 = positionKey({ startFen: START, moves: ["a4a5", "a7a6"] });

  it("같은 국면에 머무는 동안에는 기억이 남는다", () => {
    // 착수를 예약해 둔 사이에 effect 가 다시 돌아도 두 번 두지 않게 한다.
    expect(forgetIfMoved(k1, k1)).toBe(k1);
  });

  it("국면을 벗어나면 기억을 버린다", () => {
    expect(forgetIfMoved(k1, k2)).toBeNull();
  });

  it("무르고 같은 수를 다시 두면 엔진이 다시 둔다", () => {
    // 이것이 실제로 판을 멈춰 세웠던 경로다.
    // 엔진이 k1 에서 두고 → k2 로 넘어가고 → 무르면 k1 이 되돌아온다.
    // 그때도 기억이 남아 있으면 엔진은 "이미 뒀다" 고 보고 영영 두지 않았다.
    let remembered: string | null = null;

    remembered = forgetIfMoved(remembered, k1);
    remembered = k1; // 엔진이 k1 에서 뒀다

    remembered = forgetIfMoved(remembered, k2); // 판이 k2 로 넘어간다
    expect(remembered).toBeNull();

    remembered = forgetIfMoved(remembered, k1); // 물러서 k1 으로 돌아온다
    expect(remembered).toBeNull(); // 기억이 없어야 다시 둔다
  });

  it("처음부터 기억이 없으면 그대로 없다", () => {
    expect(forgetIfMoved(null, k1)).toBeNull();
  });
});
