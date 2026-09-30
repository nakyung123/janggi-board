// 앱 진입점 — #root 에 App 을 붙이고 스타일(styles/index.css)을 읽는다.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root 를 찾지 못했습니다.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
