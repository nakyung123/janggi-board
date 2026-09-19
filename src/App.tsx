import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Board } from "./components/Board";
import { PiecePalette } from "./components/PiecePalette";
import type { Brush } from "./components/PiecePalette";
import { AnalysisPanel, arrowOf } from "./components/AnalysisPanel";
import { EngineControls } from "./components/EngineControls";
import { MoveList } from "./components/MoveList";
import type { HistoryEntry } from "./components/MoveList";
import { PositionTools } from "./components/PositionTools";

import { useAnalysis, useEngine } from "./engine/useEngine";
import type { EngineOptions, SearchLimits } from "./engine/types";

import type { Board as BoardMap, Position, Square } from "./janggi/board";
import { START_FEN, parseFen, toFen } from "./janggi/board";
import { describeMove, splitMove } from "./janggi/notation";
import type { Side } from "./janggi/pieces";
import { sideOf } from "./janggi/pieces";
import { applySetup } from "./janggi/setups";
import type { Setup } from "./janggi/setups";

type EngineSide = "none" | "cho" | "han" | "both";

const initialHistory: HistoryEntry[] = [
  { fen: START_FEN, move: null, notation: "시작", mover: null },
];

/** 장기에는 승진도 앙파상도 없다. 수를 두는 일은 기물 하나를 옮기는 것이 전부다. */
function applyMove(pos: Position, from: Square, to: Square): Position {
  const board: BoardMap = { ...pos.board };
  const captured = Boolean(board[to]);
  if (from !== to) {
    board[to] = board[from];
    delete board[from];
  }
  return {
    board,
    turn: pos.turn === "cho" ? "han" : "cho",
    halfmove: captured || from === to ? 0 : pos.halfmove + 1,
    fullmove: pos.turn === "han" ? pos.fullmove + 1 : pos.fullmove,
  };
}

export default function App() {
  const { engine, status, progress, error, evalMode } = useEngine();

  const [history, setHistory] = useState<HistoryEntry[]>(initialHistory);
  const [cursor, setCursor] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [brush, setBrush] = useState<Brush>(null);
  const [flipped, setFlipped] = useState(false);
  const [selected, setSelected] = useState<Square | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const [analysisOn, setAnalysisOn] = useState(true);
  const [engineSide, setEngineSide] = useState<EngineSide>("none");
  const [options, setOptions] = useState<EngineOptions>({
    threads: Math.max(1, Math.min(navigator.hardwareConcurrency || 2, 4)),
    hashMb: 128,
    multiPV: 3,
    variant: "janggi",
  });
  // 분석판의 기본 동작은 '계속 생각하기'다. 국면을 바꾸면 그 자리에서 다시 판다.
  // 엔진이 둘 차례일 때만 아래에서 시간 제한을 걸어준다.
  const [limits, setLimits] = useState<SearchLimits>({ infinite: true });

  const entry = history[cursor];
  const position = useMemo(() => parseFen(entry.fen), [entry.fen]);
  const fen = entry.fen;

  // 엔진이 둘 차례인지 --------------------------------------------------
  const engineTurn =
    !editMode &&
    (engineSide === "both" ||
      (engineSide !== "none" && engineSide === position.turn));

  // 엔진이 둘 차례인데 시간 제한이 없으면 영원히 생각한다. 1초로 막아준다.
  const effectiveLimits: SearchLimits = useMemo(
    () =>
      engineTurn && limits.infinite ? { movetimeMs: 1000 } : limits,
    [engineTurn, limits]
  );

  const optionsKey = useMemo(
    () =>
      [
        options.threads,
        options.hashMb,
        options.multiPV,
        options.variant,
        effectiveLimits.depth,
        effectiveLimits.movetimeMs,
        effectiveLimits.infinite,
        engineTurn,
      ].join("|"),
    [options, effectiveLimits, engineTurn]
  );

  useEffect(() => {
    if (engine) void engine.setOptions(options);
  }, [engine, options]);

  const { snapshot, legal } = useAnalysis(
    engine,
    fen,
    (analysisOn || engineTurn) && !editMode,
    effectiveLimits,
    optionsKey
  );

  // --- 수 두기 ----------------------------------------------------------

  const pushMove = useCallback(
    (from: Square, to: Square) => {
      setHistory((prev) => {
        const base = prev.slice(0, cursor + 1);
        const current = parseFen(base[base.length - 1].fen);
        const notation = describeMove(from + to, current.board);
        const next = applyMove(current, from, to);
        return [
          ...base,
          {
            fen: toFen(next),
            move: from + to,
            notation: notation.short,
            mover: current.turn,
          },
        ];
      });
      setCursor((c) => c + 1);
      setSelected(null);
    },
    [cursor]
  );

  /** 편집 결과를 기보의 새 시작점으로 삼는다. 편집 중에는 수순을 쌓지 않는다. */
  const replacePosition = useCallback((next: Position) => {
    setHistory([
      { fen: toFen(next), move: null, notation: "편집", mover: null },
    ]);
    setCursor(0);
    setSelected(null);
  }, []);

  // 엔진 차례가 되면 탐색이 끝나는 대로 그 수를 둔다.
  const playedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!engineTurn || !snapshot || snapshot.running || !snapshot.bestmove) return;
    if (playedFor.current === fen) return;
    playedFor.current = fen;
    const { from, to } = splitMove(snapshot.bestmove);
    if (from && to) pushMove(from, to);
  }, [engineTurn, snapshot, fen, pushMove]);

  // --- 판 조작 ----------------------------------------------------------

  const legalFrom = useMemo(() => {
    const map = new Map<Square, Square[]>();
    for (const move of legal) {
      const { from, to } = splitMove(move);
      if (!from) continue;
      const list = map.get(from) ?? [];
      list.push(to);
      map.set(from, list);
    }
    return map;
  }, [legal]);

  const targets = selected ? (legalFrom.get(selected) ?? []) : [];

  const handleSquareClick = (square: Square) => {
    if (editMode) {
      if (brush === "erase") {
        const board = { ...position.board };
        delete board[square];
        replacePosition({ ...position, board });
        return;
      }
      if (brush) {
        replacePosition({
          ...position,
          board: { ...position.board, [square]: brush },
        });
        return;
      }
      setSelected(selected === square ? null : square);
      return;
    }

    if (selected && targets.includes(square)) {
      pushMove(selected, square);
      return;
    }
    // 자기 차례의 기물만 집을 수 있다.
    const piece = position.board[square];
    if (piece && sideOf(piece) === position.turn && legalFrom.has(square)) {
      setSelected(selected === square ? null : square);
    } else {
      setSelected(null);
    }
  };

  const handleMove = (from: Square, to: Square) => {
    if (editMode) {
      const board = { ...position.board };
      if (board[from]) {
        board[to] = board[from];
        delete board[from];
        replacePosition({ ...position, board });
      }
      return;
    }
    if (legalFrom.get(from)?.includes(to)) pushMove(from, to);
    else setSelected(null);
  };

  const handleRemove = (square: Square) => {
    if (!editMode) return;
    const board = { ...position.board };
    delete board[square];
    replacePosition({ ...position, board });
  };

  const handleSetup = (side: Side, setup: Setup) => {
    replacePosition({
      ...position,
      board: applySetup(position.board, side, setup),
    });
  };

  const handleFen = (value: string) => {
    const parsed = parseFen(value); // 형식이 틀리면 여기서 예외가 난다
    setHistory([
      { fen: toFen(parsed), move: null, notation: "불러옴", mover: null },
    ]);
    setCursor(0);
    setSelected(null);
  };

  // --- 화살표 -----------------------------------------------------------

  const bestArrow =
    arrowOf(hover) ??
    (!editMode && snapshot?.lines[0]?.pv[0]
      ? arrowOf(snapshot.lines[0].pv[0])
      : null);

  const lastMove = entry.move
    ? (() => {
        const { from, to } = splitMove(entry.move);
        return from && to && from !== to ? { from, to } : null;
      })()
    : null;

  // --- 화면 -------------------------------------------------------------

  if (status !== "ready") {
    return (
      <div className="boot">
        <h1>장기 분석판</h1>
        {status === "error" ? (
          <div className="boot-error">
            <p>엔진을 시작하지 못했습니다.</p>
            <pre>{error}</pre>
          </div>
        ) : (
          <>
            <p className="muted">
              {progress?.stage ?? "엔진"} 준비 중…
              {progress && progress.total > 0 && (
                <>
                  {" "}
                  {(progress.loaded / 1e6).toFixed(1)} /{" "}
                  {(progress.total / 1e6).toFixed(1)} MB
                </>
              )}
            </p>
            <div className="boot-bar">
              <div
                style={{
                  width:
                    progress && progress.total
                      ? `${(progress.loaded / progress.total) * 100}%`
                      : "30%",
                }}
              />
            </div>
            <p className="muted small">
              Fairy-Stockfish 엔진과 11MB 장기 신경망을 내려받는 중입니다.
              처음 한 번만 받고 이후에는 브라우저가 캐시합니다.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="top">
        <h1>장기 분석판</h1>
        <span className="badge">{evalMode ?? ""}</span>
        <span className="turn-tag">
          둘 차례:{" "}
          <b className={position.turn}>
            {position.turn === "cho" ? "초 楚" : "한 漢"}
          </b>
        </span>
      </header>

      <main className="layout">
        <section className="board-col">
          <Board
            board={position.board}
            flipped={flipped}
            editMode={editMode}
            selected={selected}
            targets={targets}
            lastMove={lastMove}
            bestMove={bestArrow}
            onSquareClick={handleSquareClick}
            onMove={handleMove}
            onRemove={handleRemove}
          />
          {editMode && <PiecePalette brush={brush} onPick={setBrush} />}
          {!editMode && (
            <div className="board-actions">
              <button
                type="button"
                disabled={cursor === 0}
                onClick={() => {
                  setCursor((c) => Math.max(0, c - 1));
                  setSelected(null);
                }}
              >
                ← 무르기
              </button>
              <button
                type="button"
                disabled={cursor >= history.length - 1}
                onClick={() => {
                  setCursor((c) => Math.min(history.length - 1, c + 1));
                  setSelected(null);
                }}
              >
                다시 →
              </button>
              <button
                type="button"
                title="궁을 제자리에 두는 것이 장기의 한수쉼입니다"
                onClick={() => {
                  const king = Object.entries(position.board).find(
                    ([, p]) =>
                      p.toLowerCase() === "k" && sideOf(p) === position.turn
                  );
                  if (king && legal.has(king[0] + king[0]))
                    pushMove(king[0], king[0]);
                }}
              >
                한수쉼
              </button>
            </div>
          )}
        </section>

        <section className="side-col">
          <PositionTools
            position={position}
            editMode={editMode}
            onEditMode={(on) => {
              setEditMode(on);
              setSelected(null);
              setBrush(null);
            }}
            onFen={handleFen}
            onTurn={(turn) => replacePosition({ ...position, turn })}
            onSetup={handleSetup}
            onClear={() => replacePosition({ ...position, board: {} })}
            onReset={() => {
              setHistory(initialHistory);
              setCursor(0);
              setSelected(null);
            }}
            onFlip={() => setFlipped((f) => !f)}
          />

          <AnalysisPanel
            snapshot={snapshot}
            board={position.board}
            enabled={(analysisOn || engineTurn) && !editMode}
            onHoverLine={setHover}
            onPlayLine={(move) => {
              const { from, to } = splitMove(move);
              if (from && to) pushMove(from, to);
            }}
          />

          <EngineControls
            options={options}
            limits={limits}
            analysisOn={analysisOn}
            engineSide={engineSide}
            onOptions={(patch) => setOptions((o) => ({ ...o, ...patch }))}
            onLimits={(patch) => setLimits((l) => ({ ...l, ...patch }))}
            onAnalysisOn={setAnalysisOn}
            onEngineSide={setEngineSide}
          />

          <MoveList
            history={history}
            cursor={cursor}
            onJump={(i) => {
              setCursor(i);
              setSelected(null);
            }}
          />
        </section>
      </main>
    </div>
  );
}
