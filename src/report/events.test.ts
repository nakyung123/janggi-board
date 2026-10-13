// @vitest-environment jsdom
//
// 보내는 시점을 본다. **무엇을 담는지가 아니라 언제 나가는지**가 여기서 보려는 것이다.
//
// 왜 이 테스트가 있나 - 2026-10-13 에 "하루 20명이 열었는데 engine_ready 는 16개" 를
// 보고 "느려서 떠났다" 로 읽었다. 근거가 없었다. app_open 만 즉시 가고 나머지는 묶음이라
// **엔진은 떴지만 묶음이 안 간 사람**과 구별되지 않았다. 셋을 즉시로 옮기고 나머지는
// 대조군으로 남겼는데, **그 가름이 깨지면 유실률을 잴 수가 없다.**

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startTracking, track } from "./events";

/** sendBeacon 이 받은 묶음들. 한 묶음이 요청 한 건이다. */
let 보낸묶음: string[][] = [];

function 이름들(묶음: number): string[] {
  return 보낸묶음[묶음] ?? [];
}

beforeEach(() => {
  보낸묶음 = [];
  Object.defineProperty(navigator, "sendBeacon", {
    configurable: true,
    writable: true,
    // jsdom 에는 sendBeacon 이 없다. Blob 을 받아 바로 읽을 수 없으니(비동기다) 보낸
    // 본문을 동기로 붙잡으려고 JSON.stringify 쪽을 거치지 않고 Blob 생성을 가로챈다.
    value: (_url: string, blob: Blob) => {
      보낸묶음.push((blob as Blob & { __이름들?: string[] }).__이름들 ?? []);
      return true;
    },
  });

  // Blob 은 내용을 동기로 못 읽는다. events.ts 가 넣은 본문을 그대로 들고 다니게
  // 감싸서, 테스트가 "몇 번째 요청에 무엇이 실렸나" 를 바로 볼 수 있게 한다.
  const 원래Blob = globalThis.Blob;
  vi.stubGlobal(
    "Blob",
    class extends 원래Blob {
      __이름들: string[];
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        const 본문 = String(parts[0]);
        this.__이름들 = (JSON.parse(본문) as { events: { name: string }[] }).events.map(
          (e) => e.name
        );
      }
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("보내는 시점", () => {
  it("즉시 보낼 것과 묶을 것이 갈리고, 즉시 보내기가 대기열을 비우지 않는다", () => {
    startTracking();

    // 쪽이 열리면 바로 나간다. 여기서 0건이면 isBot() 이 우리를 사람이 아니라고 본 것이다.
    expect(보낸묶음).toHaveLength(1);
    expect(이름들(0)).toEqual(["app_open"]);

    // 대조군. 쪽이 가려질 때까지 안 나간다.
    track("game_start", { level: 3 });
    expect(보낸묶음).toHaveLength(1);

    // 즉시 보낼 것. **이 한 건만** 나가야 한다 - flush() 를 부르면 위의 game_start 까지
    // 같이 나가서 유실률을 잴 대조군이 사라진다.
    track("engine_ready", { ms: 900 });
    expect(보낸묶음).toHaveLength(2);
    expect(이름들(1)).toEqual(["engine_ready"]);

    track("first_move", { ms: 1500 });
    expect(보낸묶음).toHaveLength(3);
    expect(이름들(2)).toEqual(["first_move"]);

    // 대조군 하나 더. 아직 안 나간다.
    track("game_end", { won: true });
    expect(보낸묶음).toHaveLength(3);

    // 쪽이 가려지면 묶음이 한 번에 나간다. 둘이 같은 요청에 실려야 한다.
    window.dispatchEvent(new Event("pagehide"));
    expect(보낸묶음).toHaveLength(4);
    expect(이름들(3)).toEqual(["game_start", "game_end"]);

    // 비워진 뒤에 또 가려져도 빈 요청을 보내지 않는다.
    window.dispatchEvent(new Event("pagehide"));
    expect(보낸묶음).toHaveLength(4);
  });

  it("엔진 실패도 즉시 나간다 - 가장 알고 싶은 사람이 묶음에 걸려 사라지면 안 된다", () => {
    track("engine_failed", { code: "E-7F3A" });

    expect(보낸묶음).toHaveLength(1);
    expect(이름들(0)).toEqual(["engine_failed"]);
  });
});
