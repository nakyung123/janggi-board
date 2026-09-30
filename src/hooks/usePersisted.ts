// 브라우저에 남기기(localStorage) — 설정, 두던 판, 기보 목록
//
// 새로고침할 때마다 급수·시계·규칙이 처음으로 돌아가면 한 판 두려고 매번 같은 것을
// 다시 고르게 된다. 두던 판이 새로고침에 날아가는 것은 더 아깝다. 그래서 고른 값과
// 판을 그 브라우저에 남긴다. 키는 모두 "janggi:" 로 시작한다.
//
//   usePersisted       설정 하나(쪽·급수·시계·규칙·복기 깊이·판 뒤집기·소리)
//   readStored/writeStored  두던 판(janggi/savedGame.ts)과 기보 목록(hooks/useArchive.ts)
//
// 저장이 막혀 있는 브라우저(사생활 보호 모드, 저장 차단)에서도 앱은 그냥 돌아야
// 한다. 그래서 읽기·쓰기를 전부 감싸고, 실패하면 조용히 기본값으로 간다.
//
// 읽어온 값은 믿지 않는다. 사람이 직접 고칠 수 있는 자리이고, 옛 판에서 남긴 값이
// 지금은 없는 급수일 수도 있다. 그래서 값마다 accept 로 "지금도 쓸 수 있는 값인지"
// 를 묻고, 아니면 기본값으로 되돌린다. 이상한 값이 들어가도 다음 실행에서 저절로 낫는다.

import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

/** 다른 앱과 섞이지 않게. */
const PREFIX = "janggi:";

/** localStorage 와 같은 모양이면 무엇이든 받는다 (테스트에서 가짜를 넣는다). */
export interface StoreLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * 쓸 수 있는 저장소를 준다. 없으면 null.
 *
 * 접근 자체가 예외를 던지는 경우가 있다(저장 차단). 그래서 typeof 검사만으로는
 * 부족하고 실제로 한 번 만져봐야 한다.
 */
export function safeStore(): StoreLike | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const probe = PREFIX + "__probe";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * 저장해 둔 값을 읽는다. 없거나 깨졌거나 지금 쓸 수 없는 값이면 fallback.
 *
 * accept 는 "이 값이 지금도 쓸 수 있는가" 를 묻는다. 예를 들어 급수 id 는
 * 사다리에 아직 그 id 가 있는지, 스레드 수는 이 기기에서 말이 되는 수인지.
 */
export function readStored<T>(
  key: string,
  fallback: T,
  accept?: (value: unknown) => boolean,
  store: StoreLike | null = safeStore()
): T {
  if (!store) return fallback;
  try {
    const raw = store.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (accept && !accept(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

/**
 * 값을 남긴다. 실패해도 조용히 넘어간다 — 저장이 안 된다고 대국이 멈추면 안 된다.
 *
 * 남겼는지는 돌려준다. 대부분은 보지 않지만, 기보 목록처럼 커질 수 있는 값은
 * 저장 공간이 차면 오래된 것을 덜어내고 다시 남겨야 해서 알아야 한다.
 */
export function writeStored(
  key: string,
  value: unknown,
  store: StoreLike | null = safeStore()
): boolean {
  if (!store) return false;
  try {
    store.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    // 저장 공간이 찼거나 막혀 있다. 이번 판은 그냥 둔다.
    return false;
  }
}

/**
 * useState 와 똑같이 쓰되, 값이 브라우저에 남는다.
 *
 * accept 는 처음 읽을 때 한 번만 쓰이므로 인라인 함수로 넘겨도 괜찮다.
 */
export function usePersisted<T>(
  key: string,
  initial: T,
  accept?: (value: unknown) => boolean
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readStored(key, initial, accept));

  useEffect(() => {
    writeStored(key, value);
  }, [key, value]);

  return [value, setValue];
}
