// 편집 모드용 기물 팔레트
//
// 여기서 기물을 하나 고른 뒤 판의 교차점을 누르면 그 자리에 놓인다.
// 지우개를 고르면 누른 자리의 기물이 사라진다.

import type { PieceChar, Side } from "../../janggi/pieces";
import { PIECE_TYPES, SIDE_LABEL, charOf, pieceInfo } from "../../janggi/pieces";
import { PieceGlyph } from "./PieceGlyph";

export type Brush = PieceChar | "erase" | null;

interface Props {
  brush: Brush;
  onPick: (brush: Brush) => void;
}

const SIDES: Side[] = ["cho", "han"];

export function PiecePalette({ brush, onPick }: Props) {
  return (
    <div className="palette">
      {SIDES.map((side) => (
        <div key={side} className="palette-row">
          <span className={"palette-side " + side}>{SIDE_LABEL[side]}</span>
          {PIECE_TYPES.map((type) => {
            const ch = charOf(type, side);
            const info = pieceInfo(ch);
            return (
              <button
                key={ch}
                type="button"
                className={
                  "palette-piece " + side + (brush === ch ? " active" : "")
                }
                title={`${SIDE_LABEL[side]} ${info.name}`}
                onClick={() => onPick(brush === ch ? null : ch)}
              >
                {/* 판과 같은 글자를 쓴다. 초는 초서, 한은 정자. */}
                <svg viewBox="-16 -16 32 32" width="26" height="26">
                  <PieceGlyph piece={ch} radius={14} />
                </svg>
              </button>
            );
          })}
        </div>
      ))}
      <div className="palette-row">
        <span className="palette-side muted">도구</span>
        <button
          type="button"
          className={"palette-piece erase" + (brush === "erase" ? " active" : "")}
          title="누른 자리의 기물을 지웁니다"
          onClick={() => onPick(brush === "erase" ? null : "erase")}
        >
          지움
        </button>
        <span className="palette-hint">
          기물을 판 밖으로 끌어내도 지워집니다
        </span>
      </div>
    </div>
  );
}
