// 장기판
//
// 장기는 칸이 아니라 '선의 교차점' 위에 기물을 놓는다. 그래서 칸을 그리는 대신
// 격자선을 긋고 교차점마다 기물을 얹는다. 궁성에는 사선이 추가로 들어간다.

import { useCallback, useRef, useState } from "react";
import type { Board as BoardMap, Square } from "../../janggi/board";
import { FILES, RANKS, fileIdxOf, rankOf, sq } from "../../janggi/board";
import { pieceInfo } from "../../janggi/pieces";
import { toJanggiCoord } from "../../janggi/notation";
import { PieceBody, PieceDefs } from "./PieceGlyph";

const CELL = 62;
/*
 * 격자 바깥 여백. 좌표 숫자가 들어갈 만큼만 남긴다.
 *
 * 예전에는 56 이었는데, 그러면 격자가 판 넓이의 83% 밖에 안 돼서 가장자리에
 * 맨 나무만 넓게 보였다. 46 이면 86% 다. 가장자리 기물의 끝(반지름 26.2 인
 * 차 기준 21.8px 지점)과 좌표 숫자가 겨우 스치지 않는 선이기도 하다.
 */
const MARGIN = 46;
const WIDTH = (FILES - 1) * CELL + MARGIN * 2;
const HEIGHT = (RANKS - 1) * CELL + MARGIN * 2;

export interface BoardProps {
  board: BoardMap;
  flipped: boolean;
  /** 편집 모드에서는 아무 교차점이나 집고 놓을 수 있다. */
  editMode: boolean;
  selected: Square | null;
  /** 지금 고른 기물이 갈 수 있는 곳 */
  targets: Square[];
  lastMove: { from: Square; to: Square } | null;
  /** 엔진이 첫손에 꼽는 수. 파란 화살표. */
  bestMove: { from: Square; to: Square } | null;
  /** 분석 줄에 마우스를 올려 미리 보는 수. 노란 화살표라 최선수와 헷갈리지 않는다. */
  hoverMove?: { from: Square; to: Square } | null;
  /** 장군을 맞은 궁의 자리 */
  checkedKing?: Square | null;
  onSquareClick: (square: Square) => void;
  onMove: (from: Square, to: Square) => void;
  /** 편집 모드에서 기물을 판 밖으로 끌어내면 지운다. */
  onRemove?: (square: Square) => void;
}

export function Board(props: BoardProps) {
  const {
    board,
    flipped,
    editMode,
    selected,
    targets,
    lastMove,
    bestMove,
    hoverMove,
    checkedKing,
    onSquareClick,
    onMove,
    onRemove,
  } = props;

  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{
    from: Square;
    x: number;
    y: number;
    outside: boolean;
  } | null>(null);

  // 화면 좌표 ↔ 교차점 --------------------------------------------------
  const xOf = useCallback(
    (fileIdx: number) => MARGIN + (flipped ? FILES - 1 - fileIdx : fileIdx) * CELL,
    [flipped]
  );
  const yOf = useCallback(
    (rank: number) => MARGIN + (flipped ? rank - 1 : RANKS - rank) * CELL,
    [flipped]
  );
  const posOf = useCallback(
    (square: Square) => ({ x: xOf(fileIdxOf(square)), y: yOf(rankOf(square)) }),
    [xOf, yOf]
  );

  /** 포인터 위치를 SVG 좌표로 바꾼 뒤 가장 가까운 교차점을 찾는다. */
  const locate = useCallback(
    (e: React.PointerEvent): { square: Square | null; x: number; y: number } => {
      const svg = svgRef.current;
      if (!svg) return { square: null, x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * WIDTH;
      const y = ((e.clientY - rect.top) / rect.height) * HEIGHT;

      const rawFile = Math.round((x - MARGIN) / CELL);
      const rawRank = Math.round((y - MARGIN) / CELL);
      const fileIdx = flipped ? FILES - 1 - rawFile : rawFile;
      const rank = flipped ? rawRank + 1 : RANKS - rawRank;

      if (fileIdx < 0 || fileIdx >= FILES || rank < 1 || rank > RANKS) {
        return { square: null, x, y };
      }
      // 교차점에서 너무 멀면 놓을 곳으로 치지 않는다.
      const target = sq(fileIdx, rank);
      const p = { x: xOf(fileIdx), y: yOf(rank) };
      const far = Math.hypot(x - p.x, y - p.y) > CELL * 0.62;
      return { square: far ? null : target, x, y };
    },
    [flipped, xOf, yOf]
  );

  const handlePointerDown = (e: React.PointerEvent, square: Square) => {
    if (!board[square]) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const { x, y } = locate(e);
    setDrag({ from: square, x, y, outside: false });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const { square, x, y } = locate(e);
    setDrag({ ...drag, x, y, outside: square === null });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!drag) return;
    const { square } = locate(e);
    const from = drag.from;
    setDrag(null);

    if (!square) {
      // 판 밖으로 끌어냈다 — 편집 모드에서는 기물을 치우는 동작이다.
      if (editMode) onRemove?.(from);
      return;
    }
    if (square === from) {
      onSquareClick(from); // 제자리 클릭은 선택/해제로 취급
      return;
    }
    onMove(from, square);
  };

  const targetSet = new Set(targets);

  // 격자선 -------------------------------------------------------------
  const lines: React.ReactNode[] = [];
  for (let f = 0; f < FILES; f++) {
    lines.push(
      <line
        key={"v" + f}
        x1={MARGIN + f * CELL}
        y1={MARGIN}
        x2={MARGIN + f * CELL}
        y2={HEIGHT - MARGIN}
      />
    );
  }
  for (let r = 0; r < RANKS; r++) {
    lines.push(
      <line
        key={"h" + r}
        x1={MARGIN}
        y1={MARGIN + r * CELL}
        x2={WIDTH - MARGIN}
        y2={MARGIN + r * CELL}
      />
    );
  }

  // 궁성 사선. 위/아래 궁성 각각 X자 두 줄. -----------------------------
  const palaceDiagonals = [
    [sq(3, 10), sq(5, 8)],
    [sq(5, 10), sq(3, 8)],
    [sq(3, 3), sq(5, 1)],
    [sq(5, 3), sq(3, 1)],
  ].map(([a, b], i) => {
    const p = posOf(a);
    const q = posOf(b);
    return <line key={"d" + i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />;
  });

  // 좌표 눈금. 장기 기보 방식(가로줄 1~0 위에서부터, 세로줄 1~9 왼쪽부터) --
  const labels: React.ReactNode[] = [];
  for (let f = 0; f < FILES; f++) {
    const text = String(f + 1);
    const x = xOf(f);
    labels.push(
      <text key={"lf" + f} x={x} y={HEIGHT - MARGIN + 32} className="coord">
        {text}
      </text>
    );
  }
  for (let r = 1; r <= RANKS; r++) {
    const text = String((11 - r) % 10);
    const y = yOf(r);
    labels.push(
      <text key={"lr" + r} x={MARGIN - 30} y={y + 4} className="coord">
        {text}
      </text>
    );
  }

  const renderPiece = (square: Square, dragging: boolean) => {
    const piece = board[square];
    if (!piece) return null;
    const info = pieceInfo(piece);
    const p = dragging && drag ? { x: drag.x, y: drag.y } : posOf(square);
    const r = (CELL / 2) * info.size * 0.94;

    return (
      <g
        key={square}
        data-piece={square}
        className={"piece" + (dragging ? " dragging" : "")}
        transform={`translate(${p.x} ${p.y})`}
        onPointerDown={(e) => handlePointerDown(e, square)}
        style={{ opacity: drag && drag.from === square && !dragging ? 0.25 : 1 }}
      >
        <PieceBody piece={piece} radius={r} />
      </g>
    );
  };

  const squares: Square[] = [];
  for (let r = 1; r <= RANKS; r++) {
    for (let f = 0; f < FILES; f++) squares.push(sq(f, r));
  }

  // 최선수와 미리보기 수를 색으로 나눈다. 둘 다 파랗던 때는 구분이 안 됐다.
  const arrows = [
    bestMove && { key: "best", cls: "best-arrow", m: bestMove, head: "arrowBest" },
    hoverMove && { key: "hover", cls: "hover-arrow", m: hoverMove, head: "arrowHover" },
  ].filter(Boolean) as {
    key: string;
    cls: string;
    m: { from: Square; to: Square };
    head: string;
  }[];

  return (
    <svg
      ref={svgRef}
      className="board"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setDrag(null)}
    >
      <defs>
        <linearGradient id="wood" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#f3dcac" />
          <stop offset="52%" stopColor="#ecd19b" />
          <stop offset="100%" stopColor="#e2c081" />
        </linearGradient>
        {/* 세로 나무결. 아주 옅게 깔아야 격자선을 방해하지 않는다. */}
        <pattern id="grain" width="31" height="4" patternUnits="userSpaceOnUse">
          <path d="M5 0 V4" stroke="#7a5420" strokeWidth="0.8" opacity="0.028" />
          <path d="M14 0 V4" stroke="#fffaf0" strokeWidth="1.4" opacity="0.13" />
          <path d="M23 0 V4" stroke="#7a5420" strokeWidth="0.6" opacity="0.02" />
        </pattern>
        <PieceDefs />
        <marker id="arrowBest" markerWidth="4" markerHeight="4" refX="2.4" refY="2" orient="auto">
          <path d="M0,0 L4,2 L0,4 z" fill="#1d4ed8" />
        </marker>
        <marker id="arrowHover" markerWidth="4" markerHeight="4" refX="2.4" refY="2" orient="auto">
          <path d="M0,0 L4,2 L0,4 z" fill="#d97706" />
        </marker>
      </defs>

      <rect width={WIDTH} height={HEIGHT} rx="9" fill="url(#wood)" />
      <rect width={WIDTH} height={HEIGHT} rx="9" fill="url(#grain)" />
      <rect
        x="0.75"
        y="0.75"
        width={WIDTH - 1.5}
        height={HEIGHT - 1.5}
        rx="8.5"
        className="board-edge"
      />

      <g className="grid">{lines}</g>
      <g className="grid">{palaceDiagonals}</g>
      <g>{labels}</g>

      {/* 직전 수 표시 */}
      {lastMove &&
        [lastMove.from, lastMove.to].map((s) => {
          const p = posOf(s);
          return (
            <rect
              key={"last" + s}
              className="last-move"
              x={p.x - CELL * 0.42}
              y={p.y - CELL * 0.42}
              width={CELL * 0.84}
              height={CELL * 0.84}
              rx="5"
            />
          );
        })}

      {/* 장군을 맞은 궁 */}
      {checkedKing &&
        (() => {
          const p = posOf(checkedKing);
          return (
            <circle
              className="checked-king"
              cx={p.x}
              cy={p.y}
              r={CELL * 0.48}
            />
          );
        })()}

      {/* 선택 표시 */}
      {selected &&
        (() => {
          const p = posOf(selected);
          return (
            <circle
              className="selected"
              cx={p.x}
              cy={p.y}
              r={CELL * 0.46}
            />
          );
        })()}

      {/* 갈 수 있는 곳 */}
      {targets.map((s) => {
        const p = posOf(s);
        const occupied = Boolean(board[s]);
        return occupied ? (
          <circle
            key={"t" + s}
            className="target-capture"
            cx={p.x}
            cy={p.y}
            r={CELL * 0.44}
          />
        ) : (
          <circle
            key={"t" + s}
            className="target"
            cx={p.x}
            cy={p.y}
            r={CELL * 0.14}
          />
        );
      })}

      {/* 클릭 판정용 투명 영역. 기물이 없는 교차점도 집을 수 있어야 한다. */}
      {squares.map((s) => {
        const p = posOf(s);
        return (
          <circle
            key={"hit" + s}
            cx={p.x}
            cy={p.y}
            r={CELL * 0.46}
            fill="transparent"
            data-square={s}
            className={targetSet.has(s) || editMode ? "hit active" : "hit"}
            onPointerUp={() => {
              if (!drag) onSquareClick(s);
            }}
          >
            <title>{toJanggiCoord(s)}</title>
          </circle>
        );
      })}

      {squares.map((s) => renderPiece(s, false))}

      {/* 엔진 추천수(파랑)와 미리보기 수(노랑) */}
      {arrows.map((a) => {
        const p = posOf(a.m.from);
        const q = posOf(a.m.to);
        return (
          <line
            key={a.key}
            className={a.cls}
            x1={p.x}
            y1={p.y}
            x2={q.x}
            y2={q.y}
            markerEnd={`url(#${a.head})`}
          />
        );
      })}

      {/* 끌고 있는 기물은 맨 위에 다시 그린다. */}
      {drag && (
        <g className={drag.outside ? "drag-layer removing" : "drag-layer"}>
          {renderPiece(drag.from, true)}
        </g>
      )}
    </svg>
  );
}
