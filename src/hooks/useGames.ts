// 기보 탭의 상태 — 지난 판 목록, 연 판, 파일 넣고 빼기
//
// App 이 들고 있던 것 일곱(목록·연 판·쪽·오류·방금 넣은 판·보는 수·뒤집기)을 한데
// 모았다. 일곱이 늘 같이 움직인다 - 판을 열면 보는 수가 마지막으로 가고 쪽 오류가
// 지워지고, 탭을 옮기면 일곱이 모두 처음으로 돌아간다. 흩어 두면 그중 하나를
// 빠뜨리는 것이 버그가 된다.
//
// 여기 없는 것: '지금 화면에 떠 있는 판' 을 고르는 일(대국 탭이냐 기보 탭이냐)은
// App 이 한다. 이 훅은 기보 탭 안의 일만 안다.

import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { JanggiEngine } from "../engine/engine";
import type { Variant } from "../engine/types";
import { isVariant } from "../engine/types";
import type { ArchivedGame } from "../janggi/archive";
import { upsertGame } from "../janggi/archive";
import { movesOf } from "../janggi/history";
import { downloadRecord, gameOfRecord, readRecordFile, recordOfGame } from "../janggi/record";
import { noteTrouble } from "../report/errors";
import { useArchive } from "./useArchive";

interface Options {
  /** 기보 탭을 보고 있는지. 아니면 연 판이 없는 것으로 친다. */
  active: boolean;
  /** 복기가 도는 중. 그동안에는 목록을 건드리지 않는다(엔진을 복기가 쥐고 있다). */
  busy: boolean;
  engine: JanggiEngine | null;
  /** 파일에 적힌 규칙이 모르는 것일 때 대신 쓸 규칙. */
  variant: Variant;
  /** 알림 한 줄(화면 읽기 프로그램이 읽는다). */
  onLoaded: (message: string) => void;
}

export interface GamesState {
  games: ArchivedGame[];
  setGames: Dispatch<SetStateAction<ArchivedGame[]>>;
  /** 연 판. 목록을 보고 있거나 다른 탭이면 null. */
  openGame: ArchivedGame | null;
  /** 목록 화면인지(기보 탭이면서 연 판이 없다). */
  listView: boolean;
  page: number;
  setPage: (page: number) => void;
  /** 파일을 못 읽은 까닭. 목록 제목 아래에 남는다. */
  error: string | null;
  setError: (error: string | null) => void;
  /** 방금 넣은 판. 그 카드가 3초 동안 도드라진다. */
  freshId: string | null;
  /** 연 판에서 보고 있는 수. 판 길이를 넘지 않게 눌러 둔다. */
  cursor: number;
  setCursor: Dispatch<SetStateAction<number>>;
  /** 연 판은 따로 뒤집는다. 대국 탭의 뒤집기는 그대로 둔다. */
  flipped: boolean;
  flip: () => void;
  /** 한 판을 연다. 열었으면 그 판을, 못 열면 null 을 돌려준다(App 이 나머지 뒷정리를 한다). */
  open: (id: string) => ArchivedGame | null;
  close: () => void;
  /** 탭을 옮길 때. 목록 첫 쪽으로 되돌린다. */
  reset: () => void;
  load: (file: File) => Promise<void>;
  save: () => void;
}

export function useGames(options: Options): GamesState {
  const { active, busy, engine, variant, onLoaded } = options;

  const [games, setGames] = useArchive();
  /** 연 판의 id. null 이면 목록을 보여준다. */
  const [openId, setOpenId] = useState<string | null>(null);
  /** 목록에서 보던 쪽. 한 판을 열었다가 '목록으로' 돌아오면 이 쪽으로 온다. */
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const openGame = useMemo(
    () => (active && openId ? (games.find((g) => g.id === openId) ?? null) : null),
    [active, openId, games]
  );

  // 방금 넣은 판의 카드는 3초 동안 도드라진다(GameList).
  useEffect(() => {
    if (!freshId) return;
    const t = window.setTimeout(() => setFreshId(null), 3000);
    return () => window.clearTimeout(t);
  }, [freshId]);

  /** 연 판을 그 판의 규칙으로 본다. 파일에 적힌 규칙이 모르는 것이면 지금 규칙으로. */
  const variantOf = (game: ArchivedGame): Variant =>
    isVariant(game.variant) ? game.variant : variant;

  /**
   * 파일로 들어온 판의 수가 모두 규칙에 맞는지 엔진에 묻는다. 틀린 수가 있으면
   * 그 수를 들어 Error 를 던진다.
   *
   * 규칙에 맞지 않는 수가 하나라도 있으면 목록에 넣지 않는다. 화면은 그 수를 둔 판을
   * 그리는데 엔진은 그 수를 받지 않고 앞 국면에 머물러서, 장군·복기가 화면과 다른 판을
   * 두고 말한다.
   */
  async function checkMoves(game: ArchivedGame): Promise<void> {
    if (!engine) throw new Error("엔진이 아직 준비되지 않았습니다.");
    const bad = await engine.firstIllegalMove(
      variantOf(game),
      game.history[0].fen,
      movesOf(game.history)
    );
    if (bad !== null) {
      throw new Error(
        `${bad + 1}번째 수(${game.history[bad + 1].notation})가 규칙에 맞지 않습니다.`
      );
    }
  }

  return {
    games,
    setGames,
    openGame,
    listView: active && !openGame,
    page,
    setPage: (next) => {
      setPage(next);
      setError(null);
    },
    error,
    setError,
    freshId,
    // 연 판보다 뒤를 가리키고 있으면 눌러 준다(복기가 판을 갈아 끼울 때 생길 수 있다).
    cursor: openGame ? Math.min(cursor, openGame.history.length - 1) : cursor,
    setCursor,
    flipped,
    flip: () => setFlipped((f) => !f),

    open: (id) => {
      const game = games.find((g) => g.id === id);
      if (!game || busy) return null;
      setOpenId(game.id);
      // 끝난 모양부터 보이도록 마지막 수에 선다. 내가 잡은 쪽이 아래로 오게 뒤집는다.
      setCursor(game.history.length - 1);
      setFlipped(game.mySide === "han");
      setError(null);
      return game;
    },

    close: () => {
      if (busy) return;
      setOpenId(null);
    },

    reset: () => {
      setOpenId(null);
      setPage(0);
      setError(null);
    },

    /**
     * 파일로 저장해 둔 기보를 목록 맨 위(첫 쪽)에 한 판으로 넣는다. 두던 판은 그대로다.
     * 넣은 판의 카드가 잠깐 도드라지고, 못 넣으면 목록 제목 아래에 까닭이 남는다.
     */
    load: async (file) => {
      setError(null);
      try {
        const game = gameOfRecord(await readRecordFile(file));
        await checkMoves(game);
        setGames((list) => upsertGame(list, game));
        setPage(0);
        setFreshId(game.id);
        onLoaded(`기보를 불러왔습니다. ${game.history.length - 1}수.`);
      } catch (err) {
        // 장부에 적고(콘솔에 날것이 남는다) 사람에게 보일 말만 화면에 쓴다.
        // 우리가 쓴 한국어 글이면 그대로, 내부 사정이 섞였으면 오류 코드로 바뀐다.
        setError(`기보를 불러오지 못했습니다. ${noteTrouble("기보 불러오기", err).message}`);
      }
    },

    save: () => {
      if (openGame) downloadRecord(recordOfGame(openGame));
    },
  };
}
