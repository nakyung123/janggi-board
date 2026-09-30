import { describe, expect, it } from "vitest";
import type { Side } from "./pieces";
import { moveRows, rowNumbers } from "./notation";

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
    // 불러온 판은 한부터 둘 수 있다. 첫 줄의 초 자리는 비워둔다.
    const movers: (Side | null)[] = [null, "han", "cho", "han"];
    expect(moveRows(movers)).toEqual([
      { no: 1, cho: null, han: 1 },
      { no: 2, cho: 2, han: 3 },
    ]);
  });

  it("복기가 기보와 같은 번호로 말한다", () => {
    // 세 번째 수(초의 두 번째 수)는 기보에서 2번 줄이다. 복기가 이것을 "3수" 라고
    // 부르면 기보 3번 줄을 찾았을 때 다른 수가 있다.
    const no = rowNumbers(초한(4));
    expect(no.get(1)).toBe(1);
    expect(no.get(2)).toBe(1);
    expect(no.get(3)).toBe(2);
    expect(no.get(4)).toBe(2);
  });
});
