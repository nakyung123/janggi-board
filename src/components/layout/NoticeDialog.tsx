// 고지 창 - 함께 쓰는 저작물과 수집하는 정보
//
// 업데이트 내역 창의 '고지' 를 누르면 같은 자리에 뜬다. 틀도 그 창과 같다
// (styles/dialogs.css) - 제목, 구르는 본문, 닫기.
//
// 한동안 이것이 따로 선 쪽(/licenses/)이었다. 저장소의 NOTICE.md 를 기호째 그대로 찍어
// 보여 줘서 앱과 생김새가 달랐고, 몇 줄 읽고 닫을 글 때문에 새 탭이 열렸다.
//
// 글은 저장소의 NOTICE.md 하나에서 읽는다. 창에 따로 적어 두면 둘이 반드시 어긋난다.
// 그 글이 쓰는 표기는 제목(#, ##)·목록(-)·링크·굵게·코드뿐이라 아래 몇 줄로 옮긴다.
// 표기가 늘면 여기도 같이 늘려야 한다 - 모르는 표기는 글자 그대로 보인다.
//
// 라이선스 전문은 창에 싣지 않고 잇지도 않는다. 파일은 배포본에 같이 올라간다
// (/licenses/GPL-3.0.txt · /licenses/third-party.txt · /engine/AUTHORS,
// scripts/fetch-engine.mjs 가 패키지에서 꺼내 둔다). 한동안 창 아래에 그 셋으로 가는
// 줄이 있었는데, 고지를 짧게 두자는 쪽으로 정하면서 뺐다.

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import notice from "../../../NOTICE.md?raw";

interface Props {
  onClose: () => void;
}

interface Section {
  title: string;
  items: string[];
}

interface Notice {
  title: string;
  /** 첫 묶음 앞의 글 */
  lead: string[];
  sections: Section[];
  /** 묶음들 뒤에 오는 글. 전문 파일이 어디 있는지 적은 줄로, 저장소에서 읽는 사람을 위한 것이라 창에서는 그리지 않는다. */
  tail: string[];
}

/** NOTICE.md 를 창이 그릴 모양으로 나눈다. */
function readNotice(md: string): Notice {
  const out: Notice = { title: "고지", lead: [], sections: [], tail: [] };
  let para: string[] = [];
  const flush = () => {
    if (para.length === 0) return;
    (out.sections.length === 0 ? out.lead : out.tail).push(para.join(" "));
    para = [];
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("## ")) {
      flush();
      out.sections.push({ title: line.slice(3), items: [] });
    } else if (line.startsWith("# ")) {
      flush();
      out.title = line.slice(2);
    } else if (line.startsWith("- ") && out.sections.length > 0) {
      flush();
      out.sections[out.sections.length - 1].items.push(line.slice(2));
    } else if (line === "") {
      flush();
    } else {
      para.push(line);
    }
  }
  flush();
  return out;
}

const INLINE = /\[([^\]]+)\]\((https?:[^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;

/** 한 줄 안의 링크·굵게·코드를 옮긴다. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      out.push(
        <a key={m.index} href={m[2]} target="_blank" rel="noopener noreferrer">
          {m[1]}
        </a>
      );
    } else if (m[3]) {
      out.push(<b key={m.index}>{m[3]}</b>);
    } else {
      out.push(<code key={m.index}>{m[4]}</code>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const NOTICE = readNotice(notice);

export function NoticeDialog({ onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Esc 로 닫는다(UpdatesDialog 와 같다).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog updates notice"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notice-title"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="notice-title" className="dialog-title">
          {NOTICE.title}
        </p>
        {NOTICE.lead.map((p) => (
          <p key={p} className="updates-lead muted">
            {inline(p)}
          </p>
        ))}

        <div className="updates-body">
          {NOTICE.sections.map((s) => (
            <section key={s.title}>
              <h2 className="notice-head">{s.title}</h2>
              <ul className="updates-items">
                {s.items.map((item) => (
                  <li key={item}>{inline(item)}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="dialog-buttons">
          <button ref={closeRef} type="button" className="primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
