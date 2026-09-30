// 기보 목록(지난 판) 상태와 저장
//
// 목록을 바꾸면 그대로 localStorage("janggi:games")에 남긴다. 목록의 모양·한도·
// 판 하나를 넣고 바꾸는 규칙은 janggi/archive.ts 에 있고, 여기는 React 상태와
// 저장소를 잇는 일만 한다.

import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ArchivedGame } from "../janggi/archive";
import { readArchive } from "../janggi/archive";
import { readStored, safeStore, writeStored } from "./usePersisted";

/**
 * 목록을 남기고, 실제로 남긴 목록을 돌려준다.
 *
 * 저장 공간이 차면 오래된 판(목록 끝)부터 하나씩 덜어내며 다시 시도한다. 저장소가
 * 아예 없으면(사생활 보호 모드) 덜어내지 않는다 - 그때 덜어내면 쓸 수 있는 화면의
 * 목록까지 비워진다.
 */
function storeArchive(list: ArchivedGame[]): ArchivedGame[] {
  if (!safeStore()) return list;
  let kept = list;
  while (kept.length > 0 && !writeStored("games", kept)) kept = kept.slice(0, -1);
  return kept;
}

export function useArchive(): [ArchivedGame[], Dispatch<SetStateAction<ArchivedGame[]>>] {
  const [games, setGames] = useState<ArchivedGame[]>(() =>
    readArchive(readStored<unknown>("games", []))
  );
  useEffect(() => {
    const kept = storeArchive(games);
    // 덜어냈으면 화면의 목록도 저장된 것과 맞춘다.
    if (kept.length !== games.length) setGames(kept);
  }, [games]);
  return [games, setGames];
}
