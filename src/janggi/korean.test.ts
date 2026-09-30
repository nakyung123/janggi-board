// 조사 처리
//
// 여기가 틀리면 "한을 잡습니다" 가 "한를 잡습니다" 가 된다. 실제로 화면에
// 그렇게 나간 적이 있어서 테스트로 묶어둔다.

import { describe, expect, it } from "vitest";
import { hasFinalConsonant, josa, 으로, 은는, 을를, 이가, 이었였 } from "./korean";

describe("받침 판정", () => {
  it("받침이 있으면 true", () => {
    expect(hasFinalConsonant("한")).toBe(true);
    expect(hasFinalConsonant("각")).toBe(true);
  });

  it("받침이 없으면 false", () => {
    expect(hasFinalConsonant("초")).toBe(false);
    expect(hasFinalConsonant("마")).toBe(false);
  });

  it("마지막 글자만 본다", () => {
    expect(hasFinalConsonant("양귀마")).toBe(false);
    expect(hasFinalConsonant("원앙마")).toBe(false);
    expect(hasFinalConsonant("귀마상")).toBe(true);
  });

  it("한글이 아니면 받침이 없는 것으로 친다", () => {
    expect(hasFinalConsonant("楚")).toBe(false);
    expect(hasFinalConsonant("A")).toBe(false);
    expect(hasFinalConsonant("")).toBe(false);
  });

  it("숫자로 끝나면 숫자의 소리를 따른다", () => {
    // 기보 표기는 "73졸63" 처럼 숫자로 끝난다
    expect(hasFinalConsonant("63")).toBe(true); // 삼
    expect(hasFinalConsonant("61")).toBe(true); // 일
    expect(hasFinalConsonant("62")).toBe(false); // 이
    expect(hasFinalConsonant("64")).toBe(false); // 사
    expect(hasFinalConsonant("73졸65")).toBe(false); // 오
  });
});

describe("…이었습니다 / …였습니다", () => {
  it("기보 표기 뒤에 제대로 붙는다", () => {
    // "최선은 63 였습니다" 로 나가던 자리
    expect(이었였("73졸63")).toBe("73졸63이었");
    expect(이었였("73졸62")).toBe("73졸62였");
  });
});

describe("…으로 / …로", () => {
  it("받침이 있으면 으로, 없으면 로", () => {
    expect(으로("43졸33")).toBe("43졸33으로");
    expect(으로("43졸36")).toBe("43졸36으로");
    expect(으로("43졸30")).toBe("43졸30으로");
    expect(으로("43졸32")).toBe("43졸32로");
    expect(으로("43졸35")).toBe("43졸35로");
  });

  it("ㄹ 받침 뒤에는 로 - 숫자 1·7·8 과 한글", () => {
    expect(으로("43졸31")).toBe("43졸31로");
    expect(으로("43졸37")).toBe("43졸37로");
    expect(으로("43졸38")).toBe("43졸38로");
    expect(으로("길")).toBe("길로");
    expect(으로("한")).toBe("한으로");
  });
});

describe("조사 붙이기", () => {
  it("초 / 한", () => {
    expect(이가("초")).toBe("초가");
    expect(이가("한")).toBe("한이");
    expect(은는("초")).toBe("초는");
    expect(은는("한")).toBe("한은");
    expect(을를("초")).toBe("초를");
    expect(을를("한")).toBe("한을");
  });

  it("화면에 실제로 나가는 문장", () => {
    // 대국 패널: "지금은 엔진이 {}을 잡습니다"
    expect(을를("양쪽 다")).toBe("양쪽 다를");
    // 배너: "{} 이겼습니다"
    expect(이가("초")).toBe("초가");
  });

  it("josa 는 받는 조사를 그대로 쓴다", () => {
    expect(josa("초", "이", "가")).toBe("초가");
    expect(josa("한", "이", "가")).toBe("한이");
  });
});
