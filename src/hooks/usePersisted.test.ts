// 설정 저장
//
// 여기가 틀리면 증상이 고약하다. 앱이 터지는 게 아니라 "어제 맞춰둔 설정이
// 안 돌아온다" 거나, 더 나쁘게는 "이상한 값이 저장돼서 매번 그 상태로 시작한다"
// 가 된다. 후자는 사용자가 빠져나올 방법이 없다.
//
// 그래서 읽는 쪽이 저장된 값을 절대 믿지 않는지를 집중적으로 본다.
// 훅 자체(usePersisted)는 React 가 필요해서 여기서 다루지 않고,
// 읽기·쓰기 순수 부분만 가짜 저장소를 끼워 본다.

import { describe, expect, it } from "vitest";
import type { StoreLike } from "./usePersisted";
import { readStored, writeStored } from "./usePersisted";

/** 메모리 위의 가짜 저장소 */
function fakeStore(seed: Record<string, string> = {}): StoreLike & { data: Record<string, string> } {
  const data = { ...seed };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

/** 무엇을 해도 터지는 저장소 (사생활 보호 모드, 저장 차단) */
const brokenStore: StoreLike = {
  getItem() {
    throw new Error("차단됨");
  },
  setItem() {
    throw new Error("차단됨");
  },
  removeItem() {
    throw new Error("차단됨");
  },
};

describe("읽기", () => {
  it("저장된 게 없으면 기본값", () => {
    expect(readStored("levelId", "k12", undefined, fakeStore())).toBe("k12");
  });

  it("저장된 값을 돌려준다", () => {
    const store = fakeStore({ "janggi:levelId": '"d3"' });
    expect(readStored("levelId", "k12", undefined, store)).toBe("d3");
  });

  it("객체도 그대로 돌아온다", () => {
    const store = fakeStore({ "janggi:clock": '{"enabled":true,"mainSeconds":900}' });
    expect(readStored("clock", {}, undefined, store)).toEqual({
      enabled: true,
      mainSeconds: 900,
    });
  });

  it("깨진 JSON 은 기본값으로 간다", () => {
    // 사람이 직접 고쳤거나 저장이 중간에 끊긴 경우
    const store = fakeStore({ "janggi:levelId": "{이건 JSON 이 아니다" });
    expect(readStored("levelId", "k12", undefined, store)).toBe("k12");
  });

  it("accept 가 거절하면 기본값으로 간다", () => {
    // 예전에 저장해 둔 급수가 지금 사다리에는 없는 경우
    const store = fakeStore({ "janggi:levelId": '"없는급수"' });
    const 있는급수 = (v: unknown) => v === "k12" || v === "d3";
    expect(readStored("levelId", "k12", 있는급수, store)).toBe("k12");
  });

  it("accept 가 받아들이면 저장된 값을 쓴다", () => {
    const store = fakeStore({ "janggi:levelId": '"d3"' });
    const 있는급수 = (v: unknown) => v === "k12" || v === "d3";
    expect(readStored("levelId", "k12", 있는급수, store)).toBe("d3");
  });

  it("null 이 저장돼 있어도 기본값으로 덮이지 않는다", () => {
    // JSON 으로 null 을 넣은 것과 값이 없는 것은 다르다. accept 가 판단한다.
    const store = fakeStore({ "janggi:x": "null" });
    expect(readStored("x", "기본", (v) => v !== null, store)).toBe("기본");
  });

  it("저장소가 막혀 있어도 기본값으로 돈다", () => {
    expect(readStored("levelId", "k12", undefined, brokenStore)).toBe("k12");
  });

  it("저장소가 아예 없어도 기본값으로 돈다", () => {
    expect(readStored("levelId", "k12", undefined, null)).toBe("k12");
  });

  it("false 와 0 을 값이 없는 것으로 착각하지 않는다", () => {
    // 소리 끄기(false)를 저장했는데 다음에 켜져 있으면 곤란하다
    const store = fakeStore({ "janggi:soundOn": "false", "janggi:n": "0" });
    expect(readStored("soundOn", true, undefined, store)).toBe(false);
    expect(readStored("n", 5, undefined, store)).toBe(0);
  });
});

describe("쓰기", () => {
  it("접두사를 붙여 저장한다", () => {
    // 다른 앱과 키가 섞이면 안 된다
    const store = fakeStore();
    writeStored("levelId", "d3", store);
    expect(store.data["janggi:levelId"]).toBe('"d3"');
  });

  it("쓴 것을 그대로 다시 읽는다", () => {
    const store = fakeStore();
    const 시계 = { enabled: true, mainSeconds: 900, byoyomiSeconds: 40, byoyomiCount: 5 };
    writeStored("customClock", 시계, store);
    expect(readStored("customClock", null, undefined, store)).toEqual(시계);
  });

  it("저장소가 막혀 있어도 터지지 않는다", () => {
    // 저장이 안 된다고 대국이 멈추면 안 된다
    expect(() => writeStored("levelId", "d3", brokenStore)).not.toThrow();
  });

  it("저장소가 없어도 터지지 않는다", () => {
    expect(() => writeStored("levelId", "d3", null)).not.toThrow();
  });
});
