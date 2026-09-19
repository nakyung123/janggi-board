// 기보
//
// 한 수씩 눌러 그 시점 국면으로 되돌아갈 수 있다. 되돌아간 뒤 다른 수를 두면
// 그 지점부터 기보가 새로 이어진다.

import { SIDE_LABEL } from "../janggi/pieces";
import type { Side } from "../janggi/pieces";

export interface HistoryEntry {
  fen: string;
  /** 이 국면을 만든 수. 첫 국면은 null. */
  move: string | null;
  notation: string;
  mover: Side | null;
}

interface Props {
  history: HistoryEntry[];
  cursor: number;
  onJump: (index: number) => void;
}

export function MoveList({ history, cursor, onJump }: Props) {
  // 한 줄에 초·한 한 수씩 짝지어 보여준다.
  const rows: { no: number; cho?: HistoryEntry & { i: number }; han?: HistoryEntry & { i: number } }[] =
    [];
  history.forEach((entry, i) => {
    if (i === 0) return;
    const withIndex = { ...entry, i };
    if (entry.mover === "cho") {
      rows.push({ no: rows.length + 1, cho: withIndex });
    } else if (rows.length && !rows[rows.length - 1].han) {
      rows[rows.length - 1].han = withIndex;
    } else {
      rows.push({ no: rows.length + 1, han: withIndex });
    }
  });

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
          <p className="muted pad">아직 둔 수가 없습니다.</p>
        ) : (
          <table className="move-table">
            <tbody>
              {rows.map((row) => (
                <tr key={row.no}>
                  <td className="move-no">{row.no}</td>
                  {(["cho", "han"] as Side[]).map((side) => {
                    const cell = row[side];
                    return (
                      <td key={side}>
                        {cell ? (
                          <button
                            type="button"
                            className={
                              "move-cell " +
                              side +
                              (cursor === cell.i ? " active" : "")
                            }
                            onClick={() => onJump(cell.i)}
                            title={`${SIDE_LABEL[side]} · ${cell.notation}`}
                          >
                            {cell.notation}
                          </button>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
