// 엔진 수명주기와 자동 재분석을 React 쪽에서 다루기 위한 훅

import { useEffect, useRef, useState } from "react";
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
  /** 신경망이 실제로 물렸는지 알려주는 엔진 자체 응답 */
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
        // 로딩이 끝나자마자 신경망 적용 여부를 한 번 물어본다.
        // 여기서 classical 이 나오면 신경망이 안 붙은 것이라 실력이 크게 떨어진다.
        const evalMode = await engine
          .evaluationMode(
            "rnba1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR w - - 0 1"
          )
          .catch(() => null);
        if (!alive) return;
        setState({
          engine,
          status: "ready",
          progress: null,
          error: null,
          evalMode,
        });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setState((s) => ({
          ...s,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        }));
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
 * 국면이 바뀔 때마다 합법수를 다시 구하고, 켜져 있으면 분석도 다시 돌린다.
 * 편집 모드에서 기물을 하나 옮길 때마다 새 국면이 들어오므로 살짝 늦춰서 처리한다.
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
  const [legal, setLegal] = useState<Set<string>>(new Set());
  const [checkers, setCheckers] = useState<string[]>([]);
  const [probed, setProbed] = useState(false);
  // 같은 국면이면 같은 문자열. 이걸로 늦게 도착한 결과를 걸러낸다.
  const key = positionKey(ref);
  const keyRef = useRef(key);
  keyRef.current = key;
  const refBox = useRef(ref);
  refBox.current = ref;

  useEffect(() => {
    if (!engine) return;
    let alive = true;
    setProbed(false);

    const timer = window.setTimeout(() => {
      void engine
        .probe(refBox.current)
        .then((r) => {
          if (!alive) return;
          setLegal(new Set(r.legal));
          setCheckers(r.checkers);
          setProbed(true);
        })
        .catch(() => {
          if (!alive) return;
          setLegal(new Set());
          setCheckers([]);
          setProbed(false);
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

  return { snapshot, legal, checkers, probed };
}
