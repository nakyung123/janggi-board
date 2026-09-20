// 한국어 조사 처리
//
// "초가 / 한이" 처럼 앞 글자의 받침 유무에 따라 조사가 갈린다.
// 진영 이름을 문장에 끼워 넣는 곳이 여러 군데라 여기 모아둔다.

/** 마지막 글자에 받침이 있는지 */
export function hasFinalConsonant(word: string): boolean {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  // 한글 음절 영역 밖이면 받침이 없는 것으로 친다
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

/**
 * 받침에 맞는 조사를 골라 붙인다.
 * @example josa("초", "이", "가") // "초가"
 * @example josa("한", "이", "가") // "한이"
 */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
  return word + (hasFinalConsonant(word) ? withFinal : withoutFinal);
}

export const 이가 = (w: string) => josa(w, "이", "가");
export const 은는 = (w: string) => josa(w, "은", "는");
export const 을를 = (w: string) => josa(w, "을", "를");
