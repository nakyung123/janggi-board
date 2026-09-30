// 업데이트 내역 페이지 (/updates/)
//
// 앱과 따로 서는 두 번째 진입점이다. 여기에 오는 데 엔진이 필요하지 않다 -
// 업데이트 한 줄 보려고 13MB 신경망을 받고 로딩 화면을 지나게 할 수는 없다.
// 그래서 React 도 쓰지 않는다. 글 목록 한 장이라 DOM 을 그대로 짓는 편이
// 번들이 작고 뜨는 것도 빠르다.
//
// 앱은 스크롤되지 않지만(남는 세로가 곧 판 크기라서) 이 쪽은 글이므로
// 스크롤된다. base.css 의 body 규칙을 updates.css 가 되돌린다.

import { UPDATES } from "./log";
import "../styles/updates.css";

/** 제보 창구. 아직 없으면(값이 비어 있으면) 제보 자리를 아예 그리지 않는다. */
const FEEDBACK_URL = import.meta.env.VITE_FEEDBACK_URL ?? "";

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function head(): HTMLElement {
  const bar = el("header", "up-head");

  const name = el("div", "up-name");
  name.append(el("b", undefined, "장기 AI"), el("span", undefined, "업데이트 내역"));

  const back = el("a", "up-back", "장기 두러 가기");
  back.href = "/";

  bar.append(name, back);
  return bar;
}

function release(r: (typeof UPDATES)[number]): HTMLElement {
  const card = el("article", "up-card");

  const when = el("p", "up-when");
  when.append(el("time", undefined, r.date), el("span", "up-ver", `v${r.version}`));

  const list = el("ul", "up-items");
  for (const item of r.items) list.append(el("li", undefined, item));

  card.append(when, list);
  return card;
}

/**
 * 제보 자리.
 *
 * 알파장기의 업데이트 페이지와 같은 구조다 - 바뀐 목록을 보여준 바로 아래에서
 * 제보를 받는다. "보내주신 것이 이렇게 반영됩니다" 를 목록 자체가 이미 말한
 * 뒤라, 여기가 제보를 부탁하기에 가장 좋은 자리다.
 */
function feedback(): HTMLElement | null {
  if (!FEEDBACK_URL) return null;

  const box = el("section", "up-feedback");
  box.append(
    el("h2", undefined, "버그 · 피드백 제보"),
    el(
      "p",
      undefined,
      "불편한 점이나 고쳤으면 하는 점을 알려주세요. 보내주신 것은 위 목록처럼 하나씩 반영해 드릴게요."
    )
  );

  const go = el("a", "up-go", "제보하러 가기");
  go.href = FEEDBACK_URL;
  go.target = "_blank";
  go.rel = "noopener noreferrer";
  box.append(go);

  return box;
}

const root = document.getElementById("root");
if (!root) throw new Error("#root 를 찾지 못했습니다.");

const main = el("main", "up-main");
main.append(
  el(
    "p",
    "up-lead",
    "보내주신 의견을 그때그때 반영하고 있어요. 바뀐 내용을 날짜별로 정리해 드려요."
  ),
  ...UPDATES.map(release)
);

const box = feedback();
if (box) main.append(box);

root.append(head(), main);
