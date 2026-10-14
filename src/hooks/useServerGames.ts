// 로그인 상태와 "서버에도 남기기" 를 한 곳에서 맡는다.
//
// **판을 저장하는 자리는 둘이다** - 판이 끝날 때(App.tsx)와 복기를 돌린 뒤
// (useGames.ts). 두 군데에 "서버에도 올려라" 를 각각 붙이면 같은 판단이 둘로
// 갈라진다. 그래서 여기서는 **목록이 바뀌는 것만 보고** 올린다. 둘 다 같은 길로
// 처리되고, 서버는 같은 판 번호를 덮어쓴다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ArchivedGame } from "../janggi/archive";
import { fetchLoginState, logout, uploadGame } from "../server/api";
import { noteTrouble } from "../report/errors";
import { usePersisted } from "./usePersisted";

/**
 * 올린 판을 적어 두는 자리. 쪽을 다시 열어도 다시 올리지 않게.
 *
 * <b>"janggi:" 를 붙이지 않는다.</b> `usePersisted` 가 붙인다 - 붙여서 주면
 * `janggi:janggi:uploaded` 가 된다.
 */
const KEY = "uploaded";

/**
 * 판의 지문. **복기를 돌리면 달라져야 한다** - 그래야 덮어쓰기가 한 번 더 간다.
 *
 * 수의 개수와 복기 여부만 본다. 판의 내용 전체를 해시하는 것보다 싸고, 이 둘 말고
 * 바뀌는 칸이 없다(끝난 판이다).
 */
function fingerprint(game: ArchivedGame): string {
  return `${game.history.length}:${game.reviewed ? 1 : 0}`;
}

function isRecord(v: unknown): boolean {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export interface ServerGames {
  /** 로그인되어 있나. 아직 물어보는 중이면 `null` 이다. */
  loggedIn: boolean | null;
  /** 이 판이 서버에도 있나. 표시를 붙일지 정할 때 쓴다. */
  onServer: (id: string) => boolean;
  /** 올리는 중. 단추를 잠그는 데 쓴다. */
  busy: boolean;
  /** 마지막으로 어긋난 일. 한국어다. */
  error: string | null;
  signOut: () => void;
}

export function useServerGames(games: ArchivedGame[]): ServerGames {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [uploaded, setUploaded] = usePersisted<Record<string, string>>(KEY, {}, isRecord);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 앱이 뜰 때 이미 있던 판. **이것이 (ㄷ) 규칙이다** - 로그인한 뒤에 새로 둔 판만
   * 올린다. 로그인은 구글로 쪽을 옮겼다 돌아오는 일이라 앱이 다시 뜨므로, 로그인
   * 전에 둔 판은 여기 들어가 올라가지 않는다. 시각을 적어 둘 필요가 없다.
   */
  const before = useRef<Set<string> | null>(null);
  if (before.current === null) before.current = new Set(games.map((g) => g.id));

  useEffect(() => {
    let 살아있다 = true;
    fetchLoginState()
      .then((yes) => {
        if (살아있다) setLoggedIn(yes);
      })
      .catch((err) => {
        // 서버가 안 뜨거나 못 닿는 때. **로그인 안 된 것으로 둔다** - 로그인 단추가
        // 보이고, 눌러 보면 그때 제대로 된 까닭을 알게 된다.
        if (살아있다) setLoggedIn(false);
        noteTrouble("로그인 상태 확인", err);
      });
    return () => {
      살아있다 = false;
    };
  }, []);

  /** 올려야 할 판. 새로 생긴 판이거나, 올린 뒤 복기가 붙은 판이다. */
  const 올릴것 = useMemo(() => {
    if (loggedIn !== true) return [];
    const 기준선 = before.current;
    return games.filter((g) => !(기준선?.has(g.id) ?? false) && uploaded[g.id] !== fingerprint(g));
  }, [games, loggedIn, uploaded]);

  /**
   * **한 번에 하나씩 올린다.** 서버가 같은 사람의 올리기가 겹치면 거절한다
   * (한도를 세는 동안 끼어들지 못하게 잠그고, 기다리지 않는다). 판이 끝나고 바로
   * 복기를 돌리면 둘이 겹칠 수 있다.
   */
  const 보내는중 = useRef(false);

  useEffect(() => {
    if (보내는중.current || 올릴것.length === 0) return;
    보내는중.current = true;
    setBusy(true);

    void (async () => {
      /*
       * **모아 두었다가 한 번에 적는다.** 한 판 올릴 때마다 적으면 그때마다 다시
       * 그려지고, 그러면 이 효과가 다시 불린다. 그런데 앞의 것이 아직 돌고 있어서
       * 새로 불린 쪽은 그냥 돌아가고, 돌던 쪽은 "그만두라" 는 신호를 받는다.
       * 그 사이에 올라간 판은 **올라갔는데 적히지 않은** 상태가 된다 - 서버에 있는데
       * 화면에는 "이 기기에만 있음" 이 남았다. 2026-10-14 에 로컬에서 그렇게 됐다.
       */
      const 적을것: Record<string, string> = {};
      let 어긋난말: string | null = null;

      try {
        for (const game of 올릴것) {
          await uploadGame(game);
          적을것[game.id] = fingerprint(game);
        }
      } catch (err) {
        // **멈춘다.** 하나가 실패하면 나머지도 같은 까닭일 때가 많다. 다음 판이
        // 끝나면 다시 해 본다 - 그때 이 판들도 같이 올라간다.
        어긋난말 = noteTrouble("기보 올리기", err).message;
      }

      if (Object.keys(적을것).length > 0) {
        setUploaded((before) => ({ ...before, ...적을것 }));
      }
      setError(어긋난말);
      보내는중.current = false;
      setBusy(false);
    })();
  }, [올릴것, setUploaded]);

  const onServer = useCallback((id: string) => uploaded[id] !== undefined, [uploaded]);

  const signOut = useCallback(() => {
    setBusy(true);
    logout()
      .then(() => {
        setLoggedIn(false);
        setError(null);
        // **올린 기록을 지운다.** 다음에 다른 사람이 로그인할 수 있다 - 남의 판을
        // "서버에 있음" 으로 표시하면 거짓이다.
        setUploaded({});
      })
      .catch((err) => setError(noteTrouble("로그아웃", err).message))
      .finally(() => setBusy(false));
  }, [setUploaded]);

  return { loggedIn, onServer, busy, error, signOut };
}
