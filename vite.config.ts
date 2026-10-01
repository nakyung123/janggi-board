/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/*
 * 내보내는 헤더. vercel.json 과 **같은 값을 유지해야 한다.**
 *
 * 개발·미리보기에서만 느슨하면 배포하고 나서야 깨진 것을 본다. 특히 CSP 는 어긋나는
 * 순간 화면이 하얗게 되는 종류라, 여기서 똑같이 겪어 두는 편이 싸다.
 */

// Fairy-Stockfish WASM 은 멀티스레드 탐색에 SharedArrayBuffer 를 쓴다.
// 브라우저가 SharedArrayBuffer 를 열어주려면 아래 두 헤더가 반드시 필요하다.
// 이게 빠지면 엔진이 조용히 로드 실패한다.
const crossOriginIsolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

/*
 * 가져올 수 있는 곳을 우리 서버 하나로 묶는다(Content-Security-Policy).
 *
 * 이 앱은 바깥에서 받아오는 것이 하나도 없다 - 글꼴(Pretendard)·아이콘(Lucide)은 번들에
 * 들어 있고, 탭 아이콘은 index.html 안의 data: URI 이고, 엔진과 신경망은 /engine/ 에서
 * 온다. 그래서 'self' 로 전부 닫아도 잃는 것이 없다.
 *
 * 'wasm-unsafe-eval' 만 열어 둔다. 이름이 사납지만 **wasm 을 컴파일해도 된다**는 뜻일
 * 뿐이고, 자바스크립트 eval 은 열지 않는다. 엔진 스크립트를 뒤져보니 eval·new Function·
 * blob URL 을 하나도 쓰지 않아서(importScripts 하나뿐) 이 이상은 열 것이 없다.
 *
 * style-src 에 'unsafe-inline' 이 붙은 까닭 - 판 크기를 재서 넣는 자리가 인라인 스타일이다
 * (React 의 style={{...}}). 스타일로 할 수 있는 나쁜 짓은 거의 없고, 열지 않으면 판이 안 그려진다.
 *
 * frame-ancestors 'none' 은 남의 사이트가 우리 화면을 액자처럼 덮어 두고 엉뚱한 것을
 * 누르게 하는 짓(클릭재킹)을 막는다. COOP/COEP 는 이것을 막아 주지 않는다.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join("; ");

const headers = {
  ...crossOriginIsolation,
  "Content-Security-Policy": csp,
  // 서버가 말한 종류를 브라우저가 멋대로 다시 추측하지 않게 한다.
  "X-Content-Type-Options": "nosniff",
  // 제보 창구(구글 폼)로 넘어갈 때 우리 주소를 딸려 보내지 않는다.
  "Referrer-Policy": "no-referrer",
};

export default defineConfig({
  plugins: [react()],
  server: { headers },
  preview: { headers },
  // 11MB 신경망과 1.6MB wasm 은 public/ 에 그대로 두고 fetch 로 읽는다.
  // 번들러가 건드리지 않도록 assetsInlineLimit 는 기본값을 유지한다.

  /*
   * 쪽은 하나다(index.html). 한동안 업데이트 내역을 /updates/ 로 따로 세워
   * 진입점이 둘이었는데, 그 글을 앱 안의 창으로 옮기면서 하나로 돌아왔다.
   */

  // 순수 로직 테스트(*.test.ts)는 node 에서 돈다. 화면 테스트(*.test.tsx)는 파일 맨 위의
  // `@vitest-environment jsdom` 으로 브라우저 흉내 속에서 돌고, 엔진(wasm)은 가짜로 바꿔
  // 끼운다(src/test/fakeEngine.ts). 진짜 엔진은 브라우저가 있어야 해서 여기서 다루지 않는다.
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
