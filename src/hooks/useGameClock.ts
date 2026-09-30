// 대국 시계 — 양쪽 남은 시간, 시간패, 초읽기 소리
//
// 초읽기 규칙과 계산은 janggi/clock.ts 에 있고, 여기는 그것을 React 상태로 들고
// 시간에 맞춰 깎는 일을 한다. 둘로 나뉜다.
//
//   useGameClock    시계 상태(남은 시간·시간패)와, 수를 둘 때·판을 새로 놓을 때 부를 동작
//   useClockTicking 시계가 도는 동안 200ms 마다 둘 차례인 쪽의 시간을 깎고, 내 차례의
//                   마지막 10초에 초읽기 소리를 낸다
//
// 나눈 까닭: 시계가 도는지(running)는 대국이 끝났는지에 달려 있고, 대국이 끝났는지는
// 시간패(이 훅의 상태)에 달려 있다. 한 훅에 두면 입력과 출력이 서로를 기다린다.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClockSettings, ClockState } from "../janggi/clock";
import {
  alarmSecondOf,
  commitMove,
  flaggedSide,
  initialClocks,
  tickClock,
  withFlagged,
} from "../janggi/clock";
import type { Side } from "../janggi/pieces";
import { playTickSound } from "../audio/sound";

/**
 * @param settings     고른 시계. 목록 속 객체를 그대로 넘겨야 한다(clockPresetById) -
 *                     렌더마다 새 객체가 오면 설정이 바뀐 것으로 보고 시계를 새로 채운다.
 * @param restoredFlag 되살린 판이 시간패로 끝났으면 그 쪽. 그 쪽 시계를 다 쓴 모습으로
 *                     채운다(시계만 가득 찬 채 "시간패" 가 적혀 있으면 앞뒤가 맞지 않는다).
 */
export function useGameClock(settings: ClockSettings, restoredFlag: Side | null) {
  const [flagged, setFlagged] = useState<Side | null>(restoredFlag);
  const [clocks, setClocks] = useState<ClockState>(() =>
    withFlagged(initialClocks(settings), restoredFlag)
  );

  /** 렌더를 기다리지 않고 읽는 지금 값. 엔진이 이번 수에 쓸 시간을 정할 때 본다. */
  const clocksRef = useRef(clocks);
  useEffect(() => {
    clocksRef.current = clocks;
  }, [clocks]);

  /** 양쪽 시계를 새로 채우고 시간패를 지운다. 새 대국·상차림 바꾸기가 부른다. */
  const reset = useCallback(() => {
    setClocks(initialClocks(settings));
    setFlagged(null);
  }, [settings]);

  /*
   * 시계 설정을 바꾸면 새로 채운다. '처음 그릴 때인가' 가 아니라 '설정이 실제로
   * 달라졌는가' 를 본다 - 처음부터 채우면 되살린 시간패가 지워지고, StrictMode 가
   * effect 를 두 번 돌려도 두 번째는 값이 같아 그냥 지나간다.
   */
  const lastSettings = useRef(settings);
  useEffect(() => {
    if (lastSettings.current === settings) return;
    lastSettings.current = settings;
    reset();
  }, [settings, reset]);

  // 한쪽이 초읽기까지 다 쓰면 시간패. 알림은 띄우지 않는다 - 결과 창·대국자 카드가 말한다.
  useEffect(() => {
    const out = flaggedSide(clocks);
    if (out && !flagged) setFlagged(out);
  }, [clocks, flagged]);

  /** side 가 한 수를 뒀다. 초읽기는 그 회 안에 두면 회수가 줄지 않고 다시 찬다. */
  const commit = useCallback(
    (side: Side) => {
      if (settings.enabled) setClocks((prev) => commitMove(prev, side, settings));
    },
    [settings]
  );

  /** side 의 시간을 dt(ms)만큼 깎는다. useClockTicking 이 부른다. */
  const tick = useCallback(
    (side: Side, dt: number) => setClocks((prev) => tickClock(prev, side, dt, settings)),
    [settings]
  );

  return { clocks, flagged, clocksRef, reset, commit, tick };
}

/**
 * @param running  지금 시계가 도는지. 시계를 쓰는 대국 탭에서, 첫 수가 놓인 뒤,
 *                 기보 끝을 보고 있고 판이 끝나지 않았을 때만 돈다.
 * @param mover    둘 차례인 쪽. 이 쪽의 시간이 깎인다.
 * @param alarmFor 초읽기 소리를 낼 쪽. 내 차례일 때만 나(엔진 차례에는 null) -
 *                 소리는 사람에게 하는 말이다.
 */
export function useClockTicking(
  clock: ReturnType<typeof useGameClock>,
  running: boolean,
  mover: Side,
  alarmFor: Side | null
) {
  const { tick, clocks } = clock;

  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      tick(mover, now - last);
      last = now;
    }, 200);
    return () => window.clearInterval(id);
    // mover 가 바뀌면 타이머를 다시 건다. 그 순간 last 도 새로 잡혀 시간이 새지 않는다.
  }, [running, mover, tick]);

  /*
   * 다 쓰면 한 회가 줄거나 지는 시간의 마지막 10초에 1초마다 한 번(alarmSecondOf).
   * 값이 10 → 9 → … → 1 로 바뀔 때마다 effect 가 한 번씩 돌아서 따로 타이머가 없다.
   */
  const second = running && alarmFor ? alarmSecondOf(clocks[alarmFor]) : null;
  useEffect(() => {
    if (second !== null) playTickSound(second <= 5);
  }, [second]);
}
