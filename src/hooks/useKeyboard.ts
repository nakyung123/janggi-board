// 키보드 단축키 — ←·→ 한 수씩, Home·End 처음·끝, F 판 뒤집기
//
// 기보를 넘겨보는 동작은 손이 많이 가서 키로 두는 편이 훨씬 편하다.
// 입력칸·드롭다운처럼 방향키를 제 몫으로 쓰는 칸에 초점이 있으면 가로채지 않는다.

import { useEffect } from "react";

export interface Shortcuts {
  prev: () => void;
  next: () => void;
  first: () => void;
  last: () => void;
  flip: () => void;
}

/**
 * 방향키를 제 몫으로 쓰는 칸에 초점이 있는지. 입력칸에서 방향키를 누를 때
 * 판이 움직이면 곤란하다. 드롭다운(Dropdown.tsx)은 버튼이지만 방향키·Home·End
 * 로 목록을 훑으므로 셀렉트와 같이 친다.
 */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.getAttribute("role") === "combobox" ||
    el.isContentEditable
  );
}

export function useKeyboard(shortcuts: Shortcuts, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;

      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };

      switch (e.key) {
        case "ArrowLeft":
          return run(shortcuts.prev);
        case "ArrowRight":
          return run(shortcuts.next);
        case "Home":
          return run(shortcuts.first);
        case "End":
          return run(shortcuts.last);
        case "f":
        case "F":
          return run(shortcuts.flip);
        // 스페이스는 가로채지 않는다 - 초점이 간 버튼을 누르는 브라우저 기본 동작이다.
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts, enabled]);
}
