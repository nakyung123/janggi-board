// 앱 진입점 — #root 에 App 을 붙이고 스타일(styles/index.css)을 읽는다.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/layout/ErrorBoundary";
import { watchTroubles } from "./report/errors";
import "./styles/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root 를 찾지 못했습니다.");

// 아무도 받지 않은 오류(타이머 안, 깨진 약속)까지 장부에 담는다. 오류 경계는
// 그리는 도중의 것만 본다.
watchTroubles();

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
