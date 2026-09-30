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
