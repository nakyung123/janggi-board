// 드롭다운 — 브라우저 기본 셀렉트 대신 쓰는 펼침 목록(상대 급수·규칙)
//
// 기본 셀렉트는 목록을 어디로, 얼마나 길게 펼칠지를 브라우저가 정한다. 아래 자리가
// 모자라면 위로 뒤집혀 열리고, 급수 27개가 화면 높이만큼 펼쳐진다. 펼침 화살표도
// 브라우저 모양이라 Lucide 아이콘과 선이 다르다. 모양과 방향을 앱이 쥐려고 목록을
// 직접 그린다.
//
//   · 늘 칸 바로 아래로, 칸과 같은 폭으로 펼친다.
//   · 한 번에 8줄까지 보이고 나머지는 목록 안에서 스크롤한다. 아래 자리가
//     그보다 모자라면 남은 자리만큼만 펼친다.
//   · 목록은 body 에 붙인다. 오른쪽 칸이 스크롤 상자라 그 안에 두면 잘린다.
//
// 키보드는 WAI-ARIA 의 '고르기만 하는 콤보박스' 틀을 따른다. 초점은 늘 칸에
// 머물고, 목록 안의 '지금 짚은 줄' 은 aria-activedescendant 가 알린다.

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  /** 오른쪽에 옅게 붙는 덧말. 예: 9단의 "한 수 20초 안팎" */
  hint?: string;
  /** 목록에서만 이름 아래 한 줄로 붙는 설명. 칸에는 이름만 선다. */
  desc?: string;
}

interface Props<T extends string> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  /** 이 칸의 이름을 적은 요소의 id. 화면 읽기 프로그램이 "상대 급수, 12급" 으로 읽는다. */
  labelledBy: string;
  disabled?: boolean;
}

/** 목록과 칸 사이, 목록과 화면 아래 끝 사이 */
const GAP = 4;
const EDGE = 12;

export function Dropdown<T extends string>(props: Props<T>) {
  const { value, options, onChange, labelledBy, disabled } = props;
  const id = useId();
  const listId = `${id}-list`;
  const valueId = `${id}-value`;
  const optionId = (i: number) => `${id}-opt-${i}`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  /** 목록 안에서 지금 짚은 줄. 고른 값과 다를 수 있다(화살표로 훑는 중). */
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<{ top: number; left: number; width: number; room: number }>();

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );
  const current = options[selectedIndex];

  const show = (at: number) => {
    setActive(at);
    setOpen(true);
  };
  const choose = (i: number) => {
    setOpen(false);
    const next = options[i];
    if (next && next.value !== value) onChange(next.value);
  };

  // 잠기면 접는다. 판이 끝나는 순간 열려 있던 목록이 남으면 고를 수 있는 것처럼 보인다.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  /*
   * 목록 자리는 칸의 화면 좌표로 정한다. 오른쪽 칸이 스크롤되거나 창 크기가
   * 바뀌면 칸이 움직이므로 따라간다. 스크롤은 어느 상자에서 났는지 모르니
   * 문서 전체에서 잡는다(capture).
   */
  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const measure = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      setPlace({
        top: r.bottom + GAP,
        left: r.left,
        width: r.width,
        room: window.innerHeight - r.bottom - GAP - EDGE,
      });
    };
    const onMove = (e: Event) => {
      // 목록 자체를 스크롤하는 것은 자리를 바꾸지 않는다.
      if (e.target === listRef.current) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  // 짚은 줄이 목록 밖으로 나가면 끌어온다. 처음 열 때는 고른 줄이 보이게 한다.
  useLayoutEffect(() => {
    if (!open || !place) return;
    document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // optionId 는 id 로만 정해진다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, place, active]);

  // 스페이스는 누를 때 우리가 처리하고, 뗄 때 버튼이 한 번 더 누르지 않게 막는다.
  const spaceHandled = useRef(false);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1;
    if (!open) {
      // 닫혀 있을 때 Enter·스페이스는 버튼이 눌리면서(onClick) 연다.
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        show(selectedIndex);
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        show(e.key === "Home" ? 0 : last);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((a) => Math.min(last, a + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (e.altKey) choose(active);
        else setActive((a) => Math.max(0, a - 1));
        break;
      case "PageDown":
        e.preventDefault();
        setActive((a) => Math.min(last, a + 8));
        break;
      case "PageUp":
        e.preventDefault();
        setActive((a) => Math.max(0, a - 8));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(last);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (e.key === " ") spaceHandled.current = true;
        choose(active);
        break;
      case "Escape":
        e.preventDefault();
        // 대국 확인 창처럼 Esc 를 듣는 쪽이 같이 반응하지 않게 한다.
        e.stopPropagation();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  const onKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === " " && spaceHandled.current) {
      e.preventDefault();
      spaceHandled.current = false;
    }
  };

  return (
    <div className="dropdown">
      <button
        ref={triggerRef}
        type="button"
        className="dropdown-trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${labelledBy} ${valueId}`}
        aria-activedescendant={open ? optionId(active) : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show(selectedIndex))}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        // 목록 밖을 누르면 칸에서 초점이 빠진다. 그때 접는다.
        onBlur={() => setOpen(false)}
      >
        <span id={valueId} className="dropdown-value">
          {current?.label}
          {current?.hint && <span className="dropdown-hint">{current.hint}</span>}
        </span>
        {open ? (
          <ChevronUp size={20} strokeWidth={2} aria-hidden />
        ) : (
          <ChevronDown size={20} strokeWidth={2} aria-hidden />
        )}
      </button>

      {open &&
        place &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            className="dropdown-list"
            aria-labelledby={labelledBy}
            style={{
              top: place.top,
              left: place.left,
              width: place.width,
              ["--dropdown-room" as string]: `${Math.max(0, place.room)}px`,
            }}
            // 목록을 누르거나 스크롤 막대를 끌어도 초점은 칸에 남긴다.
            // 초점이 빠지면 onBlur 가 목록을 먼저 접어서 누른 줄이 골라지지 않는다.
            onMouseDown={(e) => e.preventDefault()}
          >
            {options.map((o, i) => (
              <li
                key={o.value}
                id={optionId(i)}
                role="option"
                aria-selected={o.value === value}
                className={"dropdown-option" + (i === active ? " active" : "")}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
              >
                <span className="dropdown-label">
                  {o.label}
                  {o.desc && <span className="dropdown-desc">{o.desc}</span>}
                </span>
                {o.hint && <span className="dropdown-hint">{o.hint}</span>}
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  );
}
