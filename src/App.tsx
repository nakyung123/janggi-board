import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Board } from "./components/board/Board";
import { PiecePalette } from "./components/board/PiecePalette";
import type { Brush } from "./components/board/PiecePalette";
import { ModeTabs } from "./components/ModeTabs";
import type { Mode } from "./components/ModeTabs";
import { AnalysisPanel, arrowOf } from "./components/panels/AnalysisPanel";
import { EngineControls } from "./components/panels/EngineControls";
import { EvalGraph } from "./components/panels/EvalGraph";
import { MoveList } from "./components/panels/MoveList";
import type { HistoryEntry } from "./components/panels/MoveList";
import { PlayPanel } from "./components/panels/PlayPanel";
import type { MySide } from "./components/panels/PlayPanel";
import { PlayerBar } from "./components/board/PlayerBar";
import { PositionTools } from "./components/panels/PositionTools";
import { ReviewPanel } from "./components/panels/ReviewPanel";
import { StatusBanner } from "./components/StatusBanner";

import { useAnalysis, useEngine } from "./engine/useEngine";
import type { EngineOptions, PositionRef, SearchLimits } from "./engine/types";
import { positionKey } from "./engine/types";
import {
  DEFAULT_LEVEL_ID,
  DEFAULT_REVIEW_DEPTH_ID,
  MIN_THINK_MS,
  ENGINE_MOVE_CAP_MS,
  levelById,
  limitsOf,
  reviewDepthById,
} from "./engine/levels";
import { useKeyboard } from "./hooks/useKeyboard";
import { playMoveSound, playPickSound } from "./audio/sound";

import type { Board as BoardMap, Position, Square } from "./janggi/board";
import { START_FEN, parseFen, toFen } from "./janggi/board";
import { describeMove, splitMove } from "./janggi/notation";
import type { PieceType, Side } from "./janggi/pieces";
import { SIDE_LABEL, sideOf } from "./janggi/pieces";
import { applySetup } from "./janggi/setups";
import type { Setup } from "./janggi/setups";
import { gameStatus, isGameOver, capturedPieces, scoreBoard } from "./janggi/status";
import {
  DEFAULT_CLOCK_ID,
  clockPresetById,
  resolveClock,
  clampCustomClock,
  DEFAULT_CUSTOM_CLOCK,
  commitMove,
  flaggedSide,
  initialClocks,
  moveBudgetMs,
  tickClock,
} from "./janggi/clock";
import type { ClockState } from "./janggi/clock";
import { buildRecord, downloadRecord, parseRecord } from "./janggi/record";
import type { RecordPlayer, RecordResult } from "./janggi/record";
import { bestArrowOf, runReview } from "./janggi/review";
import type { ReviewProgress, ReviewedMove } from "./janggi/review";
import { 이가 } from "./janggi/korean";

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

  const [mode, setMode] = useState<Mode>("play");
  const [history, setHistory] = useState<HistoryEntry[]>(initialHistory);
  const [cursor, setCursor] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [selected, setSelected] = useState<Square | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // --- 대국 ------------------------------------------------------------
  const [mySide, setMySide] = useState<MySide>("cho");
  const [levelId, setLevelId] = useState(DEFAULT_LEVEL_ID);
  const [resigned, setResigned] = useState<Side | null>(null);
  /** 시간패한 쪽 */
  const [flagged, setFlagged] = useState<Side | null>(null);
  const [clockId, setClockId] = useState(DEFAULT_CLOCK_ID);
  /** 직접 입력을 골랐을 때 쓰는 값. 프리셋으로 돌아가도 그대로 남는다. */
  const [customClock, setCustomClock] = useState(DEFAULT_CUSTOM_CLOCK);
  const clockSettings = resolveClock(clockId, customClock);
  const [clocks, setClocks] = useState<ClockState>(() =>
    initialClocks(clockPresetById(DEFAULT_CLOCK_ID))
  );
  /** 두는 동안 훈수를 볼지. 기본은 꺼둔다 — 켜두면 대국이 아니라 받아쓰기가 된다. */
  const [hintOn, setHintOn] = useState(false);
  const level = levelById(levelId);

  // --- 편집 (분석 모드) -------------------------------------------------
  // 편집 모드는 기보와 따로 논다. 편집하는 동안 판은 draft 에만 반영하고,
  // 편집을 끝낼 때 비로소 기보를 정한다. 이렇게 해야 "편집 한 번 눌렀다가
  // 두던 판이 날아가는" 일이 없다.
  const [draft, setDraft] = useState<Position | null>(null);
  const editMode = draft !== null;
  const [brush, setBrush] = useState<Brush>(null);

  // --- 분석 설정 --------------------------------------------------------
  const [analysisOn, setAnalysisOn] = useState(true);
  const [prefs, setPrefs] = useState<Omit<EngineOptions, "skill">>({
    threads: Math.max(1, Math.min(navigator.hardwareConcurrency || 2, 4)),
    hashMb: 128,
    multiPV: 3,
    variant: "janggi",
  });
  // 기본값은 3초. 무제한은 코어를 계속 붙잡고 있어서 기본으로 두기엔 부담스럽다.
  const [limits, setLimits] = useState<SearchLimits>({ movetimeMs: 3000 });

  // --- 복기 -------------------------------------------------------------
  const [reviewDepthId, setReviewDepthId] = useState(DEFAULT_REVIEW_DEPTH_ID);
  const [reviewed, setReviewed] = useState<ReviewedMove[] | null>(null);
  const [reviewRunning, setReviewRunning] = useState(false);
  const [reviewProgress, setReviewProgress] = useState<ReviewProgress | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const cancelReview = useRef(false);

  const entry = history[cursor];
  const played = useMemo(() => parseFen(entry.fen), [entry.fen]);
  const position = draft ?? played;
  const started = history.length > 1;

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

  const engineSide: "none" | Side | "both" =
    mode !== "play" ? "none" : mySide === "watch" ? "both" : mySide === "cho" ? "han" : "cho";

  /**
   * 엔진이 지금 둬야 하는지.
   * 기보 끝이 아닐 때는 두지 않는다. 무르고 되짚어 보는 중에 엔진이 끼어들어
   * 기보를 잘라먹으면 곤란하다.
   */
  const atTip = cursor === history.length - 1;
  const engineTurn =
    mode === "play" &&
    atTip &&
    !editMode &&
    (engineSide === "both" || engineSide === position.turn);

  /**
   * 엔진의 실력과 탐색량.
   * 엔진이 둘 차례면 급수대로 약하게, 사람이 둘 차례(=훈수)면 전력으로 본다.
   * 훈수까지 약한 엔진이 내놓으면 도움이 안 된다.
   */
  /**
   * 엔진이 이번 수에 쓸 수 있는 시간.
   *
   * 시계는 100ms 마다 줄어드는데, 그 값을 탐색 한계에 그대로 물리면 한계가
   * 계속 바뀌어 탐색이 처음부터 다시 시작된다. 그래서 차례가 바뀔 때 한 번만
   * 정하고, 그 수를 두는 동안은 붙잡아 둔다.
   */
  const clocksRef = useRef(clocks);
  useEffect(() => {
    clocksRef.current = clocks;
  }, [clocks]);

  const [moveBudget, setMoveBudget] = useState(0);
  useEffect(() => {
    if (!clockSettings.enabled || !engineTurn) {
      setMoveBudget(0);
      return;
    }
    setMoveBudget(Math.round(moveBudgetMs(clocksRef.current[position.turn], clockSettings)));
  }, [engineTurn, position.turn, entry.fen, clockSettings]);

  const searchLimits: SearchLimits = useMemo(() => {
    if (mode !== "play") return limits;
    if (!engineTurn) return { movetimeMs: 2000 };
    const byNodes = limitsOf(level);
    // 시계를 쓰면 남은 시간도 함께 건다. 엔진은 둘 중 먼저 닿는 쪽에서 멈추므로,
    // 시간이 넉넉하면 급수대로 노드를 다 쓰고 쫓기면 일찍 끊는다.
    //
    // 시계를 껐을 때도 상한은 있어야 한다. '시간 제한 없음'은 사람이 무제한이라는
    // 뜻이지 엔진까지 무제한이라는 뜻이 아니다. 높은 급수는 노드가 수백만이라
    // 상한이 없으면 한 수에 분 단위로 기다리게 된다.
    const cap = moveBudget > 0 ? moveBudget : ENGINE_MOVE_CAP_MS;
    return { ...byNodes, movetimeMs: cap };
  }, [mode, engineTurn, level, limits, moveBudget]);

  const options: EngineOptions = useMemo(
    () => ({
      ...prefs,
      // 대국 중 훈수는 후보수 하나면 충분하다. 넓게 보면 느려질 뿐이다.
      multiPV: mode === "play" ? 1 : prefs.multiPV,
      skill: mode === "play" && engineTurn ? level.skill : 20,
    }),
    [prefs, mode, engineTurn, level.skill]
  );

  const optionsKey = useMemo(
    () =>
      [
        options.threads,
        options.hashMb,
        options.multiPV,
        options.skill,
        options.variant,
        searchLimits.depth,
        searchLimits.movetimeMs,
        searchLimits.nodes,
        searchLimits.infinite,
        engineTurn,
      ].join("|"),
    [options, searchLimits, engineTurn]
  );

  useEffect(() => {
    if (engine && !reviewRunning) void engine.setOptions(options);
  }, [engine, options, reviewRunning]);

  /** 복기 중에는 실시간 분석을 세워둔다. 같은 엔진을 둘이 나눠 쓸 수는 없다. */
  const analysisEnabled =
    !reviewRunning &&
    (mode === "play" ? hintOn || engineTurn : mode === "analyze" ? analysisOn : false);

  const { snapshot, legal, checkers, probed } = useAnalysis(
    engine,
    positionRef,
    analysisEnabled,
    searchLimits,
    optionsKey
  );

  // --- 대국 상태 --------------------------------------------------------

  // 전통 규칙에는 점수제가 없어서 수 제한으로 갈리지 않는다.
  const pointsRule = prefs.variant !== "janggitraditional";
  const gstatus = useMemo(
    () =>
      gameStatus({
        position,
        legal,
        checkers,
        ready: probed,
        // 지금 보고 있는 국면까지 둔 총 수. history[0] 이 시작 국면이다.
        plies: cursor,
        pointsRule,
      }),
    [position, legal, checkers, probed, cursor, pointsRule]
  );
  const over = isGameOver(gstatus) || resigned !== null || flagged !== null;

  // --- 수 두기 ----------------------------------------------------------

  /** 지금 둘 차례. 시계에서 "누구 시간을 깎을지" 를 정하는 값이기도 하다. */
  const mover = position.turn;

  const pushMove = useCallback(
    (from: Square, to: Square) => {
      // 소리는 판을 고치기 전에 낸다. 여기를 사람도 엔진도 다 지나가므로
      // 한 군데만 손보면 된다. 한수쉼(제자리 수)은 잡는 게 아니다.
      playMoveSound(from !== to && position.board[to] ? "capture" : "move");
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
      // 초읽기는 "회 안에만 두면 회수가 줄지 않는" 규칙이라, 둘 때마다 되채운다.
      const s = resolveClock(clockId, customClock);
      if (s.enabled) setClocks((prev) => commitMove(prev, mover, s));
      // 수가 하나라도 바뀌면 앞서 돌린 복기는 더 이상 이 기보의 것이 아니다.
      setReviewed(null);
    },
    [cursor, mover, clockId, customClock, position.board]
  );

  /** 분석이 끝나면 그 국면의 평가치를 기보에 적어둔다. 형세 그래프의 재료가 된다. */
  useEffect(() => {
    if (editMode || reviewRunning || !snapshot?.lines.length) return;
    // 급수를 낮춘 엔진의 점수는 형세 그래프에 쓰지 않는다. 약하게 본 값이라
    // 그래프가 실제 형세와 어긋난다.
    if (mode === "play" && engineTurn) return;
    const line = snapshot.lines[0];
    const score = line.mate !== null ? (line.mate > 0 ? 20 : -20) : line.score;
    setHistory((prev) => {
      if (!prev[cursor] || prev[cursor].score === score) return prev;
      const next = [...prev];
      next[cursor] = { ...next[cursor], score };
      return next;
    });
  }, [snapshot, cursor, editMode, reviewRunning, mode, engineTurn]);

  // --- 시계 ------------------------------------------------------------

  const resetClocks = useCallback(() => {
    setClocks(initialClocks(resolveClock(clockId, customClock)));
    setFlagged(null);
  }, [clockId, customClock]);

  // 설정을 바꾸면 양쪽 시계를 새로 채운다.
  useEffect(() => {
    setClocks(initialClocks(resolveClock(clockId, customClock)));
    setFlagged(null);
  }, [clockId, customClock]);

  /**
   * 시계는 첫 수가 놓여야 돈다.
   * 급수를 고르고 상차림을 맞추는 동안 시간이 깎이면 곤란하기 때문이다.
   * 기보를 되짚는 중(기보 끝이 아님)이나 대국이 끝난 뒤에는 멈춘다.
   */
  const clockRunning =
    clockSettings.enabled && mode === "play" && started && atTip && !over && !editMode;

  useEffect(() => {
    if (!clockRunning) return;
    const s = resolveClock(clockId, customClock);
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      setClocks((prev) => tickClock(prev, mover, dt, s));
    }, 200);
    return () => window.clearInterval(id);
    // mover 가 바뀌면 타이머를 다시 건다. 그 순간 last 도 새로 잡혀 시간이 새지 않는다.
  }, [clockRunning, clockId, mover]);

  useEffect(() => {
    const out = flaggedSide(clocks);
    if (out && !flagged) {
      setFlagged(out);
      setNotice(`${SIDE_LABEL[out]} 시간패입니다.`);
    }
  }, [clocks, flagged]);

  // 엔진 차례가 되면 탐색이 끝나는 대로 그 수를 둔다.
  const playedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!engineTurn || over) return;
    if (!snapshot || snapshot.running || !snapshot.bestmove) return;
    const key = positionKey(positionRef);
    if (playedFor.current === key) return;
    const { from, to } = splitMove(snapshot.bestmove);
    if (!from || !to) return;

    // 약한 급수는 2천 노드만 보고 끝나서 눈 깜짝할 새에 둔다. 최소한의 뜸은 들인다.
    const timer = window.setTimeout(() => {
      playedFor.current = key;
      pushMove(from, to);
    }, MIN_THINK_MS);
    return () => window.clearTimeout(timer);
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
        toggleAnalysis: () =>
          mode === "play" ? setHintOn((h) => !h) : setAnalysisOn((a) => !a),
      }),
      [cursor, goTo, history.length, mode]
    ),
    !editMode && !reviewRunning
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
      setReviewed(null);
      setResigned(null);
      resetClocks();
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

  /** 복기 중에는 판을 읽기만 한다. 대국 중에는 내 차례의 기물만 집을 수 있다. */
  const canTouchBoard =
    !over &&
    mode !== "review" &&
    !(mode === "play" && (engineTurn || mySide === "watch"));

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

    if (!canTouchBoard) return;

    if (selected && targets.includes(square)) {
      pushMove(selected, square);
      return;
    }
    // 자기 차례의 기물만 집을 수 있다.
    const piece = position.board[square];
    if (piece && sideOf(piece) === position.turn && legalFrom.has(square)) {
      const picking = selected !== square;
      setSelected(picking ? square : null);
      // 집을 때도 소리를 낸다. 알을 판에서 살짝 드는 소리라 착수음보다 얕다.
      if (picking) playPickSound();
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
    if (!canTouchBoard) return;
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

  const passMove = () => {
    const king = Object.entries(position.board).find(
      ([, p]) => p.toLowerCase() === "k" && sideOf(p) === position.turn
    );
    if (king && legal.has(king[0] + king[0])) pushMove(king[0], king[0]);
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
    setReviewed(null);
    setResigned(null);
    resetClocks();
  };

  const handleFen = (value: string) => {
    startFrom(parseFen(value), "불러옴"); // 형식이 틀리면 parseFen 이 예외를 던진다
  };

  /** 새 대국. 지금 시작 국면(상차림 포함)은 그대로 두고 수만 지운다. */
  const newGame = () => {
    const base = parseFen(history[0].fen);
    setHistory([
      {
        fen: toFen({ ...base, turn: "cho", halfmove: 0, fullmove: 1 }),
        move: null,
        notation: "시작",
        mover: null,
        score: null,
      },
    ]);
    setCursor(0);
    setSelected(null);
    setReviewed(null);
    setResigned(null);
    resetClocks();
    playedFor.current = null;
    setNotice(`새 대국을 시작합니다. 상대는 ${level.name} 입니다.`);
  };

  const resign = () => {
    if (mySide === "watch") return;
    setResigned(mySide);
    setNotice("기권했습니다. 복기 탭에서 어디가 갈림길이었는지 볼 수 있습니다.");
  };

  // --- 기보 저장·불러오기 -----------------------------------------------

  const recordPlayers = (): Record<"cho" | "han", RecordPlayer> => {
    const make = (side: Side): RecordPlayer =>
      mySide === side
        ? { kind: "human", label: "나" }
        : { kind: "engine", level: levelId, label: level.name };
    return { cho: make("cho"), han: make("han") };
  };

  const recordResult = (): RecordResult => {
    if (gstatus.kind === "checkmate") return gstatus.winner;
    if (gstatus.kind === "stalemate") return gstatus.winner;
    if (resigned) return resigned === "cho" ? "han" : "cho";
    return "unfinished";
  };

  const saveRecord = () => {
    downloadRecord(
      buildRecord({
        startFen: history[0].fen,
        moves: history.slice(1).map((h) => ({
          move: h.move ?? "",
          notation: h.notation,
          score: h.score ?? undefined,
        })),
        variant: prefs.variant,
        players: recordPlayers(),
        result: recordResult(),
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
          throw new Error(
            `${m.notation || m.move} 을(를) 둘 수 없습니다. 기보가 국면과 맞지 않습니다.`
          );
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
      setReviewed(null);
      setResigned(null);
      resetClocks();
      setNotice(`기보를 불러왔습니다. ${record.moves.length}수.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  };

  // --- 복기 -------------------------------------------------------------

  const startReview = async () => {
    if (!engine || history.length < 2) return;
    const moves = history
      .slice(1)
      .map((h) => h.move)
      .filter((m): m is string => Boolean(m));
    if (moves.length === 0) return;

    cancelReview.current = false;
    setReviewError(null);
    setReviewed(null);
    setReviewProgress(null);
    setReviewRunning(true);

    try {
      // 실시간 분석을 먼저 세운다. 엔진은 하나뿐이라 둘이 나눠 쓸 수 없다.
      await engine.stop();
      await engine.setOptions({ ...prefs, multiPV: 1, skill: 20 });

      const result = await runReview({
        engine,
        startFen: history[0].fen,
        moves,
        nodes: reviewDepthById(reviewDepthId).nodes,
        onProgress: setReviewProgress,
        shouldStop: () => cancelReview.current,
      });

      setReviewed(result);

      // 복기로 얻은 점수를 기보에 옮겨 적는다. 실시간 분석 때 찍힌 값보다
      // 깊이가 고르기 때문에 형세 그래프가 훨씬 정확해진다.
      if (result.length > 0) {
        setHistory((prev) => {
          const next = [...prev];
          if (next[0]) next[0] = { ...next[0], score: result[0].scoreBefore };
          for (const r of result) {
            if (next[r.index]) next[r.index] = { ...next[r.index], score: r.scoreAfter };
          }
          return next;
        });
      }
      if (!cancelReview.current) setNotice("복기가 끝났습니다.");
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setReviewRunning(false);
      setReviewProgress(null);
    }
  };

  const stopReview = () => {
    cancelReview.current = true;
    void engine?.stop();
  };

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  // --- 화살표 -----------------------------------------------------------

  const currentReview = useMemo(
    () => reviewed?.find((r) => r.index === cursor) ?? null,
    [reviewed, cursor]
  );

  const hoverArrow = arrowOf(hover);
  const bestArrow = useMemo(() => {
    // 복기 중에는 "이랬어야 했다" 를 그린다.
    if (mode === "review") return bestArrowOf(currentReview);
    if (hoverArrow) return null;
    // 대국 중에는 훈수를 켰을 때만 최선수를 보여준다.
    if (mode === "play" && !hintOn) return null;
    const first = snapshot?.lines[0]?.pv[0];
    return first ? arrowOf(first) : null;
  }, [mode, currentReview, hoverArrow, hintOn, snapshot]);

  const lastMove = useMemo(() => {
    if (editMode || !entry.move) return null;
    const { from, to } = splitMove(entry.move);
    return from && to && from !== to ? { from, to } : null;
  }, [editMode, entry.move]);

  // --- 판 너비 재기 ------------------------------------------------------
  //
  // 판은 남은 높이에 맞춰 크기가 정해지므로 너비를 CSS 만으로는 알 수 없다.
  // 다 그려진 뒤에 재서 --board-w 로 넘기면, 대국자 카드와 버튼 줄이 판과
  // 정확히 같은 너비로 선다. (layout.css 의 .table 주석 참고)
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const table = tableRef.current;
    const svg = table?.querySelector("svg.board");
    if (!table || !svg) return;
    const ro = new ResizeObserver(() => {
      table.style.setProperty(
        "--board-w",
        `${Math.round(svg.getBoundingClientRect().width)}px`
      );
    });
    ro.observe(svg);
    return () => ro.disconnect();
    // 엔진을 내려받는 동안에는 로딩 화면이라 판이 아직 없다. 준비가 끝나고
    // 판이 붙은 뒤에 다시 걸어야 한다.
  }, [status]);

  // --- 대국자 카드 ------------------------------------------------------

  // 판은 초를 아래에 놓고 그린다. 뒤집으면 위아래가 바뀐다.
  const bottomSide: Side = flipped ? "han" : "cho";
  const topSide: Side = flipped ? "cho" : "han";

  const scores = useMemo(() => scoreBoard(position), [position]);

  const playerOf = useCallback(
    (side: Side) => ({
      side,
      name: mySide === side ? "나" : level.name,
      kind: (mySide === side ? "human" : "engine") as "human" | "engine",
      score: side === "cho" ? scores.cho : scores.han,
      // 이 진영이 '잡아낸' 기물 = 상대가 잃은 기물
      captured: capturedPieces(
        position,
        side === "cho" ? "han" : "cho"
      ) as PieceType[],
      active: !over && position.turn === side,
      thinking: engineTurn && position.turn === side,
      clock: clockSettings.enabled ? clocks[side] : null,
    }),
    [mySide, level.name, scores, position, over, engineTurn, clockSettings.enabled, clocks]
  );

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

  const thinking = engineTurn && Boolean(snapshot?.running);

  return (
    <div className="app">
      <header className="top">
        <h1>장기 분석판</h1>
        <span className="badge" title={evalMode ?? ""}>
          {evalMode?.includes("NNUE") ? "신경망 적용됨" : (evalMode ?? "")}
        </span>
        <ModeTabs
          mode={mode}
          onMode={(next) => {
            if (reviewRunning) return;
            if (next !== "analyze" && editMode) leaveEdit();
            setMode(next);
            setSelected(null);
          }}
          canReview={history.length > 1}
        />

        <span className="turn-tag">
          {editMode ? (
            <b className="editing">판 편집 중</b>
          ) : mode === "review" ? (
            <b className="reviewing">복기 중</b>
          ) : (
            <>
              둘 차례:{" "}
              <b className={position.turn}>
                {position.turn === "cho" ? "초 楚" : "한 漢"}
              </b>
              {mode === "play" && thinking && (
                <span className="muted"> · 엔진이 생각 중…</span>
              )}
            </>
          )}
        </span>
      </header>

      {notice && <div className="notice">{notice}</div>}

      <main className="layout">
        <section className="board-col">
          <div className="table" ref={tableRef}>
            <StatusBanner
              status={gstatus}
              canUndo={cursor > 0 && !editMode}
              onUndo={() => goTo(cursor - 1)}
            />

            {resigned && (
              <div className="banner resign">
                기권 — {이가(SIDE_LABEL[resigned === "cho" ? "han" : "cho"])} 이겼습니다.
              </div>
            )}
            {flagged && (
              <div className="banner resign">
                시간패 — {이가(SIDE_LABEL[flagged === "cho" ? "han" : "cho"])} 이겼습니다.
              </div>
            )}

            {/* 대국자 카드는 대국 모드에만. 편집 중에는 팔레트에 자리를 내준다. */}
            {mode === "play" && !editMode && <PlayerBar {...playerOf(topSide)} />}

            <div className="board-stage">
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
            </div>

            {mode === "play" && !editMode && <PlayerBar {...playerOf(bottomSide)} />}

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
                ← {mode === "play" ? "무르기" : "이전"}
              </button>
              <button
                type="button"
                disabled={cursor >= history.length - 1}
                onClick={() => goTo(cursor + 1)}
                title="→ 키"
              >
                {mode === "play" ? "다시" : "다음"} →
              </button>
              <button
                type="button"
                disabled={cursor >= history.length - 1}
                onClick={() => goTo(history.length - 1)}
              >
                ⇥
              </button>
              <button type="button" className="ghost" onClick={() => setFlipped((f) => !f)} title="F 키">
                판 뒤집기
              </button>
              {mode !== "review" && (
                <button
                  type="button"
                  disabled={!canTouchBoard}
                  title="궁을 제자리에 두는 것이 장기의 한수쉼입니다"
                  onClick={passMove}
                >
                  한수쉼
                </button>
              )}
              </div>
            )}
          </div>
        </section>

        <section className="side-col">
          {mode === "play" && (
            <>
              <PlayPanel
                mySide={mySide}
                levelId={levelId}
                started={started}
                status={gstatus}
                resigned={resigned}
                flagged={flagged}
                clockId={clockId}
                onClock={setClockId}
                customClock={customClock}
                onCustomClock={(patch) =>
                  setCustomClock((c) => clampCustomClock({ ...c, ...patch }))
                }
                variant={prefs.variant}
                onVariant={(v) => setPrefs((o) => ({ ...o, variant: v }))}
                thinking={thinking}
                analysisOn={hintOn}
                onMySide={(s) => {
                  setMySide(s);
                  playedFor.current = null;
                }}
                onLevel={setLevelId}
                onSetup={(side: Side, setup: Setup) =>
                  startFrom(
                    { ...position, board: applySetup(position.board, side, setup) },
                    "시작"
                  )
                }
                onNewGame={newGame}
                onResign={resign}
                onAnalysisOn={setHintOn}
              />

              {hintOn && (
                <AnalysisPanel
                  snapshot={snapshot}
                  board={position.board}
                  enabled={analysisEnabled}
                  onHoverLine={setHover}
                  onPlayLine={(move) => {
                    if (!canTouchBoard) return;
                    const { from, to } = splitMove(move);
                    if (from && to) pushMove(from, to);
                  }}
                />
              )}
            </>
          )}

          {mode === "analyze" && (
            <>
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
                  setReviewed(null);
                  setResigned(null);
                  resetClocks();
                }}
                onFlip={() => setFlipped((f) => !f)}
              />

              <AnalysisPanel
                snapshot={snapshot}
                board={position.board}
                enabled={analysisEnabled}
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
                onOptions={(patch) => setPrefs((o) => ({ ...o, ...patch }))}
                onLimits={(patch) => setLimits((l) => ({ ...l, ...patch }))}
                onAnalysisOn={setAnalysisOn}
              />
            </>
          )}

          {mode === "review" && (
            <ReviewPanel
              moveCount={history.length - 1}
              depthId={reviewDepthId}
              onDepth={setReviewDepthId}
              running={reviewRunning}
              progress={reviewProgress}
              reviewed={reviewed}
              cursor={cursor}
              error={reviewError}
              onStart={() => void startReview()}
              onStop={stopReview}
              onJump={goTo}
            />
          )}

          {!editMode && (
            <>
              {/* 대국 중 형세 그래프는 엔진 평가를 그대로 흘리는 것이라
                  훈수를 켰을 때만 띄운다. */}
              {(mode !== "play" || hintOn) && (
                <EvalGraph history={history} cursor={cursor} onJump={goTo} />
              )}
              <MoveList
                history={history}
                cursor={cursor}
                reviewed={reviewed}
                canSave={history.length > 1}
                onJump={goTo}
                onSave={saveRecord}
                onLoad={loadRecord}
              />
            </>
          )}
        </section>
      </main>
    </div>
  );
}
