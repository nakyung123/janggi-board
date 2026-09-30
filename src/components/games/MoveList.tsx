// 수 목록 — 연 판의 기보
//
// 한 줄에 초·한 한 수씩. 수를 누르면 그 국면으로 가고, 마우스를 올리면 판에 그 수를
// 화살표로 미리 보여준다. 복기를 돌린 뒤에는 수마다 등급 기호가 붙는다.
//
// 복기 칸 안에 선다(ReviewPanel 의 moves). 전에는 형세 아래에 기보 칸이 따로 있었는데,
// 복기 칸에도 한 수에 한 줄짜리 수 목록이 있어 같은 수가 두 번 나왔다. 하나로 합치고
// 모양은 두 수에 한 줄인 기보 쪽을 남겼다 - 장기 기보의 모양이고 높이가 절반이다.
// 기보 목록에 든 판은 수가 하나 이상이라 빈 목록은 없다. 시작 국면으로는 판 조작 줄의
// '처음으로' 가 간다. 파일로 저장·링크 공유는 연 판의 머리 줄(App 의 gameBar)에 있다.

import { useEffect, useMemo, useRef } from "react";
import type { HistoryEntry } from "../../janggi/history";
import { moveRows } from "../../janggi/notation";
import { SIDE_LABEL } from "../../janggi/pieces";
import type { Side } from "../../janggi/pieces";
import { GRADE_LABEL, GRADE_MARK } from "../../janggi/review";
import type { ReviewedMove } from "../../janggi/review";

interface Props {
  history: HistoryEntry[];
  cursor: number;
  /** 복기를 돌렸으면 수마다 등급이 붙는다 */
  reviewed?: ReviewedMove[] | null;
  onJump: (index: number) => void;
  /**
   * 수에 마우스를 올렸을 때. 판에 화살표로 띄우라고 알린다.
   *
   * 판에 좌표 숫자가 없어서 기보의 "75졸65" 만 보고는 그게 어디인지 모른다.
   * 누르면 알 수 있지만 그러면 국면이 그리로 옮겨간다. 보던 자리를 그대로 두고
   * 어디인지만 보려면 이게 필요하다.
   */
  onHoverMove: (move: string | null) => void;
}

export function MoveList(props: Props) {
  const { history, cursor, reviewed, onJump, onHoverMove } = props;
  const scrollRef = useRef<HTMLDivElement>(null);

  const gradeOf = (index: number) =>
    reviewed?.find((r) => r.index === index) ?? null;

  // 한 줄에 초·한 한 수씩 짝지어 보여준다. 줄 나누는 규칙은 notation.ts 의 moveRows 에 있다.
  const rows = useMemo(
    () => moveRows(history.map((h) => h.mover)),
    [history]
  );
  const cellAt = (i: number | null) =>
    i === null ? null : { ...history[i], i };

  /*
   * 지금 수가 목록 밖에 있으면 그 줄이 보이게 목록만 굴린다. 이전·다음이나 '다음 아쉬운 수'
   * 로 옮겨 가도 목록에서 어디쯤인지 보인다. scrollIntoView 는 쓰지 않는다 - 목록을 품은
   * 오른쪽 칸(폰에서는 페이지)까지 굴려서 보던 카드가 화면 밖으로 밀린다.
   */
  useEffect(() => {
    const box = scrollRef.current;
    const cell = box?.querySelector<HTMLElement>(".move-cell.active");
    if (!box || !cell) return;
    const b = box.getBoundingClientRect();
    const c = cell.getBoundingClientRect();
    if (c.top < b.top) box.scrollTop -= b.top - c.top;
    else if (c.bottom > b.bottom) box.scrollTop += c.bottom - b.bottom;
  }, [cursor]);

  return (
    <div className="move-scroll" ref={scrollRef}>
      <table className="move-table">
        <tbody>
          {rows.map((row) => (
            <tr key={row.no}>
              <td className="move-no">{row.no}</td>
              {(["cho", "han"] as Side[]).map((side) => {
                const cell = cellAt(row[side]);
                if (!cell) return <td key={side} />;
                const graded = gradeOf(cell.i);
                return (
                  <td key={side}>
                    <button
                      type="button"
                      className={
                        "move-cell " +
                        side +
                        (cursor === cell.i ? " active" : "") +
                        (graded ? " g-" + graded.grade : "")
                      }
                      onClick={() => onJump(cell.i)}
                      onMouseEnter={() => onHoverMove(cell.move)}
                      onMouseLeave={() => onHoverMove(null)}
                      onFocus={() => onHoverMove(cell.move)}
                      onBlur={() => onHoverMove(null)}
                      aria-label={
                        graded
                          ? `${SIDE_LABEL[side]} ${cell.notation} ${GRADE_LABEL[graded.grade]}`
                          : `${SIDE_LABEL[side]} ${cell.notation}`
                      }
                    >
                      <span>{cell.notation}</span>
                      {graded && graded.grade !== "good" && (
                        <em className="move-grade">{GRADE_MARK[graded.grade]}</em>
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
