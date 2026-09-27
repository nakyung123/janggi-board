// 급수 사다리
//
// 27칸은 자가대국 1,120판으로 간격을 잰 것이다(scripts/ladder-selfplay.mjs).
// 표를 손으로 고치다 순서가 엇갈리면 "위 급수가 더 약한" 사다리가 되는데,
// 화면만 봐서는 알 수가 없다. 그래서 표의 모양을 여기서 붙잡아 둔다.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEVEL_ID,
  DEFAULT_REVIEW_DEPTH_ID,
  LEVELS,
  MIN_THINK_MS,
  gradeToleranceOf,
  levelById,
  levelWaitLabel,
  limitsOf,
  REVIEW_DEPTHS,
  reviewDepthById,
  thinkSeconds,
} from "./levels";

describe("급수 표", () => {
  it("18급~1급 + 1단~9단, 모두 27칸", () => {
    expect(LEVELS).toHaveLength(27);
    expect(LEVELS.map((l) => l.name)).toEqual([
      ...Array.from({ length: 18 }, (_, k) => `${18 - k}급`),
      ...Array.from({ length: 9 }, (_, k) => `${k + 1}단`),
    ]);
  });

  it("id 가 겹치지 않는다", () => {
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
  });

  it("설명이 비어 있지 않다", () => {
    for (const l of LEVELS) expect(l.desc.length).toBeGreaterThan(0);
  });
});

describe("사다리가 단조로운가", () => {
  it("노드는 칸마다 반드시 늘어난다", () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].nodes).toBeGreaterThan(LEVELS[i - 1].nodes);
    }
  });

  it("Skill Level 은 줄어들지 않는다", () => {
    // 같은 값이 이어지는 건 괜찮다. 그때는 노드가 차이를 만든다.
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].skill).toBeGreaterThanOrEqual(LEVELS[i - 1].skill);
    }
  });

  it("양 끝은 엔진 손잡이의 양 극단이다", () => {
    expect(LEVELS[0].skill).toBe(-20);
    expect(LEVELS[LEVELS.length - 1].skill).toBe(20);
  });

  it("Skill Level 은 엔진이 받는 범위 안에 있다", () => {
    for (const l of LEVELS) {
      expect(l.skill).toBeGreaterThanOrEqual(-20);
      expect(l.skill).toBeLessThanOrEqual(20);
    }
  });

  it("급 구간은 한 수 15만 노드를 넘지 않는다", () => {
    // 사람이 이길 수 있는 범위를 급에 몰아준 것이 배치의 전제다
    const 급 = LEVELS.filter((l) => l.name.endsWith("급"));
    expect(급).toHaveLength(18);
    for (const l of 급) expect(l.nodes).toBeLessThanOrEqual(150_000);
  });
});

describe("급수 찾기", () => {
  it("id 로 찾는다", () => {
    expect(levelById("k18").name).toBe("18급");
    expect(levelById("d9").name).toBe("9단");
  });

  it("모르는 id 는 기본 급수로 떨어진다", () => {
    expect(levelById("없는-급수").id).toBe(DEFAULT_LEVEL_ID);
  });

  it("기본 급수가 표 안에 있다", () => {
    expect(LEVELS.some((l) => l.id === DEFAULT_LEVEL_ID)).toBe(true);
  });
});

describe("탐색 한계", () => {
  it("시간이 아니라 노드로 자른다", () => {
    // 시간으로 자르면 빠른 PC 의 3급이 느린 PC 에서는 5급이 된다
    const limits = limitsOf(levelById("k6"));
    expect(limits.nodes).toBe(levelById("k6").nodes);
    expect(limits.movetimeMs).toBeUndefined();
  });

  it("생각 시간 어림값은 최소 생각 시간 아래로 내려가지 않는다", () => {
    expect(thinkSeconds(LEVELS[0])).toBeGreaterThanOrEqual(MIN_THINK_MS / 1000);
  });

  it("센 급수일수록 오래 걸린다", () => {
    expect(thinkSeconds(levelById("d9"))).toBeGreaterThan(thinkSeconds(levelById("k1")));
  });
});

describe("복기 깊이", () => {
  it("깊을수록 노드가 많다", () => {
    for (let i = 1; i < REVIEW_DEPTHS.length; i++) {
      expect(REVIEW_DEPTHS[i].nodes).toBeGreaterThan(REVIEW_DEPTHS[i - 1].nodes);
    }
  });

  it("모르는 id 는 기본 깊이로 떨어진다", () => {
    expect(reviewDepthById("없는-깊이").id).toBe(DEFAULT_REVIEW_DEPTH_ID);
  });
});

// 복기 등급 눈높이
//
// 복기는 언제나 전력으로 평가한다. 그래서 12급과 두면서 평범한 첫 수를 뒀는데
// 곧바로 "부정확" 이 붙고 '가장 아쉬운 수' 로 뽑혔다. 사실이긴 하지만 12급과
// 두는 사람에게 프로 잣대를 들이대는 셈이다. 급수에 맞춰 경계를 늘린다.
describe("등급 눈높이", () => {
  it("낮은 급수일수록 너그럽다", () => {
    const 첫 = gradeToleranceOf(LEVELS[0]);
    const 끝 = gradeToleranceOf(LEVELS[LEVELS.length - 1]);
    expect(첫).toBeGreaterThan(끝);
  });

  it("9단은 절대 기준 그대로다", () => {
    expect(gradeToleranceOf(LEVELS[LEVELS.length - 1])).toBeCloseTo(1, 5);
  });

  it("18급은 세 배까지 너그럽다", () => {
    expect(gradeToleranceOf(LEVELS[0])).toBeCloseTo(3, 5);
  });

  it("급수가 오를수록 단조롭게 엄해진다", () => {
    // 중간에 뒤집히면 "한 급 올렸더니 오히려 후해졌다" 가 된다
    for (let i = 1; i < LEVELS.length; i++) {
      expect(gradeToleranceOf(LEVELS[i])).toBeLessThan(gradeToleranceOf(LEVELS[i - 1]));
    }
  });

  it("1 아래로는 내려가지 않는다", () => {
    // 절대 기준보다 엄해지면 그건 눈높이가 아니라 다른 기준이다
    for (const l of LEVELS) expect(gradeToleranceOf(l)).toBeGreaterThanOrEqual(1);
  });
});

describe("급수 옆에 붙는 기다림", () => {
  it("기다릴 일이 없는 급수에는 아무것도 붙지 않는다", () => {
    // 27개 중 19개가 1초를 넘지 않아 전부 "1초 안" 으로 똑같이 적혔었다.
    expect(levelWaitLabel(levelById("k18"))).toBe("");
    expect(levelWaitLabel(levelById("k1"))).toBe("");
    expect(levelWaitLabel(levelById("d1"))).toBe("");
  });

  it("정말로 기다리는 급수에만 붙는다", () => {
    expect(levelWaitLabel(levelById("d2"))).not.toBe("");
    expect(levelWaitLabel(levelById("d9"))).toContain("20초");
  });

  it("같은 글자가 여러 급수에 겹쳐 붙지 않는다", () => {
    // 겹치면 읽을 이유가 없어진다. 그게 원래 문제였다.
    const labels = LEVELS.map(levelWaitLabel).filter((s) => s !== "");
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("사다리를 올라갈수록 기다림이 길어진다", () => {
    const secs = LEVELS.map(thinkSeconds);
    for (let i = 1; i < secs.length; i += 1) {
      expect(secs[i]).toBeGreaterThanOrEqual(secs[i - 1]);
    }
  });
});
