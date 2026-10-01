// 장군·멍군·빅장 외치기
//
// 방금 둔 수로 장군이 걸렸으면 판 가운데에 한 번 외친다(CheckCallout). 외치는 것은
// '방금 그 수' 뿐이라, **어느 국면에서 외쳤는지**와 **앞 국면이 장군이었는지**를 기억해야
// 한다. 그 기억 둘이 App 의 다른 것들과 섞여 있을 이유가 없어 여기로 옮겼다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameStatus } from "../janggi/status";

export interface Callout {
  text: string;
  /** 같은 말을 다시 외칠 때도 새로 뜨게 하는 값. 국면 번호를 쓴다. */
  key: number;
}

export interface CalloutState {
  callout: Callout | null;
  /** 이 국면 번호의 수로 방금 뒀다고 알린다. 외치는 것은 그 한 번뿐이다. */
  justMoved: (ply: number) => void;
  /** 판을 새로 놓을 때. 국면 번호가 다시 0부터라 기억이 어긋난다. */
  forget: () => void;
}

interface Options {
  /** 대국 탭에서 두는 중인지. 기보 탭에서 되짚을 때는 외치지 않는다. */
  active: boolean;
  /** 엔진이 이 국면의 답을 줬는지. 장군인지 아닌지는 엔진만 안다. */
  probed: boolean;
  /** 장군을 걸고 있는 기물들. 비어 있지 않으면 장군이다. */
  checkers: readonly string[];
  /** 지금 국면 번호 */
  cursor: number;
  kind: GameStatus["kind"];
}

export function useCallout({ active, probed, checkers, cursor, kind }: Options): CalloutState {
  /**
   * 국면 번호마다 장군이 걸려 있었는지. 멍군을 가리려면 **바로 앞 국면**이 장군이었는지
   * 알아야 한다. 대국 탭에서는 다음 수를 두기 전에 반드시 엔진 답을 받으므로
   * (합법수가 있어야 둔다) 앞 국면의 값은 늘 채워져 있다.
   */
  const checkAt = useRef(new Map<number, boolean>());
  /** 방금 수를 둬서 생긴 국면 번호. 장군·빅장을 그 순간에만 외치려고 기억한다. */
  const moved = useRef<number | null>(null);
  const [callout, setCallout] = useState<Callout | null>(null);

  /*
   * 장군을 받은 쪽이 피하면서 되받아 장군을 부르면 멍군이다 - 앞 국면도 이번 국면도
   * 장군. 외통은 외치지 않는다(결과 창이 바로 뜬다). 되짚거나 무르다가 장군 국면에
   * 와도 외치지 않는다. 빅장은 받은 쪽이 모르고 한수쉼을 두면 판이 끝나서 외친다.
   */
  useEffect(() => {
    if (!active || !probed) return;
    checkAt.current.set(cursor, checkers.length > 0);
    if (moved.current !== cursor) return;
    moved.current = null;
    if (kind === "check") {
      setCallout({ text: checkAt.current.get(cursor - 1) ? "멍군!" : "장군!", key: cursor });
    } else if (kind === "facing") {
      setCallout({ text: "빅장!", key: cursor });
    }
  }, [active, probed, checkers, cursor, kind]);

  useEffect(() => {
    if (!callout) return;
    // CSS 가 1.1초에 걸쳐 떴다 사라진다. 요소는 조금 뒤에 걷는다.
    const t = window.setTimeout(() => setCallout(null), 1200);
    return () => window.clearTimeout(t);
  }, [callout]);

  const justMoved = useCallback((ply: number) => {
    moved.current = ply;
  }, []);

  const forget = useCallback(() => {
    setCallout(null);
    moved.current = null;
    checkAt.current.clear();
  }, []);

  /*
   * 돌려주는 것을 붙박아 둔다.
   *
   * 매 렌더 새 객체를 돌려줬더니 이것을 의존성에 둔 pushMove 가 매 렌더 새 함수가 되고,
   * 그것을 의존성에 둔 엔진 착수 effect 가 매 렌더 타이머를 끊고 다시 걸어서 **엔진이
   * 영영 두지 못했다.** 테스트 셋이 잡았다("무르고 같은 수를 다시 두면 엔진이 다시 둔다"
   * 외 둘). 이 저장소에는 같은 까닭으로 붙박아 둔 값이 여럿이다(searchLimits·options).
   */
  return useMemo(() => ({ callout, justMoved, forget }), [callout, justMoved, forget]);
}
