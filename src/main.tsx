// 앱 진입점 — #root 에 App 을 붙이고 스타일(styles/index.css)을 읽는다.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { inject } from "@vercel/analytics";
import { injectSpeedInsights } from "@vercel/speed-insights";
import App from "./App";
import { ErrorBoundary } from "./components/layout/ErrorBoundary";
import { watchTroubles } from "./report/errors";
import "./styles/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root 를 찾지 못했습니다.");

// 아무도 받지 않은 오류(타이머 안, 깨진 약속)까지 장부에 담는다. 오류 경계는
// 그리는 도중의 것만 본다.
watchTroubles();

/*
 * 방문자 수 집계.
 *
 * 우리는 서버가 없어서 누가 왔다 갔는지 알 길이 없다. 쓰는 사람이 있는지 없는지
 * 모르면 고칠 데도 못 고른다. 이것이 유일한 눈이다.
 *
 * 왜 이 도구인가 - 스크립트가 **우리 주소에서** 나온다(/_vercel/insights/script.js).
 * 바깥 도메인을 하나라도 열면 CSP 의 connect-src 'self' 를 풀어야 하고, 그러면
 * "우리 서버하고만 이야기한다" 는 울타리가 그 틈만큼 헐거워진다(DECISIONS.md 의
 * '가져올 수 있는 곳을 우리 서버 하나로 묶는다'). 지금 CSP 그대로 통과한다.
 *
 * 쿠키를 심지 않고 개인을 알아보지도 않는다. 세는 것은 쪽을 몇 번 열었나까지다.
 *
 * 대시보드에서 Web Analytics 를 켜 두어야 실제로 쌓인다. 안 켜져 있으면 이 줄은
 * 아무 일도 하지 않는다 - 에러가 나지는 않는다.
 */
inject();

/*
 * 얼마나 빨리 보이는가를 **실제 사용자 기기에서** 잰다.
 *
 * 위의 집계는 "몇 번 열렸나" 까지만 센다. 그런데 우리가 모르는 것 중에 "쪽은 열렸는데
 * 엔진이 뜨기 전에 나갔다" 가 있고, 그게 고장인지 **느려서인지**를 가를 수가 없었다.
 * 6MB 를 내려받는 앱이라 느림이 진짜 후보다.
 *
 * 내 컴퓨터에서 재는 것과 다르다. 쓰는 사람의 68%가 폰이고, 느린 쪽 사람이 정확히
 * 우리가 걱정하는 사람이다. 그래서 평균이 아니라 **p75(느린 쪽 네 명 중 한 명)** 로
 * 본다 - 평균은 90명이 빠르면 10명이 20초를 기다려도 "괜찮네" 가 된다.
 *
 * inject() 와 같은 까닭으로 고른다 - 스크립트가 우리 주소에서 나온다
 * (/_vercel/speed-insights/script.js). CSP 를 풀지 않는다.
 *
 * 대시보드에서 Speed Insights 를 켜 두어야 쌓인다. Hobby 는 달 10,000 건, 7일 보관이다.
 */
injectSpeedInsights();

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
