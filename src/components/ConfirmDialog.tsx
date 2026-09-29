// 확인 창
//
// 누르는 순간 판이 끝나는 동작(새 대국·기권)을 한 번 더 묻는다.
// 대국 결과 팝업(GameOverDialog)과 같은 틀을 쓴다 - 화면 가운데, 옅은 딤드.
//
// 처음 초점은 '취소' 에 둔다. 엔터를 습관처럼 누르거나 창을 보지 않고
// 스페이스를 쳐도 판이 끝나지 않게 하려는 것이다. 되돌릴 수 없는 쪽이
// 기본 버튼이 되면 묻는 의미가 없다.

import { useEffect, useRef } from "react";

interface Props {
  title: string;
  /** 누르면 무엇이 달라지는지 한 줄 */
  message: string;
  confirmLabel: string;
  /** 되돌릴 수 없는 일이면 확인 버튼을 붉힌다 */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog(props: Props) {
  const { title, message, confirmLabel, danger, onConfirm, onCancel } = props;
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // Esc 로 물린다. 창을 띄웠으면 빠져나올 길이 손에 있어야 한다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="confirm-title" className="dialog-title">
          {title}
        </p>
        <p id="confirm-message" className="dialog-body muted">
          {message}
        </p>
        <div className="dialog-buttons">
          <button
            type="button"
            className={"primary" + (danger ? " danger" : "")}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          <button ref={cancelRef} type="button" className="ghost" onClick={onCancel}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
