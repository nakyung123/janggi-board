// 키보드 단축키
//
// 기보를 넘겨보는 동작은 손이 많이 가서 키로 두는 편이 훨씬 편하다.
// 입력칸에 글자를 치는 중이면 가로채지 않는다.

import { useEffect } from "react";

export interface Shortcuts {
  prev: () => void;
  next: () => void;
  first: () => void;
  last: () => void;
  flip: () => void;
  toggleAnalysis: () => void;
}

/** 지금 타이핑 중인지. FEN 칸에서 방향키를 누를 때 판이 움직이면 곤란하다. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
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
        case " ":
          return run(shortcuts.toggleAnalysis);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts, enabled]);
}
