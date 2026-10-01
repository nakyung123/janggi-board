// 오류 장부 — 터진 자리를 나중에 찾을 수 있게
//
// 이 앱에는 서버가 없다. 그래서 "서버 로그를 본다" 는 선택지가 없고, 무언가 잘못되면
// 아는 방법이 **사용자가 말해 주는 것** 하나뿐이다. 그런데 사용자가 말해 줄 수 있는 것은
// "안 돼요" 가 전부다.
//
// 그래서 터진 자리마다 짧은 코드를 붙인다.
//
//   화면    "알 수 없는 오류입니다. (E-7F3A)"   ← 사람이 옮겨 적을 수 있는 만큼만
//   콘솔    [장기] E-7F3A 기보 불러오기: Cannot read properties of undefined…
//   제보    마지막 오류: E-7F3A 기보 불러오기 (2분 전)
//
// 코드는 **내용에서 만든다**(무작위가 아니다). 같은 버그를 세 사람이 겪으면 코드가 셋 다
// 같아서, 제보 세 건이 한 자리를 가리킨다는 것을 바로 안다.

/** 한 번 터진 일. */
export interface Trouble {
  /** 어디서 터졌는지. 사람이 읽을 짧은 말. 예: "기보 불러오기" */
  where: string;
  /** 짧은 코드. 제보에 이것만 적혀 와도 자리를 찾는다. 예: "E-7F3A" */
  code: string;
  /** 화면에 그대로 보여도 되는 말. 내부 사정이 섞여 있으면 코드로 바꾼다. */
  message: string;
  /** 던져진 값에서 꺼낸 날것. 콘솔에만 간다. */
  detail: string;
  at: number;
}

/**
 * 최근 것만 남긴다. 이 장부를 읽는 때는 제보를 쓰는 때 하나뿐이고, 그때 쓸모 있는 것은
 * 방금 일이다. 끝없이 쌓으면 오류가 반복될 때 메모리를 먹는다.
 */
const LIMIT = 10;
const LOG: Trouble[] = [];

/**
 * 우리가 쓴 말인지 가린다.
 *
 * 이 저장소의 오류 글은 전부 한국어다("기보가 아닙니다", "수가 너무 많습니다"). 자바스크립트와
 * 브라우저가 던지는 것은 전부 영어다("Cannot read properties of undefined"). 그래서 한글이
 * 섞였는지만 보면 **우리가 사람에게 하려던 말인지** 갈린다.
 *
 * 투박해 보이지만 Error 를 상속한 새 종류를 만들어 모든 throw 를 바꾸는 것보다 낫다 -
 * 그쪽은 한 군데만 빠뜨려도 조용히 영어가 새어 나간다. 이쪽은 빠뜨릴 곳이 없다.
 */
const HANGUL = /[가-힣]/;

/** 글자에서 네 자리 코드를 만든다(FNV-1a). 같은 오류면 같은 코드다. */
function codeOf(seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return "E-" + (h >>> 0).toString(16).toUpperCase().padStart(8, "0").slice(0, 4);
}

/** 던져진 값에서 날것의 말을 꺼낸다. */
function detailOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err) ?? String(err);
  } catch {
    return String(err);
  }
}

/**
 * 터진 일을 장부에 적고, 화면에 쓸 수 있는 모양으로 돌려준다.
 *
 * 화면에는 **우리가 쓴 한국어 말만** 그대로 내보낸다. 내부 사정이 섞인 말
 * (`Cannot read properties of undefined`)은 사람에게 아무것도 알려 주지 않으면서 겁만 준다.
 * 그 자리에는 코드를 둔다 - 짧아서 옮겨 적을 수 있고, 받은 쪽은 자리를 찾을 수 있다.
 *
 * 날것은 **콘솔에 남긴다.** 화면에서 가리는 것이지 없애는 것이 아니다.
 */
export function noteTrouble(where: string, err: unknown): Trouble {
  const detail = detailOf(err);
  const ours = HANGUL.test(detail);
  const code = codeOf(where + "|" + detail);
  const trouble: Trouble = {
    where,
    code,
    detail,
    message: ours ? detail : `알 수 없는 오류입니다. (${code})`,
    at: Date.now(),
  };

  LOG.unshift(trouble);
  LOG.length = Math.min(LOG.length, LIMIT);

  // 개발 중에는 스택까지 통째로(어느 줄인지 봐야 한다), 배포본에서는 한 줄로.
  if (import.meta.env.DEV) console.error(`[장기] ${code} ${where}:`, err);
  else console.error(`[장기] ${code} ${where}: ${detail}`);

  return trouble;
}

/** 가장 최근에 터진 일. 없으면 null. */
export function lastTrouble(): Trouble | null {
  return LOG[0] ?? null;
}

/**
 * 제보에 붙일 한 줄. 터진 적이 없으면 빈 글자.
 *
 * 제보는 대개 **터지고 한참 뒤에** 쓴다. 그래서 몇 분 전 일인지도 같이 적는다 -
 * 방금 겪은 일을 말하는 것인지, 아까 일을 말하는 것인지에 따라 찾을 자리가 달라진다.
 */
export function troubleLine(now = Date.now()): string {
  const t = lastTrouble();
  if (!t) return "";
  const 분 = Math.round((now - t.at) / 60000);
  const 언제 = 분 < 1 ? "방금" : `${분}분 전`;
  return `마지막 오류: ${t.code} ${t.where} (${언제})`;
}

/**
 * 오류처럼 올라오지만 오류가 아닌 것.
 *
 * `ResizeObserver loop completed with undelivered notifications` 는 **크기를 재는 콜백이
 * 다시 레이아웃을 바꾸면** 브라우저가 올리는 알림이다. 이 앱은 남은 높이로 판 크기를
 * 정하므로(useBoardFit) 창을 줄이면 흔히 뜬다. 아무것도 깨지지 않는다.
 *
 * 걸러야 하는 까닭 — 이 하나가 장부의 맨 위를 차지하면 **모든 제보에**
 * "마지막 오류: E-9BED 처리되지 않은 오류" 가 붙는다. 받는 쪽은 그것부터 들여다보고
 * 진짜 오류는 그 아래 묻힌다. 소리가 늘 울리면 아무도 소리를 듣지 않는다.
 * 실제로 띄워 보고 알았다.
 */
export function isNoise(message: unknown): boolean {
  return typeof message === "string" && message.startsWith("ResizeObserver loop");
}

/** 장부를 비운다. 테스트에서만 쓴다. */
export function clearTroubles(): void {
  LOG.length = 0;
}

/**
 * 아무도 받지 않은 오류까지 장부에 담는다.
 *
 * try/catch 와 오류 경계는 **자기가 감싼 자리**만 본다. 타이머 안에서 터진 것, 약속
 * (Promise)이 조용히 깨진 것은 둘 다 놓친다. 그런 것이야말로 재현하기 어려워서 코드가
 * 꼭 필요하다. 앱이 뜰 때 한 번 부른다(main.tsx).
 */
export function watchTroubles(target: Window = window): void {
  target.addEventListener("error", (e) => {
    if (isNoise(e.message)) return;
    noteTrouble("처리되지 않은 오류", e.error ?? e.message);
  });
  target.addEventListener("unhandledrejection", (e) => {
    noteTrouble("처리되지 않은 약속", e.reason);
  });
}
