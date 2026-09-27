// 대국 상태 배너
//
// 장군을 맞았는지, 대국이 끝났는지, 편집하다 만 판인지를 판 위에 띄운다.
// 평소(playing)에는 아무것도 그리지 않아 자리를 차지하지 않는다.

import type { GameStatus } from "../janggi/status";
import { isGameOver, statusMessage } from "../janggi/status";

interface Props {
  status: GameStatus;
  /** 대국이 끝났을 때 되돌아갈 수단을 함께 준다 */
  onUndo?: () => void;
  canUndo?: boolean;
}

const TONE: Record<GameStatus["kind"], string> = {
  checkmate: "over",
  stalemate: "over",
  points: "over",
  check: "check",
  invalid: "invalid",
  playing: "",
};

export function StatusBanner({ status, onUndo, canUndo }: Props) {
  const message = statusMessage(status);
  if (!message) return null;

  const over = isGameOver(status);

  return (
    <div className={"status-banner " + TONE[status.kind]}>
      <span className="status-text">{message}</span>

      {status.kind === "invalid" && (
        <span className="status-detail">{status.problems[0]}</span>
      )}
      {status.kind === "check" && (
        <span className="status-detail">궁을 피하거나 막아야 합니다</span>
      )}
      {over && canUndo && onUndo && (
        <button type="button" className="ghost" onClick={onUndo}>
          한 수 무르기
        </button>
      )}
    </div>
  );
}
