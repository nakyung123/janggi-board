/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Fairy-Stockfish WASM 은 멀티스레드 탐색에 SharedArrayBuffer 를 쓴다.
// 브라우저가 SharedArrayBuffer 를 열어주려면 아래 두 헤더가 반드시 필요하다.
// 이게 빠지면 엔진이 조용히 로드 실패한다.
const crossOriginIsolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react()],
  server: { headers: crossOriginIsolation },
  preview: { headers: crossOriginIsolation },
  // 11MB 신경망과 1.6MB wasm 은 public/ 에 그대로 두고 fetch 로 읽는다.
  // 번들러가 건드리지 않도록 assetsInlineLimit 는 기본값을 유지한다.

  /*
   * 쪽이 둘이다.
   *
   *   /          앱. 엔진(13MB 신경망)을 받고 판을 그린다.
   *   /updates/  업데이트 내역. 글 한 장이라 엔진도 React 도 쓰지 않는다.
   *
   * 업데이트 한 줄 보려고 로딩 화면을 지나게 할 수는 없어서 진입점을 나눴다.
   * 한쪽만 적으면 다른 쪽이 빌드에서 빠지므로 둘 다 적는다.
   *
   * 경로는 프로젝트 뿌리 기준의 상대 경로다. 문서의 resolve(__dirname, …) 대신
   * 이렇게 쓰면 node 타입(@types/node)을 받지 않아도 된다 - 이 한 줄 때문에
   * 의존성을 늘릴 일은 아니다.
   */
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        updates: "updates/index.html",
      },
    },
  },

  // 순수 로직 테스트(*.test.ts)는 node 에서 돈다. 화면 테스트(*.test.tsx)는 파일 맨 위의
  // `@vitest-environment jsdom` 으로 브라우저 흉내 속에서 돌고, 엔진(wasm)은 가짜로 바꿔
  // 끼운다(src/test/fakeEngine.ts). 진짜 엔진은 브라우저가 있어야 해서 여기서 다루지 않는다.
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
