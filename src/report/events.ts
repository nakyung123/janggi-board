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
 * 1단계 질문은 **하나**였다.
 *
 *   들어온 100번 중에, 몇 번이 판을 보고 / 몇 번이 고장나고 / 몇 번이 소식 없이 사라지나?
 *
 * **답이 났다.** 2026-10-11 까지 들어온 아홉 명 중 아홉 명이 엔진이 떴고 `engine_failed`
 * 는 이레 동안 0건이다. 안 깨진다.
 *
 * 그래서 2단계 질문으로 넘어간다 - **그럼 왜 떠나나.** 머문 시간이 6초인 사람과 743초인
 * 사람이 있는데 그 사이에 무엇을 했는지를 몰랐다.
 *
 *   app_open → engine_ready → first_move → game_end → game_start(한 판 더)
 *
 * 처음에 셋만 둔 까닭은 여덟 개를 다 만들어 놓고 안 들어오면 어디가 막힌 건지 모르기
 * 때문이었다. **길이 끝까지 뚫린 것을 확인했으니** 이제 한 번에 더한다.
 *
 * **새 이름을 더할 때는 서버를 먼저 배포한다.** 서버에 없는 이름은 400 으로 거절되는데
 * 우리는 답을 안 읽어서 조용히 버려진다.
 */
type EventName =
  | "app_open"
  | "engine_ready"
  | "engine_failed"
  | "game_start"
  | "first_move"
  | "game_end"
  | "review_open";

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
  /** 격리됐나. **모르는 경우가 있다** - 아래 isolatedNow() 에 까닭이 있다. */
  isolated: boolean | null;
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

/*
 * 진짜 사람이 오는 주소. **이것만 prod 로 센다.**
 *
 * 처음에는 "localhost 가 아니면 prod" 였는데, 그러면 **Vercel 미리보기가 prod 로
 * 들어간다.** 미리보기는 내가 고치는 중에 여는 자리라, 그 숫자가 실제 통계에 섞이면
 * "오늘 몇 명 왔나" 를 못 믿게 된다. 하루 방문이 수십인데 내가 스무 번 열면 숫자가
 * 통째로 망가진다.
 *
 * 그래서 **아는 주소만 세고 나머지는 전부 dev** 로 둔다. Vercel 이 자동으로 만들어
 * 주는 다른 별명(janggi-ai-git-main-… 등)으로 들어온 사람은 안 세게 되지만, 그쪽으로
 * 오는 사람은 사실상 없고 **덜 세는 쪽이 더 세는 쪽보다 안전하다.**
 */
const LIVE_HOST = "janggi-ai.vercel.app";

/*
 * 내가 확인하러 들어갈 때 붙이는 표. `?nostats` 가 있으면 무조건 dev 로 센다.
 *
 * **왜 `isBot()` 에 기대지 않나** - 2026-10-10 라이브를 확인할 때 Playwright 의
 * `navigator.webdriver` 가 false 로 나왔다. UA 의 `HeadlessChrome` 만이 걸렀다. 울타리
 * 하나가 운으로 걸린 것이고, 도구가 UA 를 바꾸는 날 나는 모른다 - **오염은 조용하다.**
 * 숫자가 조금 틀린 것은 틀린 줄도 모른다.
 *
 * 그래서 걸러지기를 바라는 대신 **내가 나라고 말하고** 들어간다. 봇을 알아맞히는 일은
 * 끝이 없지만 이것은 운이 끼지 않는다.
 */
const NO_STATS = "nostats";

function currentEnv(): "dev" | "prod" {
  if (new URLSearchParams(location.search).has(NO_STATS)) return "dev";
  return location.hostname === LIVE_HOST ? "prod" : "dev";
}

/*
 * 격리됐는지. **그냥 참조하면 안 된다.**
 *
 * `crossOriginIsolated` 는 사파리 15.2 이전에 아예 정의되지 않은 전역이다. 선언되지
 * 않은 이름을 맨몸으로 읽으면 ReferenceError 가 나고, `track()` 이 그것을 삼킨다 -
 * 그러면 그 기기에서는 **측정이 통째로 안 간다.** 하필 그 기기가 SharedArrayBuffer 가
 * 없어서 엔진이 못 뜨는 쪽이라, **가장 알고 싶은 사람이 안 보이는** 모양이었다.
 * `engine_failed` 가 0건인 것을 "안 깨진다" 로 읽을 수가 없게 된다.
 *
 * 2026-10-13 에 events.ts 테스트를 처음 쓰다가 jsdom 에서 드러났다. 그때까지 이 파일에
 * 테스트가 없어서 아무도 밟지 않았다.
 *
 * `typeof` 는 선언되지 않은 이름에도 던지지 않는다. 없을 때는 거짓이 아니라 **null**
 * 이다 - "격리 안 됨" 과 "모름" 은 다른 말이고, 서버도 그 칸을 비워 둘 수 있다.
 */
function isolatedNow(): boolean | null {
  return typeof crossOriginIsolated === "undefined" ? null : crossOriginIsolated;
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
    isolated: isolatedNow(),
    cores: navigator.hardwareConcurrency || null,
    memory: nav.deviceMemory ?? null,
    screen: `${window.innerWidth}x${window.innerHeight}`,
    at: Date.now(),
    env: currentEnv(),
  };
}

/*
 * 모았다가 한 번에 보낸다. **단 `app_open` 은 예외로 바로 보낸다.**
 *
 * 창이 닫히는 순간에 보내야 하는 것이 있어서 쌓아 두었다가 쪽이 가려질 때 비운다.
 * 그런데 그 방식만 쓰면 **떠나는 것을 못 잡은 사람이 통째로 안 보인다.** 하필 그 사람이
 * 우리가 세려던 사람이다 - 자세한 까닭은 startTracking() 에 적었다.
 */
/*
 * **즉시 보내는 것.** 나머지는 쪽이 가려질 때 묶어서 보낸다.
 *
 * 묶어 보내면 **못 잡고 사라진 사람이 통째로 안 보인다.** 2026-10-11 에 Vercel 집계와
 * 대 보니 쪽이 25번 열렸는데 우리 기록은 13개였다(새로고침과 탭 전환은 아니었다 - 둘 다
 * 확인했다). `app_open` 을 열릴 때 바로 보내 고쳤고, Vercel 과 같은 시점이 되어 바로
 * 대 볼 수 있게 됐다.
 *
 * **2026-10-13 에 깔때기 아래쪽도 같은 병을 앓는 것을 봤다.** 하루 20명이 쪽을 열었는데
 * `engine_ready` 는 16개였다. "느려서 기다리다 떠났다" 로 읽었는데 근거가 없었다 -
 * `app_open` 만 즉시 가고 나머지는 묶음이라, **엔진은 떴지만 묶음이 안 간 사람**과
 * 구별되지 않는다. 폰에서 앱을 강제로 닫거나 탭을 날리면 `pagehide` 가 안 불린다.
 *
 * **셋만 즉시로 바꾸고 나머지는 묶음으로 남긴다.** 전부 바꾸면 격차가 닫힌 것만 알고
 * **얼마나 새고 있었나**를 모른다. 남겨 둔 쪽이 대조군이고, 두 격차의 차이가 곧 묶음
 * 유실률이다. 재고 나면 나머지도 옮길지 정한다.
 *
 * 값은 요청 한 건이다. 하루 20세션이면 40건에서 80건이 되고 무료 한도가 달 200만
 * 건이다. 다만 **문지기 한도(분당 120)에는 더 가까워진다** - 사람이 몰리면
 * `JANGGI_GUARD_LIMIT_PER_MINUTE` 로 배포 없이 올린다.
 */
const NOW: ReadonlySet<EventName> = new Set<EventName>([
  "app_open",
  "engine_ready",
  "engine_failed",
  "first_move",
]);

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
    const event: Event = { name, ...common(), data };

    if (NOW.has(name)) {
      // **flush() 를 부르지 않는다.** 그것은 대기열을 통째로 비우므로, 유실률을 재려고
      // 묶음으로 남겨 둔 대조군까지 같이 나가 버린다. 이 한 건만 보낸다.
      send([event]);
      return;
    }

    queue.push(event);
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
