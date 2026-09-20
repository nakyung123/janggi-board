import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Board } from "./components/board/Board";
import { PiecePalette } from "./components/board/PiecePalette";
import type { Brush } from "./components/board/PiecePalette";
import { AnalysisPanel, arrowOf } from "./components/panels/AnalysisPanel";
import { EngineControls } from "./components/panels/EngineControls";
import { EvalGraph } from "./components/panels/EvalGraph";
import { MoveList } from "./components/panels/MoveList";
import type { HistoryEntry } from "./components/panels/MoveList";
import { PositionTools } from "./components/panels/PositionTools";
import { StatusBanner } from "./components/StatusBanner";

import { useAnalysis, useEngine } from "./engine/useEngine";
import type { EngineOptions, PositionRef, SearchLimits } from "./engine/types";
import { useKeyboard } from "./hooks/useKeyboard";

import type { Board as BoardMap, Position, Square } from "./janggi/board";
import { START_FEN, parseFen, toFen } from "./janggi/board";
import { describeMove, splitMove } from "./janggi/notation";
import type { Side } from "./janggi/pieces";
import { sideOf } from "./janggi/pieces";
import { applySetup } from "./janggi/setups";
import type { Setup } from "./janggi/setups";
import { gameStatus, isGameOver } from "./janggi/status";
import { buildRecord, downloadRecord, parseRecord } from "./janggi/record";

type EngineSide = "none" | "cho" | "han" | "both";

const initialHistory: HistoryEntry[] = [
  { fen: START_FEN, move: null, notation: "시작", mover: null, score: null },
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
  const [flipped, setFlipped] = useState(false);
  const [selected, setSelected] = useState<Square | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 편집 모드는 기보와 따로 논다.
  // 편집하는 동안 판은 draft 에만 반영하고, 편집을 끝낼 때 비로소 기보를 정한다.
  // 이렇게 해야 "편집 한 번 눌렀다가 두던 판이 날아가는" 일이 없다.
  const [draft, setDraft] = useState<Position | null>(null);
  const editMode = draft !== null;
  const [brush, setBrush] = useState<Brush>(null);

  const [analysisOn, setAnalysisOn] = useState(true);
  const [engineSide, setEngineSide] = useState<EngineSide>("none");
  const [options, setOptions] = useState<EngineOptions>({
    threads: Math.max(1, Math.min(navigator.hardwareConcurrency || 2, 4)),
    hashMb: 128,
    multiPV: 3,
    variant: "janggi",
  });
  // 기본값은 3초. 무제한은 코어를 계속 붙잡고 있어서 기본으로 두기엔 부담스럽다.
  const [limits, setLimits] = useState<SearchLimits>({ movetimeMs: 3000 });

  const entry = history[cursor];
  const played = useMemo(() => parseFen(entry.fen), [entry.fen]);
  const position = draft ?? played;

  /**
   * 엔진에 넘길 국면. 지금 FEN 만 주면 안 되고 수순을 함께 줘야 한다.
   * 장기의 장군반복 금지·빅장 판정이 "어떻게 여기까지 왔는가"를 보기 때문이다.
   * 편집 중에는 수순이랄 게 없으니 고친 판 자체를 시작 국면으로 준다.
   */
  const positionRef: PositionRef = useMemo(() => {
    if (draft) return { startFen: toFen(draft), moves: [] };
    return {
      startFen: history[0].fen,
      moves: history
        .slice(1, cursor + 1)
        .map((h) => h.move)
        .filter((m): m is string => Boolean(m)),
    };
  }, [draft, history, cursor]);

  // --- 엔진 차례 --------------------------------------------------------

  const engineTurn =
    !editMode &&
    (engineSide === "both" ||
      (engineSide !== "none" && engineSide === position.turn));

  // 엔진이 둘 차례인데 시간 제한이 없으면 영원히 생각한다. 1초로 막아준다.
  const effectiveLimits: SearchLimits = useMemo(
    () => (engineTurn && limits.infinite ? { movetimeMs: 1000 } : limits),
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

  const { snapshot, legal, checkers, probed } = useAnalysis(
    engine,
    positionRef,
    analysisOn || engineTurn,
    effectiveLimits,
    optionsKey
  );

  // --- 대국 상태 --------------------------------------------------------

  const gstatus = useMemo(
    () => gameStatus({ position, legal, checkers, ready: probed }),
    [position, legal, checkers, probed]
  );
  const over = isGameOver(gstatus);

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
            score: null,
          },
        ];
      });
      setCursor((c) => c + 1);
      setSelected(null);
    },
    [cursor]
  );

  /** 분석이 끝나면 그 국면의 평가치를 기보에 적어둔다. 형세 그래프의 재료가 된다. */
  useEffect(() => {
    if (editMode || !snapshot?.lines.length) return;
    const line = snapshot.lines[0];
    const score = line.mate !== null ? (line.mate > 0 ? 20 : -20) : line.score;
    setHistory((prev) => {
      if (!prev[cursor] || prev[cursor].score === score) return prev;
      const next = [...prev];
      next[cursor] = { ...next[cursor], score };
      return next;
    });
  }, [snapshot, cursor, editMode]);

  // 엔진 차례가 되면 탐색이 끝나는 대로 그 수를 둔다.
  const playedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!engineTurn || over) return;
    if (!snapshot || snapshot.running || !snapshot.bestmove) return;
    const key = positionRef.startFen + "|" + positionRef.moves.join(" ");
    if (playedFor.current === key) return;
    playedFor.current = key;
    const { from, to } = splitMove(snapshot.bestmove);
    if (from && to) pushMove(from, to);
  }, [engineTurn, snapshot, positionRef, pushMove, over]);

  // --- 기보 이동 --------------------------------------------------------

  const goTo = useCallback(
    (i: number) => {
      setCursor((c) => {
        const next = Math.max(0, Math.min(history.length - 1, i));
        if (next !== c) setSelected(null);
        return next;
      });
    },
    [history.length]
  );

  useKeyboard(
    useMemo(
      () => ({
        prev: () => goTo(cursor - 1),
        next: () => goTo(cursor + 1),
        first: () => goTo(0),
        last: () => goTo(history.length - 1),
        flip: () => setFlipped((f) => !f),
        toggleAnalysis: () => setAnalysisOn((a) => !a),
      }),
      [cursor, goTo, history.length]
    ),
    !editMode
  );

  // --- 편집 -------------------------------------------------------------

  const enterEdit = () => {
    setDraft(parseFen(entry.fen));
    setSelected(null);
    setBrush(null);
  };

  /**
   * 편집을 끝낸다. 판이 그대로면 기보를 건드리지 않고, 달라졌을 때만
   * 편집한 국면을 새 시작점으로 삼는다.
   */
  const leaveEdit = () => {
    if (!draft) return;
    const editedFen = toFen(draft);
    if (editedFen !== entry.fen) {
      setHistory([
        { fen: editedFen, move: null, notation: "편집", mover: null, score: null },
      ]);
      setCursor(0);
      setNotice("편집한 국면을 새 시작 국면으로 삼았습니다.");
    }
    setDraft(null);
    setSelected(null);
    setBrush(null);
  };

  const editBoard = (change: (b: BoardMap) => BoardMap) => {
    setDraft((d) => (d ? { ...d, board: change({ ...d.board }) } : d));
  };

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
        editBoard((b) => {
          delete b[square];
          return b;
        });
        return;
      }
      if (brush) {
        editBoard((b) => ({ ...b, [square]: brush }));
        return;
      }
      setSelected(selected === square ? null : square);
      return;
    }

    if (over) return;

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
      editBoard((b) => {
        if (!b[from]) return b;
        b[to] = b[from];
        delete b[from];
        return b;
      });
      return;
    }
    if (over) return;
    if (legalFrom.get(from)?.includes(to)) pushMove(from, to);
    else setSelected(null);
  };

  const handleRemove = (square: Square) => {
    if (!editMode) return;
    editBoard((b) => {
      delete b[square];
      return b;
    });
  };

  // --- 국면 도구 --------------------------------------------------------

  const startFrom = (next: Position, label: string) => {
    if (editMode) {
      setDraft(next);
      return;
    }
    setHistory([
      { fen: toFen(next), move: null, notation: label, mover: null, score: null },
    ]);
    setCursor(0);
    setSelected(null);
  };

  const handleFen = (value: string) => {
    startFrom(parseFen(value), "불러옴"); // 형식이 틀리면 parseFen 이 예외를 던진다
  };

  // --- 기보 저장·불러오기 -----------------------------------------------

  const saveRecord = () => {
    downloadRecord(
      buildRecord({
        startFen: history[0].fen,
        moves: history
          .slice(1)
          .map((h) => ({
            move: h.move ?? "",
            notation: h.notation,
            score: h.score ?? undefined,
          })),
        variant: options.variant,
      })
    );
  };

  const loadRecord = async (file: File) => {
    try {
      const record = parseRecord(await file.text());

      // 시작 국면에서 수를 하나씩 다시 두며 기보를 되살린다.
      const rebuilt: HistoryEntry[] = [
        { fen: record.startFen, move: null, notation: "시작", mover: null, score: null },
      ];
      let pos = parseFen(record.startFen);
      for (const m of record.moves) {
        const { from, to } = splitMove(m.move);
        if (!from || !pos.board[from]) {
          throw new Error(`${m.notation || m.move} 을(를) 둘 수 없습니다. 기보가 국면과 맞지 않습니다.`);
        }
        const mover = pos.turn;
        pos = applyMove(pos, from, to);
        rebuilt.push({
          fen: toFen(pos),
          move: m.move,
          notation: m.notation || m.move,
          mover,
          score: m.score ?? null,
        });
      }

      setDraft(null);
      setHistory(rebuilt);
      setCursor(rebuilt.length - 1);
      setSelected(null);
      setNotice(`기보를 불러왔습니다. ${record.moves.length}수.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  // --- 화살표 -----------------------------------------------------------

  const hoverArrow = arrowOf(hover);
  const bestArrow =
    !hoverArrow && snapshot?.lines[0]?.pv[0]
      ? arrowOf(snapshot.lines[0].pv[0])
      : null;

  const lastMove = useMemo(() => {
    if (editMode || !entry.move) return null;
    const { from, to } = splitMove(entry.move);
    return from && to && from !== to ? { from, to } : null;
  }, [editMode, entry.move]);

  // 장군을 맞은 궁의 자리. 판에서 붉게 표시한다.
  const checkedKing = useMemo(() => {
    if (checkers.length === 0) return null;
    return (
      Object.entries(position.board).find(
        ([, p]) => p.toLowerCase() === "k" && sideOf(p) === position.turn
      )?.[0] ?? null
    );
  }, [checkers, position]);

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
        <span className="badge" title={evalMode ?? ""}>
          {evalMode?.includes("NNUE") ? "신경망 적용됨" : (evalMode ?? "")}
        </span>
        <span className="turn-tag">
          {editMode ? (
            <b className="editing">판 편집 중</b>
          ) : (
            <>
              둘 차례:{" "}
              <b className={position.turn}>
                {position.turn === "cho" ? "초 楚" : "한 漢"}
              </b>
            </>
          )}
        </span>
      </header>

      {notice && <div className="notice">{notice}</div>}

      <main className="layout">
        <section className="board-col">
          <StatusBanner
            status={gstatus}
            canUndo={cursor > 0 && !editMode}
            onUndo={() => goTo(cursor - 1)}
          />

          <Board
            board={position.board}
            flipped={flipped}
            editMode={editMode}
            selected={selected}
            targets={targets}
            lastMove={lastMove}
            bestMove={bestArrow}
            hoverMove={hoverArrow}
            checkedKing={checkedKing}
            onSquareClick={handleSquareClick}
            onMove={handleMove}
            onRemove={handleRemove}
          />

          {editMode ? (
            <PiecePalette brush={brush} onPick={setBrush} />
          ) : (
            <div className="board-actions">
              <button type="button" disabled={cursor === 0} onClick={() => goTo(0)}>
                ⇤
              </button>
              <button
                type="button"
                disabled={cursor === 0}
                onClick={() => goTo(cursor - 1)}
                title="← 키"
              >
                ← 무르기
              </button>
              <button
                type="button"
                disabled={cursor >= history.length - 1}
                onClick={() => goTo(cursor + 1)}
                title="→ 키"
              >
                다시 →
              </button>
              <button
                type="button"
                disabled={cursor >= history.length - 1}
                onClick={() => goTo(history.length - 1)}
              >
                ⇥
              </button>
              <button
                type="button"
                disabled={over}
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
              {engineSide !== "none" && (
                <button
                  type="button"
                  className="ghost stop"
                  onClick={() => setEngineSide("none")}
                  title="엔진이 두는 것을 멈춥니다"
                >
                  ■ 엔진 멈춤
                </button>
              )}
            </div>
          )}
        </section>

        <section className="side-col">
          <PositionTools
            position={position}
            editMode={editMode}
            onEditMode={(on) => (on ? enterEdit() : leaveEdit())}
            onFen={handleFen}
            onTurn={(turn) => startFrom({ ...position, turn }, "편집")}
            onSetup={(side: Side, setup: Setup) =>
              startFrom(
                { ...position, board: applySetup(position.board, side, setup) },
                "편집"
              )
            }
            onClear={() => startFrom({ ...position, board: {} }, "편집")}
            onReset={() => {
              setDraft(null);
              setHistory(initialHistory);
              setCursor(0);
              setSelected(null);
            }}
            onFlip={() => setFlipped((f) => !f)}
            onSave={saveRecord}
            onLoad={loadRecord}
            canSave={history.length > 1}
          />

          <AnalysisPanel
            snapshot={snapshot}
            board={position.board}
            enabled={analysisOn || engineTurn}
            editing={editMode}
            onHoverLine={setHover}
            onPlayLine={(move) => {
              if (editMode || over) return;
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

          {!editMode && (
            <>
              <EvalGraph history={history} cursor={cursor} onJump={goTo} />
              <MoveList history={history} cursor={cursor} onJump={goTo} />
            </>
          )}
        </section>
      </main>
    </div>
  );
}
