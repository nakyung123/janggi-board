// 좌표계와 FEN
//
// 엔진과 주고받는 유일한 언어가 FEN 과 좌표다. 여기가 어긋나면 판과 엔진이
// 서로 다른 국면을 보게 되는데, 화면상으로는 멀쩡해 보여서 알아차리기 어렵다.

import { describe, expect, it } from "vitest";
import {
  FILES,
  RANKS,
  START_FEN,
  fileIdxOf,
  palaceOf,
  parseFen,
  rankOf,
  sq,
  toFen,
  validate,
} from "./board";

describe("좌표", () => {
  it("파일 번호와 단수로 칸 이름을 만든다", () => {
    expect(sq(0, 1)).toBe("a1");
    expect(sq(8, 10)).toBe("i10");
    expect(sq(4, 5)).toBe("e5");
  });

  it("칸 이름에서 되돌린다", () => {
    expect(fileIdxOf("a1")).toBe(0);
    expect(fileIdxOf("i10")).toBe(8);
    expect(rankOf("a1")).toBe(1);
    // 10단은 두 글자다. 여기서 한 글자만 읽으면 1단이 된다.
    expect(rankOf("i10")).toBe(10);
  });

  it("모든 칸이 왕복해도 그대로다", () => {
    for (let f = 0; f < FILES; f++) {
      for (let r = 1; r <= RANKS; r++) {
        const s = sq(f, r);
        expect(sq(fileIdxOf(s), rankOf(s))).toBe(s);
      }
    }
  });
});

describe("궁성", () => {
  it("초의 궁성은 d~f 파일의 1~3단", () => {
    expect(palaceOf("e2")).toBe("cho");
    expect(palaceOf("d1")).toBe("cho");
    expect(palaceOf("f3")).toBe("cho");
  });

  it("한의 궁성은 d~f 파일의 8~10단", () => {
    expect(palaceOf("e9")).toBe("han");
    expect(palaceOf("d10")).toBe("han");
    expect(palaceOf("f8")).toBe("han");
  });

  it("궁성 밖은 null", () => {
    expect(palaceOf("e5")).toBeNull(); // 가운데
    expect(palaceOf("c2")).toBeNull(); // 파일이 벗어남
    expect(palaceOf("e4")).toBeNull(); // 단이 벗어남
  });
});

describe("FEN", () => {
  it("시작 국면을 읽는다", () => {
    const pos = parseFen(START_FEN);
    expect(pos.turn).toBe("cho"); // w = 초가 선수
    expect(Object.keys(pos.board)).toHaveLength(32);
    expect(pos.board.e2).toBe("K"); // 초 궁
    expect(pos.board.e9).toBe("k"); // 한 궁
    expect(pos.board.a1).toBe("R");
    expect(pos.board.a10).toBe("r");
  });

  it("읽고 다시 쓰면 원래 FEN 이 나온다", () => {
    expect(toFen(parseFen(START_FEN))).toBe(START_FEN);
  });

  it("빈 칸 개수를 제대로 센다", () => {
    const fen = "4k4/9/9/9/9/9/9/9/4K4/9 w - - 0 1";
    expect(toFen(parseFen(fen))).toBe(fen);
  });

  it("차례를 옮겨 적는다", () => {
    const han = parseFen(START_FEN.replace(" w ", " b "));
    expect(han.turn).toBe("han");
    expect(toFen(han)).toContain(" b ");
  });
});

describe("판 검증", () => {
  const 판 = (fen: string) => parseFen(fen);

  it("시작 국면은 문제가 없다", () => {
    expect(validate(판(START_FEN))).toEqual([]);
  });

  it("궁이 없으면 짚어준다", () => {
    const problems = validate(판("4k4/9/9/9/9/9/9/9/9/9 w - - 0 1"));
    expect(problems.some((p) => p.includes("초의 궁이 없습니다"))).toBe(true);
  });

  it("궁이 둘이면 짚어준다", () => {
    const problems = validate(판("4k4/9/9/9/9/9/9/9/3KK4/9 w - - 0 1"));
    expect(problems.some((p) => p.includes("초의 궁이 2개입니다"))).toBe(true);
  });

  it("궁성 밖의 궁은 짚어준다", () => {
    // 초 궁을 e5(한가운데)에 둔 판
    const problems = validate(판("4k4/9/9/9/9/4K4/9/9/9/9 w - - 0 1"));
    expect(problems.some((p) => p.includes("궁성 안에만"))).toBe(true);
  });

  it("궁성 밖의 사도 짚어준다", () => {
    const problems = validate(판("4k4/9/9/9/4A4/9/9/9/4K4/9 w - - 0 1"));
    expect(problems.some((p) => p.includes("사는") && p.includes("궁성"))).toBe(true);
  });

  it("차·포·마는 아무 데나 놓아도 된다", () => {
    expect(validate(판("4k4/9/9/9/4R4/4C4/4N4/9/4K4/9 w - - 0 1"))).toEqual([]);
  });
});
