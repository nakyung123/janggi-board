// 복기 판정
//
// 평가치는 언제나 초 기준이라, 한이 둔 수의 손해는 부호가 반대다. 이걸 놓치면
// 한쪽 진영의 악수가 전부 호수로 뒤집혀 나온다. 그리고 엔진이 고른 수를 그대로
// 뒀는데도 "최선수 −0.29" 같은 줄이 뜨던 적이 있어서, 그 두 가지를 묶어둔다.

import { describe, expect, it } from "vitest";
import { START_FEN, parseFen } from "./board";
import type { Board } from "./board";
import type { ReviewInput, ReviewedMove } from "./review";
import { clampScore, gradeOf, reviewMove, summarize, bestArrowOf } from "./review";

const before: Board = parseFen(START_FEN).board;

/** 졸 하나가 한 칸 나간 판 */
const after: Board = (() => {
  const b = { ...before };
  b.a5 = b.a4;
  delete b.a4;
  return b;
})();

const 수 = (over: Partial<ReviewInput> = {}): ReviewInput => ({
  index: 1,
  mover: "cho",
  before,
  after,
  played: "a4a5",
  best: "c4c5",
  bestPv: ["c4c5"],
  replyPv: [],
  scoreBefore: 0,
  scoreAfter: 0,
  bestGivesCheck: false,
  ...over,
});

describe("등급 경계", () => {
  it("최선수면 등급도 최선수", () => {
    expect(gradeOf(0, true)).toBe("best");
    expect(gradeOf(5, true)).toBe("best"); // 손해가 있어도 최선수가 우선
  });

  it("0.3 미만은 좋은 수", () => {
    expect(gradeOf(0, false)).toBe("good");
    expect(gradeOf(0.29, false)).toBe("good");
  });

  it("0.3 부터 부정확", () => {
    expect(gradeOf(0.3, false)).toBe("inaccuracy");
    expect(gradeOf(0.99, false)).toBe("inaccuracy");
  });

  it("1.0 부터 실수", () => {
    expect(gradeOf(1.0, false)).toBe("mistake");
    expect(gradeOf(2.99, false)).toBe("mistake");
  });

  it("3.0 부터 악수", () => {
    expect(gradeOf(3.0, false)).toBe("blunder");
    expect(gradeOf(30, false)).toBe("blunder");
  });
});

describe("평가치 자르기", () => {
  it("외통은 양 끝값으로 눌러 담는다", () => {
    expect(clampScore(0, 3)).toBe(20);
    expect(clampScore(0, -3)).toBe(-20);
    // 이기는 외통에서 더 빠른 외통으로 바뀐 것은 손해가 아니다
    expect(clampScore(0, 5) - clampScore(0, 1)).toBe(0);
  });

  it("보통 점수는 그대로 두되 한계는 있다", () => {
    expect(clampScore(1.5, null)).toBe(1.5);
    expect(clampScore(999, null)).toBe(20);
    expect(clampScore(-999, null)).toBe(-20);
  });
});

describe("손해 계산", () => {
  it("초가 둔 수는 평가치가 내려간 만큼이 손해다", () => {
    const r = reviewMove(수({ mover: "cho", scoreBefore: 1.0, scoreAfter: -0.5 }));
    expect(r.loss).toBeCloseTo(1.5, 5);
    expect(r.grade).toBe("mistake");
  });

  it("한이 둔 수는 평가치가 올라간 만큼이 손해다", () => {
    // 초 기준 -1.0 에서 +0.5 로 올라갔다 = 한이 1.5 를 잃었다
    const r = reviewMove(수({ mover: "han", scoreBefore: -1.0, scoreAfter: 0.5 }));
    expect(r.loss).toBeCloseTo(1.5, 5);
    expect(r.grade).toBe("mistake");
  });

  it("형세를 좋게 만든 수의 손해는 0이다", () => {
    const r = reviewMove(수({ mover: "cho", scoreBefore: 0, scoreAfter: 2 }));
    expect(r.loss).toBe(0);
    expect(r.grade).toBe("good");
  });

  it("엔진이 고른 수를 그대로 뒀으면 손해가 0이다", () => {
    // 같은 수인데도 두 국면을 따로 탐색하느라 잔값이 남는다. 그건 손해가 아니다.
    const r = reviewMove(
      수({ played: "a4a5", best: "a4a5", scoreBefore: 0.5, scoreAfter: 0.21 })
    );
    expect(r.loss).toBe(0);
    expect(r.grade).toBe("best");
  });

  it("악수에는 더 나은 수와 손해가 함께 적힌다", () => {
    const r = reviewMove(수({ scoreBefore: 1, scoreAfter: -4 }));
    expect(r.grade).toBe("blunder");
    expect(r.comment).toContain("최선은");
    expect(r.comment).toContain("손해");
    // 손해를 봤다면서 엔진도 같은 수를 골랐다고 하면 안 된다
    expect(r.comment).not.toContain("엔진도 같은 수");
  });

  it("설명의 조사가 숫자 뒤에서도 맞는다", () => {
    // "최선은 63 였습니다" 로 나가던 자리
    const r = reviewMove(수({ best: "c4c5", scoreBefore: 1, scoreAfter: 0.2 }));
    expect(r.comment).not.toMatch(/[0-9] ?였습니다/);
  });

  it("기보 표기를 함께 낸다", () => {
    const r = reviewMove(수());
    expect(r.playedNotation).not.toBe("");
    expect(r.bestNotation).not.toBe("");
  });
});

describe("성적표", () => {
  const 만든수 = (over: Partial<ReviewedMove>): ReviewedMove =>
    ({
      index: 1, mover: "cho", played: "a4a5", playedNotation: "71졸61",
      best: null, bestNotation: null, bestLine: [],
      scoreBefore: 0, scoreAfter: 0, loss: 0, grade: "good", comment: "",
      ...over,
    }) as ReviewedMove;

  it("자기 진영의 수만 센다", () => {
    const s = summarize(
      [만든수({ mover: "cho" }), 만든수({ mover: "han" }), 만든수({ mover: "cho" })],
      "cho"
    );
    expect(s.moves).toBe(2);
  });

  it("등급별로 센다", () => {
    const s = summarize(
      [
        만든수({ grade: "best" }),
        만든수({ grade: "blunder", loss: 5 }),
        만든수({ grade: "blunder", loss: 4 }),
      ],
      "cho"
    );
    expect(s.counts.best).toBe(1);
    expect(s.counts.blunder).toBe(2);
  });

  it("평균 손해를 낸다", () => {
    const s = summarize([만든수({ loss: 1 }), 만든수({ loss: 2 })], "cho");
    expect(s.avgLoss).toBeCloseTo(1.5, 5);
  });

  it("실수가 없는 기보에서는 '가장 아쉬운 수' 를 짚지 않는다", () => {
    // 0.1 짜리 수를 가장 아쉬운 수라고 내놓으면 복기가 우스워진다
    const s = summarize(
      [만든수({ loss: 0.1, grade: "good" }), 만든수({ loss: 0.05, grade: "good" })],
      "cho"
    );
    expect(s.worst).toBeNull();
  });

  it("부정확 이상이면 짚는다", () => {
    const s = summarize(
      [만든수({ loss: 0.1, grade: "good" }), 만든수({ loss: 0.4, grade: "inaccuracy", index: 7 })],
      "cho"
    );
    expect(s.worst?.index).toBe(7);
  });

  it("등급이 '좋은 수' 면 손해가 커도 짚지 않는다", () => {
    // 급수 눈높이를 낮추면 경계가 늘어난다. 그때 여기만 절대 기준으로 재면
    // 등급은 "좋은 수" 라면서 같은 수를 "가장 아쉬운 수" 로 짚게 된다.
    // 12급과 둔 4수짜리 판에서 실제로 그랬다.
    const s = summarize([만든수({ loss: 0.59, grade: "good" })], "cho");
    expect(s.worst).toBeNull();
  });

  it("최선수는 아무리 많아도 짚지 않는다", () => {
    const s = summarize([만든수({ loss: 0, grade: "best" })], "cho");
    expect(s.worst).toBeNull();
  });

  it("수가 없으면 평균도 0", () => {
    expect(summarize([], "cho").avgLoss).toBe(0);
  });

  // 일치율 — 한국장기가 돈 받고 파는 값이다. 0으로 나누는 자리가 있어서
  // 빈 기보에서 NaN 이 새어 나가지 않는지가 핵심이다.
  it("최선수를 둔 비율이 일치율이다", () => {
    const s = summarize(
      [만든수({ grade: "best" }), 만든수({ grade: "best" }), 만든수({ grade: "mistake" }), 만든수({ grade: "good" })],
      "cho"
    );
    expect(s.accuracy).toBeCloseTo(0.5, 5);
  });

  it("전부 최선수면 100%", () => {
    const s = summarize([만든수({ grade: "best" }), 만든수({ grade: "best" })], "cho");
    expect(s.accuracy).toBe(1);
  });

  it("수가 없으면 일치율은 0 이다 (NaN 이 아니다)", () => {
    const s = summarize([], "cho");
    expect(s.accuracy).toBe(0);
    expect(Number.isNaN(s.accuracy)).toBe(false);
  });

  it("상대가 둔 수는 내 일치율에 안 들어간다", () => {
    const s = summarize(
      [만든수({ mover: "cho", grade: "best" }), 만든수({ mover: "han", grade: "blunder" })],
      "cho"
    );
    expect(s.accuracy).toBe(1);
  });
});

describe("복기 화살표", () => {
  it("최선수가 없으면 화살표도 없다", () => {
    expect(bestArrowOf(null)).toBeNull();
  });

  it("한수쉼에는 화살표를 그리지 않는다", () => {
    const r = { best: "e2e2" } as ReviewedMove;
    expect(bestArrowOf(r)).toBeNull();
  });

  it("보통 수는 출발과 도착을 준다", () => {
    const r = { best: "a4a5" } as ReviewedMove;
    expect(bestArrowOf(r)).toEqual({ from: "a4", to: "a5" });
  });
});
