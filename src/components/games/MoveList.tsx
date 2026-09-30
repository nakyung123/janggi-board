// 기보 — 연 판의 수 목록
//
// 한 줄에 초·한 한 수씩. 수를 누르면 그 국면으로 가고, 마우스를 올리면 판에 그 수를
// 화살표로 미리 보여준다. 복기를 돌린 뒤에는 수마다 등급 기호가 붙는다.
//
// 기보 탭에서 연 판에만 붙는다. 두는 중에는 수 목록을 볼 일이 드물고(무르기·다시는
// 판 조작 줄에 있다) 끝난 판은 기보 탭에서 본다. 파일로 저장하는 버튼도 여기 있다 -
// 기보를 보다가 저장하고 싶어지는 것이 자연스러운 순서다. 불러오기는 목록에 판을
// 넣는 일이라 기보 목록(GameList)에 있다.

import { useMemo } from "react";
import { ListOrdered } from "lucide-react";
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
  canSave: boolean;
  onJump: (index: number) => void;
  /**
   * 수에 마우스를 올렸을 때. 판에 화살표로 띄우라고 알린다.
   *
   * 판에 좌표 숫자가 없어서 기보의 "75卒65" 만 보고는 그게 어디인지 모른다.
   * 누르면 알 수 있지만 그러면 국면이 그리로 옮겨간다. 보던 자리를 그대로 두고
   * 어디인지만 보려면 이게 필요하다.
   */
  onHoverMove: (move: string | null) => void;
  onSave: () => void;
}

export function MoveList(props: Props) {
  const { history, cursor, reviewed, canSave, onJump, onHoverMove, onSave } = props;

  const gradeOf = (index: number) =>
    reviewed?.find((r) => r.index === index) ?? null;

  // 한 줄에 초·한 한 수씩 짝지어 보여준다.
  // 줄을 나누는 규칙은 복기 패널과 함께 쓴다 — 두 곳이 따로 세면 같은 수를
  // 서로 다른 번호로 부르게 된다 (notation.ts 의 moveRows 주석 참고).
  const rows = useMemo(
    () => moveRows(history.map((h) => h.mover)),
    [history]
  );
  const cellAt = (i: number | null) =>
    i === null ? null : { ...history[i], i };

  return (
    <div className="panel moves">
      <div className="panel-title">
        기보
        <span className="panel-meta">{history.length - 1}수</span>
      </div>

      <div className="move-scroll">
        <button
          type="button"
          className={"move-start" + (cursor === 0 ? " active" : "")}
          onClick={() => onJump(0)}
        >
          시작 국면
        </button>

        {rows.length === 0 ? (
          <div className="empty">
            <ListOrdered size={24} strokeWidth={1.75} aria-hidden />
            <p className="empty-title">아직 둔 수가 없습니다</p>
            <p>판에서 기물을 옮기면 한 수씩 여기에 쌓입니다.</p>
          </div>
        ) : (
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
                          title={
                            graded
                              ? `${SIDE_LABEL[side]} · ${cell.notation} - ${GRADE_LABEL[graded.grade]}`
                              : `${SIDE_LABEL[side]} · ${cell.notation}`
                          }
                        >
                          <span>{cell.notation}</span>
                          {graded && graded.grade !== "good" && (
                            <em className="move-grade">
                              {GRADE_MARK[graded.grade]}
                            </em>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="row move-actions">
        <button
          type="button"
          className="ghost"
          onClick={onSave}
          disabled={!canSave}
          title={canSave ? "기보를 파일로 저장합니다" : "저장할 수가 없습니다"}
        >
          파일로 저장
        </button>
      </div>
    </div>
  );
}
