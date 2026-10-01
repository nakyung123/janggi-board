// 오류 장부 — 터진 자리를 코드 하나로 되찾을 수 있는가
//
// 서버가 없으니 "로그를 본다" 는 선택지가 없다. 아는 길은 사용자가 말해 주는 것뿐이고,
// 사용자가 옮겨 적을 수 있는 것은 짧은 코드 하나다. 그래서 여기서 보는 것은 둘이다 -
// **화면에 내부 사정이 새지 않는가**, **같은 오류가 같은 코드를 받는가**.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTroubles, isNoise, lastTrouble, noteTrouble, troubleLine } from "./errors";

beforeEach(() => {
  clearTroubles();
  // 장부는 콘솔에도 남긴다. 테스트 출력이 붉어지지 않게 가려 둔다.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("화면에 보일 말", () => {
  it("우리가 쓴 한국어 글은 그대로 보여준다", () => {
    const t = noteTrouble("기보 불러오기", new Error("수가 너무 많습니다. (1200수)"));
    expect(t.message).toBe("수가 너무 많습니다. (1200수)");
  });

  it("내부 사정이 섞인 영어는 코드로 바꾼다", () => {
    // 사람에게 아무것도 알려 주지 않으면서 겁만 주는 종류다.
    const t = noteTrouble("기보 불러오기", new TypeError("Cannot read properties of undefined"));
    expect(t.message).not.toContain("Cannot read");
    expect(t.message).toContain(t.code);
    expect(t.message).toMatch(/알 수 없는 오류/);
  });

  it("가려도 날것은 장부에 남는다", () => {
    const t = noteTrouble("복기", new Error("boom"));
    expect(t.detail).toBe("boom");
  });

  it("Error 가 아닌 것이 던져져도 받는다", () => {
    expect(noteTrouble("어딘가", "그냥 글자").detail).toBe("그냥 글자");
    expect(noteTrouble("어딘가", { why: 1 }).detail).toContain("why");
    expect(() => noteTrouble("어딘가", undefined)).not.toThrow();
  });
});

describe("오류 코드", () => {
  it("같은 오류는 같은 코드를 받는다", () => {
    // 세 사람이 같은 버그를 겪으면 제보 셋이 한 자리를 가리켜야 한다.
    const a = noteTrouble("복기", new Error("boom"));
    const b = noteTrouble("복기", new Error("boom"));
    expect(a.code).toBe(b.code);
  });

  it("자리가 다르면 코드도 다르다", () => {
    const a = noteTrouble("복기", new Error("boom"));
    const b = noteTrouble("기보 불러오기", new Error("boom"));
    expect(a.code).not.toBe(b.code);
  });

  it("옮겨 적을 만큼 짧다", () => {
    expect(noteTrouble("복기", new Error("boom")).code).toMatch(/^E-[0-9A-F]{4}$/);
  });
});

describe("제보에 붙는 줄", () => {
  it("터진 적이 없으면 아무 줄도 붙이지 않는다", () => {
    expect(troubleLine()).toBe("");
  });

  it("방금 터졌으면 '방금' 이라고 적는다", () => {
    const t = noteTrouble("기보 불러오기", new Error("boom"));
    expect(troubleLine(t.at)).toBe(`마지막 오류: ${t.code} 기보 불러오기 (방금)`);
  });

  it("한참 전 일이면 몇 분 전인지 적는다", () => {
    // 제보는 대개 터지고 한참 뒤에 쓴다. 방금 일인지 아까 일인지에 따라 찾을 자리가 다르다.
    const t = noteTrouble("복기", new Error("boom"));
    expect(troubleLine(t.at + 7 * 60_000)).toContain("(7분 전)");
  });

  it("가장 최근 것만 붙인다", () => {
    noteTrouble("복기", new Error("먼저"));
    const 나중 = noteTrouble("기보 불러오기", new Error("나중"));
    expect(lastTrouble()?.code).toBe(나중.code);
    expect(troubleLine(나중.at)).toContain("기보 불러오기");
  });
});

describe("오류가 아닌 것", () => {
  it("ResizeObserver 알림은 거른다", () => {
    // 크기를 재는 콜백이 다시 레이아웃을 바꾸면 브라우저가 올린다. 이 앱은 남은 높이로
    // 판 크기를 정해서 창만 줄여도 뜬다. 거르지 않으면 모든 제보에 이것이 붙는다.
    expect(isNoise("ResizeObserver loop completed with undelivered notifications.")).toBe(true);
    expect(isNoise("ResizeObserver loop limit exceeded")).toBe(true);
  });

  it("진짜 오류는 거르지 않는다", () => {
    expect(isNoise("Cannot read properties of undefined")).toBe(false);
    expect(isNoise(undefined)).toBe(false);
  });
});
