import { describe, expect, it } from "vitest";
import type { Side } from "./pieces";
import { START_FEN, parseFen } from "./board";
import { describeMove, hangulNotation, moveRows, rowNumbers } from "./notation";

describe("기보 표기", () => {
  const start = parseFen(START_FEN).board;

  it("기물 이름을 한글로 적는다 - 한자는 앱 글꼴에 없어 기기마다 다르게 그려진다", () => {
    expect(describeMove("c4c5", start).short).toBe("73졸63");
    expect(describeMove("c7c6", start).short).toBe("43병53");
    expect(describeMove("b10c8", start).short).toBe("12마33");
    expect(describeMove("e2e3", start).short).toBe("95궁85");
    expect(describeMove("e2e2", start).short).toBe("한수쉼");
  });

  it("한자로 적힌 예전 표기를 한글로 바꾼다 - 궁은 진영과 상관없이 '궁'", () => {
    expect(hangulNotation("73卒63")).toBe("73졸63");
    expect(hangulNotation("43兵53")).toBe("43병53");
    expect(hangulNotation("95楚94")).toBe("95궁94");
    expect(hangulNotation("25漢15")).toBe("25궁15");
    expect(hangulNotation("최선은 12馬33이었습니다.")).toBe("최선은 12마33이었습니다.");
    expect(hangulNotation("73졸63")).toBe("73졸63");
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
