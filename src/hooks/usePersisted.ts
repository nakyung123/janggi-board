// 설정을 브라우저에 남기기
//
// 새로고침할 때마다 급수·시계·규칙이 처음으로 돌아가면, 한 판 두려고 매번
// 같은 것을 다시 고르게 된다. 고른 값은 그 브라우저에 남겨 둔다.
//
// 남기는 것은 '설정' 뿐이다. 두던 판이나 기보는 남기지 않는다. 판까지 되살리면
// 어제 만지다 만 이상한 국면이 이유도 없이 떠 있게 된다. 새로 열면 새 판이고,
// 다만 손잡이는 어제 맞춰둔 자리에 있다.
//
// 저장이 막혀 있는 브라우저(사생활 보호 모드, 저장 차단)에서도 앱은 그냥 돌아야
// 한다. 그래서 읽기·쓰기를 전부 감싸고, 실패하면 조용히 기본값으로 간다.
//
// 읽어온 값은 믿지 않는다. 사람이 직접 고칠 수 있는 자리이기도 하고, 예전 판에서
// 저장해 둔 값이 지금은 없는 급수일 수도 있다. 그래서 값마다 accept 로 "지금도
// 쓸 수 있는 값인지" 를 묻고, 아니면 기본값으로 되돌린다. 이렇게 하면 이상한
// 값이 들어가도 다음 실행에서 저절로 낫는다.

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

/** 값을 남긴다. 실패해도 조용히 넘어간다 — 저장이 안 된다고 대국이 멈추면 안 된다. */
export function writeStored(
  key: string,
  value: unknown,
  store: StoreLike | null = safeStore()
): void {
  if (!store) return;
  try {
    store.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // 저장 공간이 찼거나 막혀 있다. 이번 판은 그냥 둔다.
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
