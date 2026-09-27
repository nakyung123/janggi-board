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
  undoTarget,
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

// 무르기가 돌아갈 자리
//
// 한 칸만 되감으면 엔진 차례에 멈춘다. 기보 끝이 아니면 엔진은 두지 않으므로
// 판이 조용히 죽는다 — 내 기물을 눌러도 아무 일이 없고 안내도 없다. 실제로
// 그래서 고장인 줄 알았다. 여기가 틀리면 그 증상이 그대로 돌아온다.
describe("무르기", () => {
  /** 한 수씩 번갈아 둔 기보를 흉내낸다. fens[i] 는 i수를 둔 뒤의 국면. */
  const 기보 = (수: number): string[] => {
    const out: string[] = [];
    for (let i = 0; i <= 수; i++) {
      const turn = i % 2 === 0 ? "w" : "b";
      out.push(`rnba1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR ${turn} - - 0 1`);
    }
    return out;
  };

  it("초를 잡았으면 초 차례까지 되감는다", () => {
    // 2수(초·한)를 둔 뒤 → 시작으로. 한 칸만 가면 한 차례라 아무것도 못 한다.
    expect(undoTarget(기보(2), 2, "cho")).toBe(0);
  });

  it("내 수만 둔 상태에서도 내 차례로 온다", () => {
    expect(undoTarget(기보(1), 1, "cho")).toBe(0);
  });

  it("긴 기보에서도 두 수만 되감는다", () => {
    // 6수까지 뒀으면 4수 자리(다시 초 차례)로
    expect(undoTarget(기보(6), 6, "cho")).toBe(4);
  });

  it("한을 잡았으면 한 차례까지 되감는다", () => {
    // 3수를 둔 뒤(초·한·초) → 한 차례인 1수 자리로
    expect(undoTarget(기보(3), 3, "han")).toBe(1);
  });

  it("구경 중이면 한 칸만 간다", () => {
    expect(undoTarget(기보(6), 6, null)).toBe(5);
  });

  it("시작 국면보다 더 뒤로 가지 않는다", () => {
    expect(undoTarget(기보(4), 0, "cho")).toBe(0);
    expect(undoTarget(기보(4), 0, null)).toBe(0);
  });

  it("한을 잡고 첫 수 앞이면 시작에서 멈춘다", () => {
    // 시작 국면은 초 차례라 한 차례가 영영 안 나온다. 0 에서 멈춰야 한다.
    expect(undoTarget(기보(1), 1, "han")).toBe(0);
  });

  it("돌아간 자리는 정말 내 차례다", () => {
    // 이게 이 함수의 존재 이유다
    for (const c of [1, 2, 3, 4, 5, 6]) {
      const i = undoTarget(기보(6), c, "cho");
      if (i > 0) expect(parseFen(기보(6)[i]).turn).toBe("cho");
    }
  });
});
