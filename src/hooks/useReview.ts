// 복기 돌리기 — 기보 탭에서 연 판을 엔진으로 한 국면씩 짚는다
//
// 무엇을 어떻게 재는지(손해·등급·설명)는 janggi/review.ts 에 있다. 여기는 엔진을
// 복기에 빌려주고, 진행률·오류·멈춤을 React 상태로 들고 있는다.
//
// 엔진은 하나뿐이라 복기가 도는 동안에는 대국 탐색과 나눠 쓸 수 없다. running 인
// 동안 App 은 탐색을 세우고 탭 옮기기·판 열기를 막는다.

import { useRef, useState } from "react";
import type { JanggiEngine } from "../engine/engine";
import type { ReviewPlan } from "../engine/levels";
import type { EngineOptions } from "../engine/types";
import type { ArchivedGame } from "../janggi/archive";
import type { HistoryEntry } from "../janggi/history";
import { movesOf } from "../janggi/history";
import type { ReviewProgress, ReviewedMove } from "../janggi/review";
import { runReview } from "../janggi/review";

/** 복기 한 번의 결과. 기보 목록의 그 판에 옮겨 적는다. */
export interface ReviewRun {
  /** 국면마다 복기로 얻은 평가치를 적은 기보. 형세 그래프의 재료가 된다. */
  history: HistoryEntry[];
  reviewed: ReviewedMove[];
  /**
   * 모든 수를 다 짚었는지. 중간에 멈추면 runReview 가 빈 목록이나 앞쪽 일부만
   * 돌려준다. 그것을 저장하면 목록에 '복기함' 이 붙고 성적표가 0수로 뜬다.
   */
  complete: boolean;
}

/**
 * 복기로 얻은 평가치를 기보에 적는다.
 *
 * 국면 i 의 점수는 그리로 데려온 수의 '둔 뒤 점수' 와 같은 값이다. 그래야 형세 막대와
 * 복기 설명의 승률이 화면에서 어긋나지 않는다 - 둘 다 지금 보는 국면의 것을 말한다.
 */
function withScores(base: HistoryEntry[], reviewed: ReviewedMove[]): HistoryEntry[] {
  if (reviewed.length === 0) return base;
  const history = [...base];
  history[0] = { ...history[0], score: reviewed[0].scoreBefore };
  for (const r of reviewed) {
    if (history[r.index]) history[r.index] = { ...history[r.index], score: r.scoreAfter };
  }
  return history;
}

export function useReview(engine: JanggiEngine | null) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ReviewProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * 돌아가는 동안 지금까지 지어진 설명. 다 끝나기를 기다리지 않고 화면에 띄운다.
   * 1차가 끝나면 모든 수에 설명이 붙고, 2차가 고른 수를 더 정확한 것으로 갈아 끼운다.
   *
   * 어느 판의 것인지 같이 들고 있는다. 끝난 뒤에도 한 박자 남아 있어서(목록에 저장되는
   * 사이에 화면이 '복기 전' 으로 깜박이지 않게), 다른 판에 그 설명이 붙으면 안 된다.
   */
  const [partial, setPartial] = useState<(ReviewRun & { gameId: string }) | null>(null);
  const stopRequested = useRef(false);

  /**
   * game 을 복기한다. 둘 수가 없거나 오류가 나면 null(오류는 error 에 남는다).
   *
   * @param options 엔진 설정. 복기는 최선수 하나만 보고(multiPV 1) 가장 세게(skill 20) 돈다.
   * @param plan    몇 국면을 어떤 탐색량으로 볼지(engine/levels.ts 의 reviewPlan)
   */
  async function start(
    game: ArchivedGame,
    options: EngineOptions,
    plan: ReviewPlan
  ): Promise<ReviewRun | null> {
    const moves = movesOf(game.history);
    if (!engine || moves.length === 0) return null;

    stopRequested.current = false;
    setError(null);
    setProgress(null);
    setPartial(null);
    setRunning(true);
    try {
      // 두던 탐색을 먼저 세운다.
      await engine.stop();
      await engine.setOptions(options);
      const reviewed = await runReview({
        engine,
        startFen: game.history[0].fen,
        moves,
        plan,
        onProgress: setProgress,
        onPartial: (sofar) =>
          setPartial({
            gameId: game.id,
            history: withScores(game.history, sofar),
            reviewed: sofar,
            complete: false,
          }),
        shouldStop: () => stopRequested.current,
      });

      const run = {
        history: withScores(game.history, reviewed),
        reviewed,
        complete: reviewed.length === moves.length,
      };
      // 끝까지 못 간 복기는 목록에 남지 않는다. 화면에도 남기지 않는다.
      if (!run.complete) setPartial(null);
      return run;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPartial(null);
      return null;
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  function stop() {
    stopRequested.current = true;
    void engine?.stop();
  }

  return { running, progress, partial, error, clearError: () => setError(null), start, stop };
}
