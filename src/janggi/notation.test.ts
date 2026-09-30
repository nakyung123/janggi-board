import { describe, expect, it } from "vitest";
import { START_FEN, parseFen } from "./board";
import { describeMove, hangulNotation } from "./notation";

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
