// 판 조작 줄
//
// 판 바로 아래에 붙어 있던 버튼들을 오른쪽 칸 맨 위로 옮겼다.
//
// 이 앱은 페이지가 스크롤되지 않아서 '남는 세로'가 곧 장기판 크기다. 판 아래
// 이 한 줄이 44px 을 가져가고 있었고, 가로는 1440px 화면에서 판 옆에 350px 이
// 놀고 있었다. 그래서 "판을 키워달라"와 "버튼을 오른쪽으로 빼달라"는 사실
// 같은 요청이었다. 줄을 옮기니 판이 그만큼 커진다.

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import type { Mode } from "../layout/ModeTabs";

/*
 * 아이콘은 Lucide(선 아이콘, 24 격자). 예전에는 ⇤ ← → ⇥ 를 글자로 넣었는데,
 * 글꼴마다 화살표 모양과 굵기가 달라 버튼 글자와 따로 놀았다. 선 굵기 2 는
 * 버튼 글자 굵기(500)와 맞춘 값이다.
 *
 * 아이콘은 기보를 오가는 윗줄에만 둔다. '처음·이전·다음·끝' 은 어디서나 같은
 * 모양으로 통하지만, 판 뒤집기·한수쉼은 그림으로 옮기면 뜻이 흐려진다
 * (한수쉼을 일시정지로 그리면 시계를 멈추는 버튼으로 읽힌다).
 */
const ICON = { size: 20, strokeWidth: 2, "aria-hidden": true } as const;

interface Props {
  mode: Mode;
  /** 지금 보고 있는 수의 번호 */
  cursor: number;
  /** 기보의 마지막 칸 번호 */
  last: number;
  /** 지금 판을 건드릴 수 있는지. 한수쉼에만 쓴다. */
  canTouch: boolean;
  /**
   * 대국 탭의 판이 끝났는지. 끝난 판은 무를 수 없어서 '무르기·다시' 가 기보
   * 탭처럼 한 칸씩 오가는 '이전·다음' 이 된다(판은 App 이 잠근다).
   */
  finished: boolean;
  onJump: (index: number) => void;
  /** 대국 중의 '무르기'는 한 칸이 아니라 내 차례가 나올 때까지 되감는다. */
  onUndo: () => void;
  onFlip: () => void;
  onPass: () => void;
  /** 한수쉼 버튼의 툴팁을 바꿔 달 때. 빅장이 걸리면 한수쉼이 빅장을 받는 수가 된다. */
  passTitle?: string;
}

export function BoardControls(props: Props) {
  const { mode, cursor, last, canTouch, finished, onJump, onUndo, onFlip, onPass, passTitle } =
    props;

  const atStart = cursor === 0;
  const atEnd = cursor >= last;
  // 두는 중인 대국에서만 무르기·다시다. 끝난 판과 기보 탭은 한 칸씩 오간다.
  const undoing = mode === "play" && !finished;

  /*
   * 두 줄로 나눈다.
   *
   * 여섯 개를 한 줄에 두면 오른쪽 칸(400px) 에 다 들어가지 않아 마지막 하나가
   * 혼자 아래로 떨어진다. 저절로 넘어간 줄은 '자리가 모자랐구나' 로 읽힌다.
   * 어차피 하는 일도 둘로 갈린다 - 위는 기보를 오가는 것, 아래는 판에 손대는
   * 것이다. 나눠 놓으면 줄바꿈이 뜻을 갖는다.
   */
  return (
    <div className="board-controls">
      <div className="board-actions">
        <button
          type="button"
          className="icon"
          disabled={atStart}
          onClick={() => onJump(0)}
          title="처음으로"
          aria-label="처음으로"
        >
          <ChevronsLeft {...ICON} />
        </button>
        <button
          type="button"
          disabled={atStart}
          onClick={() => (undoing ? onUndo() : onJump(cursor - 1))}
          title="← 키"
        >
          <ChevronLeft {...ICON} />
          {undoing ? "무르기" : "이전"}
        </button>
        <button
          type="button"
          disabled={atEnd}
          onClick={() => onJump(cursor + 1)}
          title="→ 키"
        >
          {undoing ? "다시" : "다음"}
          <ChevronRight {...ICON} />
        </button>
        <button
          type="button"
          className="icon"
          disabled={atEnd}
          onClick={() => onJump(last)}
          title="끝으로"
          aria-label="끝으로"
        >
          <ChevronsRight {...ICON} />
        </button>
      </div>

      <div className="board-actions">
        <button type="button" onClick={onFlip} title="F 키">
          판 뒤집기
        </button>
        {/* 기보 탭은 지난 판을 읽기만 한다. 둘 수가 없으니 한수쉼도 없다. */}
        {mode === "play" && (
          <button
            type="button"
            disabled={!canTouch}
            title={passTitle ?? "궁을 제자리에 두는 것이 장기의 한수쉼입니다"}
            onClick={onPass}
          >
            한수쉼
          </button>
        )}
      </div>
    </div>
  );
}
