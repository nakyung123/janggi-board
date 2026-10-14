// 우리 서버와 말하는 유일한 자리 - 로그인 상태 · 기보 올리기 · 로그아웃
//
// 주소를 `/api/` 로 시작하는 까닭은 CSP 의 `connect-src 'self'` 다. 그 뒤는 이 앱이
// 아니라 기보·측정 서버이고, 배포본에서는 `vercel.json` 의 되돌림이, 로컬에서는
// `vite.config.ts` 의 proxy 가 넘긴다. 둘 중 하나라도 빠지면 그쪽에서만 안 간다.
// `src/report/events.ts` 와 같은 길이다.

import type { ArchivedGame } from "../janggi/archive";

const BASE = "/api";

/**
 * 답을 얼마나 기다리나.
 *
 * 서버는 쉬다 깨어나는 데 몇 초 걸린다(무료 한도라 늘 깨어 있게 두지 않는다).
 * 기다리지 않으면 **첫 올리기가 거의 늘 실패**한다.
 */
const TIMEOUT = 20_000;

/**
 * CSRF 토큰. 서버가 쿠키로 주고, 우리가 머리글로 되돌려 줘야 쓰기가 통한다. 읽을 수
 * 있는 쿠키다(HttpOnly 가 아니다) - 그래야 이 일이 된다.
 *
 * **토큰 없이 보내면 404 가 온다.** 서버가 거절을 404 로 바꾸기 때문에 "그런 주소가
 * 없다" 처럼 보인다. 서버 쪽 검사를 만들 때 그걸로 한참 헤맸다.
 */
const CSRF_COOKIE = "XSRF-TOKEN";
const CSRF_HEADER = "X-XSRF-TOKEN";

/**
 * 로그인하러 가는 주소.
 *
 * **fetch 로는 안 된다.** 구글 동의 화면을 사람이 봐야 하므로 쪽 전체가 옮겨갔다
 * 돌아온다. 그래서 단추가 아니라 링크로 둔다.
 */
export const LOGIN_PATH = `${BASE}/oauth2/authorization/google`;

/** 서버가 거절했다. `message` 는 서버가 준 한국어 설명이다. */
export class ServerError extends Error {}

function csrfToken(): string | null {
  // "a=1; b=2" 에서 찾는다. 토큰 값에 '=' 가 들어갈 수 있어 첫 '=' 에서만 끊는다.
  for (const part of document.cookie.split("; ")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq) === CSRF_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1));
    }
  }
  return null;
}

/** 서버가 준 까닭. 화면에 그대로 내보낼 수 있게 **한국어로만** 돌려준다. */
async function reason(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === "string" && body.detail) return body.detail;
  } catch {
    // 본문이 JSON 이 아닐 수 있다. 그때는 아래 한 줄로 답한다.
  }
  return `서버가 받지 않았습니다. (${res.status})`;
}

function read(path: string): Promise<Response> {
  return fetch(BASE + path, { signal: AbortSignal.timeout(TIMEOUT) });
}

/**
 * 쓰기. 토큰이 없으면 읽기를 한 번 해서 받아 온다.
 *
 * 첫 쓰기가 바로 올 수 있다 - 쪽을 열고 바로 한 판 끝내는 경우다. 그때 토큰이 없으면
 * 그 한 번이 영문도 모르고 404 가 된다.
 */
async function write(path: string, body?: unknown): Promise<Response> {
  let token = csrfToken();
  if (!token) {
    await read("/me").catch(() => undefined);
    token = csrfToken();
  }

  const headers: Record<string, string> = {};
  if (token) headers[CSRF_HEADER] = token;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  return fetch(BASE + path, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT),
  });
}

/** 지금 로그인되어 있나. 이 주소는 로그인하지 않아도 열린다 - 거절이 아니라 false 로 답한다. */
export async function fetchLoginState(): Promise<boolean> {
  const res = await read("/me");
  if (!res.ok) throw new ServerError(await reason(res));
  const body = (await res.json()) as { loggedIn?: unknown };
  return body.loggedIn === true;
}

/**
 * 판 하나를 올린다. 같은 판 번호면 서버가 덮어쓴다 - 복기를 돌린 뒤 다시 올리는 길이다.
 *
 * **판을 그대로 보낸다.** `ArchivedGame` 의 칸 이름이 서버가 받는 이름과 같게 맞춰져
 * 있다. 다만 서버는 **모르는 칸을 조용히 버리므로**, 여기에 칸을 하나 더하는 날
 * 서버 쪽(`GameUpload`)도 같이 고쳐야 한다. 판의 내용(`history`·`reviewed`)은 모양을
 * 보지 않고 통째로 보관하므로 그쪽은 괜찮다.
 *
 * @returns 서버가 매긴 번호
 */
export async function uploadGame(game: ArchivedGame): Promise<number> {
  const res = await write("/games", game);
  if (res.status === 404) {
    // 로그인이 풀렸거나 토큰이 없다. 서버는 둘을 가르지 않는다(가르면 "거기 뭔가
    // 있다" 를 알려주는 셈이다).
    throw new ServerError("로그인이 풀려 기보를 올리지 못했습니다.");
  }
  if (!res.ok) throw new ServerError(await reason(res));
  const body = (await res.json()) as { id?: unknown };
  if (typeof body.id !== "number") throw new ServerError("서버가 번호를 주지 않았습니다.");
  return body.id;
}

/** 로그아웃. 서버가 쿠키를 지운다. */
export async function logout(): Promise<void> {
  const res = await write("/logout");
  if (!res.ok) throw new ServerError(await reason(res));
}
