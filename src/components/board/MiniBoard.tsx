// 작은 판
//
// 기보 목록에서 판마다 마지막 국면을 그림으로 보여준다. 카카오장기의 기보
// 타임라인처럼, 글자(vs 16급 · 기권패)만으로는 어떤 판이었는지 떠오르지 않는다.
// 끝난 모양을 보면 "아, 차를 떼인 판" 하고 알아본다.
//
// 큰 판(Board.tsx)과 같은 좌표를 쓰되 눌리지 않고, 빗면·그림자·나무결 없이
// 납작하게 그린다. 목록에 수십 장이 서므로 가벼워야 한다.

import type { Board as BoardMap } from "../../janggi/board";
import { FILES, RANKS, fileIdxOf, rankOf, sq } from "../../janggi/board";
import { pieceInfo } from "../../janggi/pieces";
import type { PieceChar } from "../../janggi/pieces";
import { PieceBody } from "./PieceGlyph";

// 큰 판과 같은 비율이어야 목록의 판이 큰 판을 줄인 것으로 읽힌다(Board.tsx).
const CELL = 62;
const MARGIN = 30;
const WIDTH = (FILES - 1) * CELL + MARGIN * 2;
const HEIGHT = (RANKS - 1) * CELL + MARGIN * 2;

const x = (fileIdx: number) => MARGIN + fileIdx * CELL;
const y = (rank: number) => MARGIN + (RANKS - rank) * CELL;

interface Props {
  board: BoardMap;
  /** 한을 잡은 판은 한을 아래에 둔다. 두던 때 보던 모양 그대로. */
  flipped?: boolean;
}

export function MiniBoard({ board, flipped }: Props) {
  const lines: React.ReactNode[] = [];
  for (let f = 0; f < FILES; f++) {
    lines.push(<line key={"v" + f} x1={x(f)} y1={y(RANKS)} x2={x(f)} y2={y(1)} />);
  }
  for (let r = 1; r <= RANKS; r++) {
    lines.push(<line key={"h" + r} x1={x(0)} y1={y(r)} x2={x(FILES - 1)} y2={y(r)} />);
  }
  // 궁성 사선
  for (const [a, b] of [
    [sq(3, 10), sq(5, 8)],
    [sq(5, 10), sq(3, 8)],
    [sq(3, 3), sq(5, 1)],
    [sq(5, 3), sq(3, 1)],
  ]) {
    lines.push(
      <line
        key={a + b}
        x1={x(fileIdxOf(a))}
        y1={y(rankOf(a))}
        x2={x(fileIdxOf(b))}
        y2={y(rankOf(b))}
      />
    );
  }

  return (
    <svg
      className="mini-board"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      aria-hidden="true"
      focusable="false"
    >
      <rect width={WIDTH} height={HEIGHT} rx="9" className="mini-wood" />
      <g transform={flipped ? `rotate(180 ${WIDTH / 2} ${HEIGHT / 2})` : undefined}>
        <g className="mini-grid">{lines}</g>
        {Object.entries(board).map(([s, piece]) => {
          const info = pieceInfo(piece as PieceChar);
          const cx = x(fileIdxOf(s));
          const cy = y(rankOf(s));
          return (
            // 뒤집어도 글자는 바로 서야 한다. 판을 돌린 만큼 기물을 되돌린다.
            <g
              key={s}
              transform={
                `translate(${cx} ${cy})` + (flipped ? " rotate(180)" : "")
              }
            >
              <PieceBody piece={piece as PieceChar} radius={(CELL / 2) * info.size * 0.94} flat />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
