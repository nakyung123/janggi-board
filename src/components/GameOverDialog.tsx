// 대국 결과 팝업
//
// 판이 끝나는 순간 화면 가운데에 한 번 뜬다.
//
// 예전에는 결과가 오른쪽 칸 맨 아래 카드에만 있었다. 판을 보고 있다가 갑자기
// 수를 둘 수 없게 되는데, 왜 끝났는지는 눈이 가 있지 않은 곳에 적혀 있었다.
// 이기고 지는 것은 이 앱에서 가장 큰 사건이라 화면 한가운데에서 말해야 한다.
//
// 대신 닫을 수 있다. 끝난 판을 다시 놓아보는 것도 이 도구의 쓸모라, 결과가
// 판을 영영 가리고 있으면 안 된다. 닫고 나면 판 위 배너와 상태줄이 '어떻게
// 끝났는지'를 계속 들고 있다.

import { useEffect, useRef } from "react";
import type { Side } from "../janggi/pieces";
import type { Outcome } from "../janggi/status";
import { outcomeMessage } from "../janggi/status";

interface Props {
  outcome: Outcome;
  /** 내가 잡은 쪽. 이겼는지 졌는지는 이걸 봐야 안다. */
  mySide: Side;
  /** 몇 수에서 끝났는지 */
  moveCount: number;
  /** 상대 급수 이름 */
  levelName: string;
  onReview: () => void;
  onNewGame: () => void;
  onClose: () => void;
}

/** 결과 카드의 색. 이겼는지 졌는지는 글자로도 적으므로 색은 거들 뿐이다. */
const 승패 = (winner: Side | null, mine: Side): string =>
  winner === null ? "draw" : winner === mine ? "won" : "lost";

export function GameOverDialog(props: Props) {
  const { outcome, mySide, moveCount, levelName, onReview, onNewGame, onClose } =
    props;

  const firstRef = useRef<HTMLButtonElement>(null);

  // 뜨자마자 '복기 보기'에 초점을 준다. 키보드만 쓰는 사람이 탭을 여러 번
  // 눌러 찾아 들어오지 않아도 되고, 엔터로 바로 복기로 넘어간다.
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  // Esc 로 닫는다. 창을 띄웠으면 빠져나올 길이 손에 있어야 한다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const head =
    outcome.winner === null
      ? "비겼습니다"
      : outcome.winner === mySide
        ? "이겼습니다"
        : "졌습니다";

  return (
    // 바깥을 눌러도 닫힌다. 창을 처음 보는 사람이 가장 먼저 해보는 동작이다.
    <div className="result-backdrop" onClick={onClose}>
      <div
        className="result-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-head"
        // 창 안을 누른 것까지 바깥 누름으로 새어 나가면 버튼을 누를 수 없다.
        onClick={(e) => e.stopPropagation()}
      >
        <p id="result-head" className={"result-head " + 승패(outcome.winner, mySide)}>
          {head}
        </p>
        <p className="result-detail muted">
          {outcomeMessage(outcome)}
        </p>
        <p className="result-detail muted small">
          {moveCount}수에서 끝났습니다. 상대는 {levelName}이었습니다.
        </p>

        <div className="result-buttons">
          <button ref={firstRef} type="button" className="primary" onClick={onReview}>
            복기 보기
          </button>
          <button type="button" onClick={onNewGame}>
            새 대국
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
