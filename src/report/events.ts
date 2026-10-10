// 측정 — 앱 안에서 무슨 일이 있었는지 밖으로 알린다
//
// 쌓아 두었다가 쪽이 가려질 때 `/api/events` 로 보낸다. 그 주소 뒤는 우리 서버가 아니라
// **측정 서버**(janggi-events)이고, 실제로는 `vercel.json` 의 되돌림이, 로컬에서는
// `vite.config.ts` 의 proxy 가 넘긴다. 밖으로 나가는 자리는 아래 send() 하나뿐이다.
//
// 왜 이것부터 하는가 - 2026-10-07 디시 글로 34명이 들어왔는데 제보한 사람은 1명이고,
// 그마저 폼이 아니라 갤러리 댓글이었다. 우리는 **제보 안 한 33명에게 무슨 일이 있었는지
// 모른다.** 쪽을 연 것까지는 Vercel 이 세지만 그 뒤는 전부 물음표다.

import { APP_VERSION } from "../updates/log";
import { browserLabel, inAppLabel, systemLabel } from "./feedback";

/*
 * 1단계에서 답할 질문은 **하나**다.
 *
 *   들어온 100번 중에, 몇 번이 판을 보고 / 몇 번이 고장나고 / 몇 번이 소식 없이 사라지나?
 *
 * 그래서 이벤트가 셋뿐이다. 나머지(새 대국·첫 수·판 끝·복기)는 이 길이 끝까지 뚫린 뒤에
 * 더한다. 여덟 개를 다 만들어 놓고 안 들어오면 어디가 막힌 건지 모른다.
 */
type EventName = "app_open" | "engine_ready" | "engine_failed";

/*
 * 모든 이벤트에 붙는 것.
 *
 * **격리 여부·코어·메모리가 왜 공통인가** - 처음에는 실패한 이벤트에만 넣으려 했다.
 * 그러면 "메모리 4GB 기기가 잘 깨지나?" 에 답할 수 없다. 실패한 쪽에만 메모리가 있으면
 * "실패한 사람 중 4GB 가 많다" 까지밖에 못 가는데, **원래 4GB 기기가 많으면** 그건 아무
 * 말도 아니다. 성공한 쪽에도 같은 값이 있어야 **분모가 생긴다.**
 */
interface Common {
  /** 쪽을 열 때마다 새로 만든다. 쿠키가 아니고 사람을 이어 붙이지 않는다. */
  sid: string;
  ver: string;
  browser: string;
  os: string | null;
  /** 앱 안에서 열었으면 그 앱 이름. 지금 1순위 용의자다. */
  inApp: string | null;
  isolated: boolean;
  cores: number | null;
  memory: number | null;
  screen: string;
  /** 보내는 쪽 시각. 사용자 시계는 틀릴 수 있어 참고용이고, 기준은 서버가 받은 시각이다. */
  at: number;
  /** 내 손에서 난 것인지. 하루 방문이 수십인데 내가 열 번 새로고침하면 숫자가 망가진다. */
  env: "dev" | "prod";
}

interface Event extends Common {
  name: EventName;
  /** 이벤트마다 다른 것. 모양이 자주 바뀔 자리라 한 칸에 몰아 둔다. */
  data: Record<string, unknown>;
}

/*
 * 쪽을 열 때마다 새로 만드는 번호.
 *
 * sessionStorage 에 두면 새로고침해도 남아 사람을 이어 붙이게 된다. 모듈 변수로 두면
 * **새로 열 때마다 새 번호**가 된다 - 우리가 답하려는 질문("들어온 것 중 몇 %가
 * 실패하나")에는 방문 단위로 충분하고, 사람 단위 재방문은 Vercel 이 이미 센다.
 *
 * 짧게 자르는 까닭은 나중에 제보에 적어 보낼 수도 있어서다. 길면 아무도 안 옮겨 적는다.
 */
const sid = Math.random().toString(36).slice(2, 10);

/*
 * 사람이 아닌 것은 아예 안 보낸다.
 *
 * 검색 크롤러 중에는 자바스크립트를 도는 것이 있다. 그러면 app_open 은 찍히고 엔진은
 * 당연히 안 뜬다 - **"소식 없음" 칸에 사람이 아닌 것이 섞인다.** 2026-10-02 에 검색
 * 등록까지 했으니 앞으로 더 온다.
 */
function isBot(): boolean {
  if (typeof navigator === "undefined") return true;
  if (navigator.webdriver) return true;
  return /bot|crawl|spider|slurp|headless|lighthouse|preview/i.test(navigator.userAgent);
}

/** 어디서 들어왔나. 호스트만 본다 - 주소 전체는 사람을 알아보는 데 쓰일 수 있다. */
function referrerHost(): string {
  try {
    if (!document.referrer) return "";
    const h = new URL(document.referrer).host;
    return h === location.host ? "내부" : h;
  } catch {
    return "";
  }
}

function common(): Common {
  const ua = navigator.userAgent;
  // deviceMemory 와 connection 은 표준이 아니라 타입에 없다(크로미움 계열에만 있다).
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    sid,
    ver: APP_VERSION,
    browser: browserLabel(ua),
    os: systemLabel(ua),
    inApp: inAppLabel(ua),
    isolated: crossOriginIsolated,
    cores: navigator.hardwareConcurrency || null,
    memory: nav.deviceMemory ?? null,
    screen: `${window.innerWidth}x${window.innerHeight}`,
    at: Date.now(),
    env: /^(localhost|127\.|\[::1\])/.test(location.hostname) ? "dev" : "prod",
  };
}

/*
 * 모았다가 한 번에 보낸다.
 *
 * 한 번 열 때 두세 개가 생기는데 그때마다 말을 걸면 낭비다. 그리고 **창이 닫히는 순간에
 * 보내야** 하는 것이 있어서, 쌓아 두었다가 쪽이 가려질 때 비운다.
 */
const queue: Event[] = [];

/**
 * 보낼 주소. 같은 출처라야 CSP 의 `connect-src 'self'` 를 지난다.
 *
 * `/api/` 뒤는 **우리 서버가 아니라 측정 서버**다. 실제로는 `vercel.json` 의 되돌림이,
 * 로컬에서는 `vite.config.ts` 의 proxy 가 넘긴다. 둘 중 하나라도 빠지면 그쪽에서만
 * 조용히 안 간다.
 */
const ENDPOINT = "/api/events";

/** 서버가 한 번에 받는 최대 건수. 넘기면 **묶음 전체**를 거절한다. */
const MAX_PER_REQUEST = 50;

/*
 * 밖으로 내보내는 **유일한 자리**.
 *
 * `sendBeacon` 을 쓰는 까닭 - 평범한 `fetch` 는 보내는 중에 창이 닫히면 취소되는데,
 * 하필 그 사람들(열었다가 그냥 닫은 사람)이 제일 알고 싶은 쪽이다. `sendBeacon` 은
 * 브라우저에 맡기고 떠나서, 쪽이 사라져도 브라우저가 마저 보낸다.
 *
 * 돌려받는 것을 읽지 않는다. 읽을 수도 없다 - 그래서 서버가 204(본문 없음)를 준다.
 */
function send(batch: Event[]): void {
  for (let i = 0; i < batch.length; i += MAX_PER_REQUEST) {
    post(batch.slice(i, i + MAX_PER_REQUEST));
  }
}

function post(events: Event[]): void {
  const body = JSON.stringify({ events });

  // Blob 으로 감싸서 종류를 json 으로 붙인다. 문자열을 그냥 주면 브라우저가 text/plain
  // 으로 보내고, 서버는 그것을 JSON 으로 읽지 않아 415 로 거절한다.
  const blob = new Blob([body], { type: "application/json" });

  if (navigator.sendBeacon(ENDPOINT, blob)) return;

  // false 가 오는 때 - 브라우저의 대기열이 찼거나 본문이 너무 클 때다. 드물지만
  // **조용히 잃지는 않는다.** keepalive 는 쪽이 사라져도 보내 달라는 뜻이라
  // sendBeacon 과 성질이 같다.
  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    /* 측정 때문에 앱이 멈추지 않는다 */
  });
}

function flush(): void {
  if (!queue.length) return;
  send(queue.splice(0, queue.length));
}

/**
 * 한 가지를 적어 둔다. 보내는 것은 나중에 한꺼번에.
 *
 * **앱이 이것 때문에 느려지거나 멈추면 안 된다.** 측정은 거드는 일이지 하는 일이 아니다.
 * 그래서 무슨 일이 생겨도 삼키고 넘어간다.
 */
export function track(name: EventName, data: Record<string, unknown> = {}): void {
  try {
    if (isBot()) return;
    queue.push({ name, ...common(), data });
  } catch {
    /* 측정이 앱을 깨뜨리지 않는다 */
  }
}

/**
 * 측정을 시작한다. 앱이 뜰 때 한 번 부른다.
 *
 * `unload` 를 쓰지 않는 까닭 - **모바일 사파리에서 안 불린다.** 폰에서는 홈 버튼을
 * 누르거나 앱을 바꾸면 그 이벤트 없이 그냥 사라진다. 쓰는 사람의 68%가 폰이라
 * 이걸 틀리면 제일 중요한 사람들을 통째로 놓친다.
 */
export function startTracking(): void {
  if (isBot()) return;

  const conn = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
  track("app_open", { ref: referrerHost(), conn: conn?.effectiveType ?? null });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  // 되돌아오지 않는 이동(뒤로 가기 캐시에 안 들어가는 경우)까지 받는다.
  window.addEventListener("pagehide", flush);
}
