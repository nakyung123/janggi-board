// 업데이트 내역 창
//
// 헤더의 '업데이트 내역' 을 누르면 화면 가운데에 뜬다. 결과 창·확인 창과 같은 틀이다
// (styles/dialogs.css) - 가운데 창이 여러 모양이면 어느 쪽이 더 중요한지 괜히 따지게 된다.
//
// 한동안 이것이 따로 선 쪽(/updates/)이었다. 두는 중에 새 탭이 열리는 것이 컸다 - 판을
// 두다 말고 화면을 옮겨야 하고, 돌아오려면 탭을 다시 골라야 한다. 몇 줄 읽고 닫을 글이라
// 그 자리에서 열었다 닫는 편이 맞다. 목록(updates/log.ts)은 그대로 한 곳에서 읽는다.
//
// 제보 자리는 두지 않는다. 제보 버튼이 어느 화면에서나 오른쪽 아래에 떠 있어서,
// 여기에 또 두면 같은 곳으로 가는 문이 둘이 된다.
//
// 대신 '고지' 로 가는 버튼이 여기 있다. 엔진(GPL v3)·기물 글자(CC BY-SA 3.0)·
// 글꼴(OFL 1.1)이 모두 고지가 배포물에 따라붙을 것을 요구하는데, 앱에 화면이라고는 판과
// 기보뿐이라 둘 곳이 마땅치 않았다. 이 창이 맞다 - 어차피 '이 앱이 무엇으로 만들어졌나' 를
// 보러 오는 창이고, 찾는 사람은 드물지만 찾을 때는 반드시 있어야 하는 글이다. 누르면 이
// 창이 고지 창(NoticeDialog.tsx)으로 바뀐다.
//
// 버튼 이름이 '오픈소스 고지' 였는데 '고지' 로 줄였다. 저작권 말고 **수집하는 정보**도
// 그 창에 들어가서, 이름이 안 맞으면 찾는 사람이 거기 있을 줄 모른다. 길게 쓰면 320px
// 폭에서 옆 버튼과 부딪힌다.

import { useEffect, useRef } from "react";

import { UPDATES } from "../../updates/log";

interface Props {
  onClose: () => void;
  /** 고지 창으로 바꾼다 */
  onNotice: () => void;
}

export function UpdatesDialog({ onClose, onNotice }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Esc 로 닫는다. 창을 띄웠으면 빠져나올 길이 손에 있어야 한다(ConfirmDialog 와 같다).
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
        className="dialog updates"
        role="dialog"
        aria-modal="true"
        aria-labelledby="updates-title"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="updates-title" className="dialog-title">
          업데이트 내역
        </p>
        <p className="updates-lead muted">
          보내주신 의견을 그때그때 반영하고 있어요.
        </p>

        {/* 판이 길어지면 이 안만 구른다. 창 자체는 화면 높이를 넘지 않는다. */}
        <div className="updates-body">
          {UPDATES.map((r) => (
            <article key={r.version} className="updates-release">
              <p className="updates-when">
                <time dateTime={r.date.replace(/\./g, "-")}>{r.date}</time>
                <span className="updates-ver">v{r.version}</span>
              </p>
              <ul className="updates-items">
                {r.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="dialog-buttons">
          <button ref={closeRef} type="button" className="primary" onClick={onClose}>
            닫기
          </button>
          <button type="button" className="ghost" onClick={onNotice}>
            고지
          </button>
        </div>
      </div>
    </div>
  );
}
