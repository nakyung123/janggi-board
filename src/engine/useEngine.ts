// 엔진을 React 에서 쓰는 훅 둘
//
//   useEngine    엔진(WASM)을 내려받아 띄우고, 준비 상태·진행률·오류를 알린다
//   useAnalysis  국면이 바뀔 때마다 합법수·장군을 묻고, 엔진 차례면 둘 수를 찾는다

import { useEffect, useRef, useState } from "react";
import { noteTrouble } from "../report/errors";
import { JanggiEngine } from "./engine";
import type {
  AnalysisSnapshot,
  LoadProgress,
  PositionRef,
  SearchLimits,
} from "./types";
import { positionKey } from "./types";

export type EngineStatus = "loading" | "ready" | "error";

// 엔진은 한 탭에 하나면 충분하고, 11MB 신경망을 두 번 받을 이유도 없다.
// StrictMode 가 개발 모드에서 이펙트를 두 번 실행하므로 여기서 한 번으로 묶는다.
let shared: Promise<JanggiEngine> | null = null;
const progressWatchers = new Set<(p: LoadProgress) => void>();

function sharedEngine(): Promise<JanggiEngine> {
  if (!shared) {
    shared = JanggiEngine.create((p) => {
      for (const fn of progressWatchers) fn(p);
    }).catch((err) => {
      shared = null; // 실패했으면 다음 시도에서 다시 만들 수 있게 한다
      throw err;
    });
  }
  return shared;
}

export interface EngineState {
  engine: JanggiEngine | null;
  status: EngineStatus;
  progress: LoadProgress | null;
  error: string | null;
  /**
   * 신경망이 실제로 물렸는지 알려주는 엔진 자체 응답.
   *
   * 신경망은 뒤에서 받으므로(engine.ts 의 loadNnue) 처음에는 null 이고, 다 물린 뒤에
   * 채워진다. 여기서 classical 이 나오면 신경망이 끝내 안 붙은 것이라 실력이 떨어진다.
   */
  evalMode: string | null;
}

export function useEngine(): EngineState {
  const [state, setState] = useState<EngineState>({
    engine: null,
    status: "loading",
    progress: null,
    error: null,
    evalMode: null,
  });

  useEffect(() => {
    let alive = true;

    const onProgress = (progress: LoadProgress) => {
      if (alive) setState((s) => ({ ...s, progress }));
    };
    progressWatchers.add(onProgress);

    sharedEngine()
      .then(async (engine) => {
        if (!alive) return;
        /*
         * 엔진(1.6MB)만 받으면 바로 둘 수 있다. 여기서 판을 띄운다.
         *
         * 예전에는 신경망 11MB 까지 다 받고서야 띄웠다. 처음 온 사람이 빈 화면을
         * 10초 넘게 봤다. 그 사이에도 엔진은 classical 평가로 멀쩡히 둔다.
         */
        setState({ engine, status: "ready", progress: null, error: null, evalMode: null });

        // 신경망이 물린 뒤에 한 번 물어본다. 진단용이라 급하지 않다.
        await engine.whenStrong();
        if (!alive) return;
        const evalMode = await engine
          .evaluationMode(
            "rnba1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR w - - 0 1"
          )
          .catch(() => null);
        if (!alive) return;
        setState((s) => ({ ...s, evalMode }));
      })
      .catch((err: unknown) => {
        if (!alive) return;
        // 엔진이 안 뜨면 앱이 통째로 멈추므로 화면에 까닭을 보여야 한다. 그래도 날것을
        // 그대로 쓰지는 않는다 - 우리가 쓴 한국어 글이면 그대로, 아니면 오류 코드다.
        setState((s) => ({ ...s, status: "error", error: noteTrouble("엔진 준비", err).message }));
      });

    return () => {
      alive = false;
      progressWatchers.delete(onProgress);
    };
  }, []);

  return state;
}

export interface AnalysisState {
  snapshot: AnalysisSnapshot | null;
  /** 이 국면의 합법수 전체 */
  legal: Set<string>;
  /** 지금 궁을 노리는 기물들의 자리. 비어 있지 않으면 장군 */
  checkers: string[];
  /** 이 국면에 대한 엔진 응답을 받았는지. 받기 전에는 대국 종료로 판정하면 안 된다. */
  probed: boolean;
}

/**
 * 국면이 바뀔 때마다 합법수를 다시 구하고, 켜져 있으면 탐색도 다시 돌린다.
 * 탐색은 엔진이 제 수를 고를 때만 켜진다. 기보를 빠르게 넘기면 국면이 연달아
 * 들어오므로 살짝 늦춰서 처리한다.
 */
export function useAnalysis(
  engine: JanggiEngine | null,
  ref: PositionRef,
  enabled: boolean,
  limits: SearchLimits,
  optionsKey: string
): AnalysisState {
  // 분석 결과에 "어느 국면의 것인지" 꼬리표를 달아 둔다.
  // 국면이 바뀐 직후 낡은 결과가 새 국면의 것으로 읽히면, 엔진이 엉뚱한 수를 둔다.
  const [tagged, setTagged] = useState<{
    key: string;
    snap: AnalysisSnapshot;
  } | null>(null);
  /*
   * 합법수·장군도 '어느 국면의 것인지' 꼬리표를 단다.
   *
   * probed 를 따로 두고 국면이 바뀌면 effect 에서 false 로 돌리면 안 된다. effect 는
   * 그린 뒤에 돌아서, 수를 둔 직후 한 번은 probed 가 true 인 채 legal·checkers 가 앞
   * 국면의 것이다. 장군·멍군을 외치는 쪽이 그것을 새 국면의 값으로 읽으면, 엔진이
   * 장군을 피한 수를 "멍군!" 이라고 외친다. 꼬리표가 지금 국면과 맞을 때만 내보내면
   * 그 틈이 없다.
   */
  const [probe, setProbe] = useState<{
    key: string;
    legal: Set<string>;
    checkers: string[];
  } | null>(null);
  // 같은 국면이면 같은 문자열. 이걸로 늦게 도착한 결과를 걸러낸다.
  const key = positionKey(ref);
  const keyRef = useRef(key);
  keyRef.current = key;
  const refBox = useRef(ref);
  refBox.current = ref;

  useEffect(() => {
    if (!engine) return;
    let alive = true;

    const timer = window.setTimeout(() => {
      void engine
        .probe(refBox.current)
        .then((r) => {
          if (!alive) return;
          setProbe({ key, legal: new Set(r.legal), checkers: r.checkers });
        })
        .catch(() => {
          if (!alive) return;
          setProbe(null);
        });
    }, 60);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [engine, key]);

  useEffect(() => {
    if (!engine) return;
    if (!enabled) {
      void engine.stop();
      setTagged(null);
      return;
    }

    let alive = true;
    setTagged(null);

    const timer = window.setTimeout(() => {
      engine.analyze(refBox.current, limits, (snap) => {
        // 국면이 이미 바뀐 뒤 도착한 늦은 결과는 버린다.
        if (alive && keyRef.current === key) setTagged({ key, snap });
      });
    }, 180);

    return () => {
      alive = false;
      window.clearTimeout(timer);
      void engine.stop();
    };
    // limits 는 매번 새 객체라 참조로 비교하면 무한 재실행된다. 문자열 키로 묶는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, key, enabled, optionsKey]);

  // 지금 국면의 결과일 때만 내보낸다.
  const snapshot = tagged && tagged.key === key ? tagged.snap : null;
  const probed = probe !== null && probe.key === key;

  return {
    snapshot,
    legal: probed ? probe.legal : NO_MOVES,
    checkers: probed ? probe.checkers : NO_CHECKERS,
    probed,
  };
}

// 아직 응답이 없을 때 내보내는 빈 값. 매번 새로 만들면 받는 쪽 useMemo 가 헛돈다.
const NO_MOVES: Set<string> = new Set();
const NO_CHECKERS: string[] = [];
