// 판 조작 줄
//
// 판 바로 아래에 붙어 있던 버튼들을 오른쪽 칸 맨 위로 옮겼다.
//
// 이 앱은 페이지가 스크롤되지 않아서 '남는 세로'가 곧 장기판 크기다. 판 아래
// 이 한 줄이 44px 을 가져가고 있었고, 가로는 1440px 화면에서 판 옆에 350px 이
// 놀고 있었다. 그래서 "판을 키워달라"와 "버튼을 오른쪽으로 빼달라"는 사실
// 같은 요청이었다. 줄을 옮기니 판이 그만큼 커진다.

import type { Mode } from "../ModeTabs";

interface Props {
  mode: Mode;
  /** 편집 중에는 되짚을 기보가 없다. 판 뒤집기만 살려 둔다. */
  editing: boolean;
  /** 지금 보고 있는 수의 번호 */
  cursor: number;
  /** 기보의 마지막 칸 번호 */
  last: number;
  /** 지금 판을 건드릴 수 있는지. 한수쉼에만 쓴다. */
  canTouch: boolean;
  onJump: (index: number) => void;
  /** 대국 중의 '무르기'는 한 칸이 아니라 내 차례가 나올 때까지 되감는다. */
  onUndo: () => void;
  onFlip: () => void;
  onPass: () => void;
}

export function BoardControls(props: Props) {
  const { mode, editing, cursor, last, canTouch, onJump, onUndo, onFlip, onPass } =
    props;

  const atStart = editing || cursor === 0;
  const atEnd = editing || cursor >= last;

  /*
   * 두 줄로 나눈다.
   *
   * 여섯 개를 한 줄에 두면 오른쪽 칸(400px) 에 다 들어가지 않아 마지막 하나가
   * 혼자 아래로 떨어진다. 저절로 넘어간 줄은 '자리가 모자랐구나' 로 읽힌다.
   * 어차피 하는 일도 둘로 갈린다 - 위는 기보를 오가는 것, 아래는 판에 손대는
   * 것이다. 나눠 놓으면 줄바꿈이 뜻을 갖는다.
   */
  return (
    <div className="panel board-controls">
      <div className="board-actions">
        <button type="button" disabled={atStart} onClick={() => onJump(0)}>
          ⇤
        </button>
        <button
          type="button"
          disabled={atStart}
          onClick={() => (mode === "play" ? onUndo() : onJump(cursor - 1))}
          title="← 키"
        >
          ← {mode === "play" ? "무르기" : "이전"}
        </button>
        <button
          type="button"
          disabled={atEnd}
          onClick={() => onJump(cursor + 1)}
          title="→ 키"
        >
          {mode === "play" ? "다시" : "다음"} →
        </button>
        <button type="button" disabled={atEnd} onClick={() => onJump(last)}>
          ⇥
        </button>
      </div>

      <div className="board-actions">
        <button type="button" className="ghost" onClick={onFlip} title="F 키">
          판 뒤집기
        </button>
        {mode !== "review" && (
          <button
            type="button"
            disabled={!canTouch}
            title="궁을 제자리에 두는 것이 장기의 한수쉼입니다"
            onClick={onPass}
          >
            한수쉼
          </button>
        )}
      </div>
    </div>
  );
}
