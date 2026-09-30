// 한국어 조사 처리
//
// "초가 / 한이" 처럼 앞 글자의 받침 유무에 따라 조사가 갈린다.
// 진영 이름을 문장에 끼워 넣는 곳이 여러 군데라 여기 모아둔다.

/**
 * 숫자로 끝나는 말의 받침.
 *
 * 기보 표기는 "73졸63" 처럼 숫자로 끝난다. 읽을 때는 숫자의 소리를 따르므로
 * 3(삼)·6(육)은 받침이 있고 2(이)·4(사)는 없다. 이걸 빼먹으면 복기 설명이
 * "최선은 63 였습니다" 로 나간다. "63이었습니다" 가 맞다.
 */
const DIGIT_HAS_FINAL: Record<string, boolean> = {
  "0": true, // 영
  "1": true, // 일
  "2": false, // 이
  "3": true, // 삼
  "4": false, // 사
  "5": false, // 오
  "6": true, // 육
  "7": true, // 칠
  "8": true, // 팔
  "9": false, // 구
};

/** 마지막 글자에 받침이 있는지 */
export function hasFinalConsonant(word: string): boolean {
  const last = word.trim().slice(-1);
  if (!last) return false;
  if (last in DIGIT_HAS_FINAL) return DIGIT_HAS_FINAL[last];
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
/** "…이었습니다 / …였습니다" */
export const 이었였 = (w: string) => josa(w, "이었", "였");

/**
 * "…으로 / …로". ㄹ 받침 뒤에는 받침이 있어도 '로' 다("길로", "11로").
 * 숫자는 소리를 따라 1(일)·7(칠)·8(팔)이 ㄹ 받침이다. "43졸33으로", "43졸31로".
 */
export function 으로(word: string): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  const rieul =
    (last !== "" && "178".includes(last)) ||
    (code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 8);
  return word + (hasFinalConsonant(word) && !rieul ? "으로" : "로");
}
