// 두던 판 저장 — 새로고침하거나 폰에서 앱을 잠깐 나갔다 와도 대국이 이어지게
//
// 대국 탭의 판을 수를 둘 때마다 localStorage("janggi:game")에 남기고, 앱이 뜰 때
// 한 수 이상 둔 판이면 되살린다. 저장·읽기는 App 이 usePersisted 의 도구로 하고,
// 여기에는 '어떤 모양으로 남기는지' 와 '읽은 값을 믿어도 되는지' 만 둔다.

import type { HistoryEntry } from "./history";
import { isHistory } from "./history";
import type { Side } from "./pieces";

/**
 * 남기는 모양.
 *
 * 시계는 넣지 않는다. 100ms 마다 바뀌어서 저장이 몰리고, 새로고침한 동안 시간이
 * 흘렀는지 알 수 없어 되살린 값이 맞다고 할 수도 없다. 되살린 판의 시계는 새로 찬다.
 */
export interface SavedGame {
  /**
   * 이 판의 이름표. 끝난 판을 기보 목록에 넣을 때 같은 판이 두 줄로 서지 않게
   * 한다. 목록이 생기기 전에 저장된 판에는 없다.
   */
  id?: string;
  history: HistoryEntry[];
  cursor: number;
  /** 기권한 쪽 */
  resigned: Side | null;
  /** 시간패한 쪽. 되살리지 않으면 시간패로 진 판을 새로고침해 이어 둘 수 있다. */
  flagged: Side | null;
}

function isSideOrNull(v: unknown): boolean {
  return v === null || v === "cho" || v === "han";
}

/** 저장해 둔 값이 지금도 쓸 수 있는 모양인지. 아니면 버리고 새 판으로 시작한다. */
export function isSavedGame(v: unknown): v is SavedGame {
  if (typeof v !== "object" || v === null) return false;
  const g = v as Record<string, unknown>;
  return (
    (g.id === undefined || typeof g.id === "string") &&
    isHistory(g.history) &&
    typeof g.cursor === "number" &&
    g.cursor >= 0 &&
    g.cursor < (g.history as unknown[]).length &&
    isSideOrNull(g.resigned) &&
    isSideOrNull(g.flagged)
  );
}
