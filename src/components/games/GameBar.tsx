// 연 판의 머리 한 줄 — 목록으로 · 어떤 판인지 · 저장
//
// '목록으로' 는 이전·다음과 같은 테두리 버튼이다. 테두리 없는 글자 버튼일 때는 버튼으로
// 보이지 않았다. 저장도 이 판에 하는 일이라 같은 줄에 둔다. 폰은 오른쪽 칸이 판 아래로
// 내려가 판을 지나야 보이므로, 이 줄만 판 위로 올린다(자리는 App 이 정한다).

import { ChevronLeft } from "lucide-react";
import type { ArchivedGame } from "../../janggi/archive";
import { resultTag, whenLabel } from "../../janggi/archive";

interface Props {
  game: ArchivedGame;
  /** 복기가 도는 동안에는 목록으로 돌아가지 않는다(엔진을 복기가 쥐고 있다). */
  busy: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function GameBar({ game, busy, onClose, onSave }: Props) {
  const tag = resultTag(game);
  if (!tag) return null;

  return (
    <div className="game-back">
      <button type="button" className="back" onClick={onClose} disabled={busy}>
        <ChevronLeft size={20} strokeWidth={2} aria-hidden />
        목록으로
      </button>
      {/* 승부를 앞에 둔다. 폰에서 자리가 모자라면 뒤(언제 뒀는지)부터 말줄임으로 준다. */}
      <span className="game-back-meta">
        <b className={"game-result " + tag.tone}>{tag.text}</b> · vs {game.levelName} ·{" "}
        {whenLabel(game.endedAt)}
      </span>
      <button type="button" className="save" onClick={onSave} aria-label="파일로 저장">
        저장
      </button>
    </div>
  );
}
