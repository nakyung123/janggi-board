// 복기 판정
//
// 평가치는 언제나 초 기준이라, 한이 둔 수의 손해는 부호가 반대다. 이걸 놓치면
// 한쪽 진영의 악수가 전부 호수로 뒤집혀 나온다. 그리고 엔진이 고른 수를 그대로
// 뒀는데도 "최선수 −0.29" 같은 줄이 뜨던 적이 있어서, 그 두 가지를 묶어둔다.

import { describe, expect, it } from "vitest";
import { START_FEN, parseFen } from "./board";
import type { Board } from "./board";
import type { ReviewInput, ReviewedMove } from "./review";
import {
  clampScore, gradeOf, isSlip, reviewMove, summarize, bestArrowOf, winChance, winPercent,
} from "./review";

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

describe("등급 경계 — 둔 쪽 승률이 떨어진 폭", () => {
  it("최선수면 등급도 최선수", () => {
    expect(gradeOf(0, true)).toBe("best");
    expect(gradeOf(0.5, true)).toBe("best"); // 떨어졌어도 최선수가 우선
  });

  it("5%p 미만은 좋은 수", () => {
    expect(gradeOf(0, false)).toBe("good");
    expect(gradeOf(0.049, false)).toBe("good");
  });

  it("5%p 부터 부정확", () => {
    expect(gradeOf(0.05, false)).toBe("inaccuracy");
    expect(gradeOf(0.099, false)).toBe("inaccuracy");
  });

  it("10%p 부터 실수", () => {
    expect(gradeOf(0.1, false)).toBe("mistake");
    expect(gradeOf(0.199, false)).toBe("mistake");
  });

  it("20%p 부터 악수", () => {
    expect(gradeOf(0.2, false)).toBe("blunder");
    expect(gradeOf(1, false)).toBe("blunder");
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

describe("승률 어림", () => {
  it("팽팽하면 50%", () => {
    expect(winChance(0)).toBe(0.5);
    expect(winPercent(0)).toBe(50);
  });

  it("초와 한의 승률을 더하면 1 이다", () => {
    for (const s of [0.3, 2.3, 7, 15]) {
      expect(winChance(s) + winChance(-s)).toBeCloseTo(1, 10);
    }
  });

  it("기물 하나 차이가 그럴듯한 승률로 옮겨진다", () => {
    // 병·마·차 하나를 뺀 판의 엔진 점수(review.ts 머리의 눈금)
    expect(winPercent(2.3)).toBe(60);
    expect(winPercent(4.54)).toBe(69);
    expect(winPercent(9.42)).toBe(84);
    expect(winPercent(-9.42)).toBe(16);
  });

  it("점수가 오를수록 승률도 오른다", () => {
    expect(winChance(1)).toBeGreaterThan(winChance(0.5));
    expect(winChance(-1)).toBeLessThan(winChance(-0.5));
  });

  it("외통(잘라 낸 끝)은 100% · 0%", () => {
    expect(winPercent(clampScore(0, 3))).toBe(100);
    expect(winPercent(clampScore(0, -3))).toBe(0);
  });

  it("외통이 아니면 100% 로 적지 않는다", () => {
    expect(winPercent(19.9)).toBeLessThan(100);
    expect(winPercent(-19.9)).toBeGreaterThan(0);
  });
});

describe("손해 계산", () => {
  it("초가 둔 수는 평가치가 내려간 만큼이 손해다", () => {
    const r = reviewMove(수({ mover: "cho", scoreBefore: 1.0, scoreAfter: -2.0 }));
    expect(r.loss).toBeCloseTo(3, 5);
    // 초 승률 54.5% → 41.1%
    expect(r.winDrop).toBeCloseTo(0.134, 3);
    expect(r.grade).toBe("mistake");
  });

  it("한이 둔 수는 평가치가 올라간 만큼이 손해다", () => {
    // 초 기준 -1.0 에서 +2.0 으로 올라갔다 = 한이 3 을 잃었다(한 승률 54.5% → 41.1%)
    const r = reviewMove(수({ mover: "han", scoreBefore: -1.0, scoreAfter: 2.0 }));
    expect(r.loss).toBeCloseTo(3, 5);
    expect(r.winDrop).toBeCloseTo(0.134, 3);
    expect(r.grade).toBe("mistake");
  });

  it("같은 3점 손해라도 이미 크게 이기는 판에서는 가볍다", () => {
    // 팽팽한 판의 3점은 승률 13%p(실수), 차 하나쯤 앞선 판의 3점은 6%p(부정확)
    const 팽팽 = reviewMove(수({ scoreBefore: 1.5, scoreAfter: -1.5 }));
    const 앞섬 = reviewMove(수({ scoreBefore: 12, scoreAfter: 9 }));
    expect(팽팽.grade).toBe("mistake");
    expect(앞섬.grade).toBe("inaccuracy");
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
    expect(r.winDrop).toBe(0);
    expect(r.grade).toBe("best");
  });

  it("악수에는 AI의 수와 그 뒤에 벌어지는 일이 함께 적힌다", () => {
    const r = reviewMove(수({ scoreBefore: 1, scoreAfter: -4 }));
    expect(r.grade).toBe("blunder");
    expect(r.note.best).toBe("73졸63");
    // 잡히는 기물이 없으면 자리가 나빠진다고, 손해가 기물로 치면 얼마쯤인지 적는다
    expect(r.note.after).toBe("당장 잡히는 기물은 없지만 자리가 나빠집니다. 마나 포 한 짝쯤 손해입니다.");
    // 손해를 봤다면서 AI도 같은 수를 골랐다고 하면 안 된다
    expect(r.note.verdict).toBeNull();
  });

  it("최선수를 뒀으면 한마디만 한다", () => {
    const r = reviewMove(수({ played: "c4c5", best: "c4c5" }));
    expect(r.note).toEqual({
      verdict: "AI도 같은 수를 골랐습니다.", best: null, bestDoes: null, after: null,
    });
  });

  it("상대가 무엇을 가져가는지 조사까지 맞게 적는다", () => {
    // 초의 졸이 c6 까지 나가 한의 병(c7) 바로 앞에 선 판. 한이 c7c6 으로 졸을 잡는다.
    // "43병53로" 로 나가던 자리 - 3(삼) 뒤에는 '으로' 다.
    const 앞선판: Board = { ...before, c6: before.c4 };
    delete 앞선판.c4;
    const r = reviewMove(
      수({ played: "c4c6", after: 앞선판, replyPv: ["c7c6"], scoreBefore: 0, scoreAfter: -2 })
    );
    expect(r.note.after).toBe("한이 43병53으로 졸을 가져갑니다.");
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
      scoreBefore: 0, scoreAfter: 0, loss: 0, grade: "good",
      note: { verdict: null, best: null, bestDoes: null, after: null },
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

  it("부정확 이상이면 아쉬운 수로 짚는다", () => {
    expect(isSlip(만든수({ loss: 0.4, grade: "inaccuracy" }))).toBe(true);
    expect(isSlip(만든수({ loss: 2, grade: "mistake" }))).toBe(true);
    expect(isSlip(만든수({ loss: 5, grade: "blunder" }))).toBe(true);
  });

  it("등급이 '좋은 수' 면 손해가 커도 짚지 않는다", () => {
    // 급수 눈높이를 낮추면 경계가 늘어난다. 그때 손해 숫자를 절대 기준으로 다시 재면
    // 등급은 "좋은 수" 라면서 같은 수를 아쉬운 수로 짚게 된다.
    // 12급과 둔 4수짜리 판에서 실제로 그랬다.
    expect(isSlip(만든수({ loss: 0.59, grade: "good" }))).toBe(false);
    expect(isSlip(만든수({ loss: 0, grade: "best" }))).toBe(false);
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
