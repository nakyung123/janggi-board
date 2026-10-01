// @vitest-environment jsdom
//
// 시계 배선 — 시간이 흘러 0을 지날 때 실제로 시간패가 서는가
//
// 시계 계산 자체는 janggi/clock.test.ts 가 본다(초읽기 회차, 넘겨 쓴 시간, 시간패 판정).
// 거기서 보지 못하는 것이 하나 남는다 - 그 계산을 **누가 언제 부르는가**. 시간을 깎는
// 것은 200ms 짜리 타이머이고, 시간패를 세우는 것은 clocks 가 바뀔 때마다 도는 effect 다.
// 둘 중 하나만 끊겨도 계산은 멀쩡한데 시계가 0인 채로 판이 안 끝난다.
//
// 가짜 시계(fake timers)를 쓰지 않는다. 이 훅은 performance.now() 로 **실제로 흐른 시간**
// 을 재서 깎기 때문에, 타이머만 앞으로 돌리면 now 가 그대로라 0ms 씩 깎인다. 그래서 진짜
// 시간을 흘려보낸다 - 대신 시계를 0.4초로 줄여서 테스트가 1초 안에 끝나게 했다.

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ClockSettings } from "../janggi/clock";
import { useClockTicking, useGameClock } from "./useGameClock";

// 초읽기 소리는 jsdom 에 오디오가 없어서 막아 둔다. 여기서 볼 것도 아니다.
vi.mock("../audio/sound", () => ({ playTickSound: vi.fn() }));

/** 0.4초만 주고 초읽기는 없다. 다 쓰면 바로 시간패다. */
const 짧은시계: ClockSettings = {
  enabled: true,
  mainSeconds: 0.4,
  byoyomiSeconds: 0,
  byoyomiCount: 0,
};

/** 시계를 들고 돌리는 한 벌. running·mover 는 App 이 넘기는 것과 같은 자리다. */
function 시계를돌린다(running = true, mover: "cho" | "han" = "cho") {
  return renderHook(() => {
    const clock = useGameClock(짧은시계, null);
    useClockTicking(clock, running, mover, null);
    return clock;
  });
}

describe("시계가 도는 동안", () => {
  it("둘 차례인 쪽의 시간이 깎이고, 다 쓰면 시간패가 선다", async () => {
    const { result } = 시계를돌린다(true, "cho");

    expect(result.current.flagged).toBeNull();
    expect(result.current.clocks.cho.mainMs).toBe(400);

    await waitFor(() => expect(result.current.flagged).toBe("cho"), { timeout: 3000 });

    // 차례가 아닌 쪽은 그대로다. 양쪽 다 깎이면 둘 다 시간패가 된다.
    expect(result.current.clocks.han.mainMs).toBe(400);
  });

  it("시계가 돌지 않으면 시간이 깎이지 않는다", async () => {
    // 판이 끝났거나 기보를 되짚는 중에도 시간이 깎이면, 보고만 있어도 지게 된다.
    const { result } = 시계를돌린다(false, "cho");

    await new Promise((r) => setTimeout(r, 700));

    expect(result.current.clocks.cho.mainMs).toBe(400);
    expect(result.current.flagged).toBeNull();
  });

  it("새 대국을 시작하면 시간패가 지워지고 시계가 다시 찬다", async () => {
    // 시간패가 남아 있으면 새로 놓은 판이 시작하자마자 끝난 판으로 보인다.
    const { result } = 시계를돌린다(true, "cho");
    await waitFor(() => expect(result.current.flagged).toBe("cho"), { timeout: 3000 });

    act(() => result.current.reset());

    expect(result.current.flagged).toBeNull();
    expect(result.current.clocks.cho.mainMs).toBe(400);
  });
});
