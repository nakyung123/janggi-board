import { describe, expect, it } from "vitest";
import { START_FEN, parseFen } from "./board";
import { describeMove, hangulNotation, isMoveString } from "./notation";

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

describe("엔진 좌표로 적힌 수인지", () => {
  it("멀쩡한 수는 받는다", () => {
    expect(isMoveString("a4a5")).toBe(true);
    expect(isMoveString("i10h10")).toBe(true);
    expect(isMoveString("e2e2")).toBe(true); // 한수쉼(제자리)
  });

  it("뒤에 뭔가 더 붙어 있으면 받지 않는다", () => {
    // splitMove 는 앞부분만 보지만, 밖에서 들어온 값을 거를 때는 전체가 맞아야 한다.
    expect(isMoveString("a4a5" + String.fromCharCode(10) + "go infinite")).toBe(false);
    expect(isMoveString("a4a5 quit")).toBe(false);
  });

  it("판 밖의 자리는 받지 않는다", () => {
    expect(isMoveString("j4j5")).toBe(false);
    expect(isMoveString("a0a5")).toBe(false);
    expect(isMoveString("a11a5")).toBe(false);
    expect(isMoveString("")).toBe(false);
  });
});
