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
import { BoardControls } from "./components/panels/BoardControls";
import { GameOverDialog } from "./components/GameOverDialog";
import { PlayPanel } from "./components/panels/PlayPanel";
import { PlayerBar } from "./components/board/PlayerBar";
import { PositionTools } from "./components/panels/PositionTools";
import { ReviewPanel } from "./components/panels/ReviewPanel";

import { readStored, usePersisted, writeStored } from "./hooks/usePersisted";
import { useAnalysis, useEngine } from "./engine/useEngine";
import type { EngineOptions, PositionRef, SearchLimits } from "./engine/types";
import { forgetIfMoved, positionKey } from "./engine/types";
import {
  DEFAULT_LEVEL_ID,
  DEFAULT_REVIEW_DEPTH_ID,
  LEVELS,
  MIN_THINK_MS,
  gradeToleranceOf,
  ENGINE_MOVE_CAP_MS,
  REVIEW_DEPTHS,
  levelById,
  limitsOf,
  reviewDepthById,
} from "./engine/levels";
import { useKeyboard } from "./hooks/useKeyboard";
import { playMoveSound, playPickSound } from "./audio/sound";

import type { Board as BoardMap, Position, Square } from "./janggi/board";
import { START_FEN, parseFen, toFen, undoTarget } from "./janggi/board";
import { describeMove, splitMove } from "./janggi/notation";
import type { PieceType, Side } from "./janggi/pieces";
import { sideOf } from "./janggi/pieces";
import { applySetup, detectSetup } from "./janggi/setups";
import type { Setup } from "./janggi/setups";
import {
  gameStatus,
  isGameOver,
  outcomeOf,
  outcomeMessage,
  capturedPieces,
  scoreBoard,
  sideTag,
  statusMessage,
} from "./janggi/status";
import {
  CLOCK_PRESETS,
  CUSTOM_CLOCK_ID,
  DEFAULT_CLOCK_ID,
  resolveClock,
  withFlagged,
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

/**
 * 저장해 둔 값이 지금도 쓸 수 있는 모양인지.
 *
 * localStorage 는 사람이 직접 고칠 수 있고 예전 판에서 남긴 값도 들어 있다.
 * 여기서 걸러내면 이상한 값이 들어가도 다음 실행에 저절로 낫는다.
 */
function isClockSettings(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.enabled === "boolean" &&
    typeof c.mainSeconds === "number" &&
    typeof c.byoyomiSeconds === "number" &&
    typeof c.byoyomiCount === "number"
  );
}

function isEnginePrefs(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  const variants = ["janggi", "janggimodern", "janggitraditional"];
  return (
    typeof p.threads === "number" && p.threads >= 1 && p.threads <= 16 &&
    typeof p.hashMb === "number" && p.hashMb >= 16 &&
    typeof p.multiPV === "number" && p.multiPV >= 1 && p.multiPV <= 8 &&
    typeof p.variant === "string" && variants.includes(p.variant)
  );
}

/** 저장해 둔 기보가 지금도 읽을 수 있는 모양인지. */
function isHistory(v: unknown): boolean {
  if (!Array.isArray(v) || v.length === 0 || v.length > 1000) return false;
  return v.every((e) => {
    if (typeof e !== "object" || e === null) return false;
    const h = e as Record<string, unknown>;
    if (typeof h.fen !== "string" || h.fen.length > 200) return false;
    if (typeof h.notation !== "string") return false;
    if (h.move !== null && typeof h.move !== "string") return false;
    if (h.mover !== null && h.mover !== "cho" && h.mover !== "han") return false;
    if (h.score !== null && typeof h.score !== "number") return false;
    // FEN 이 실제로 읽히는지까지 본다. 모양만 맞고 내용이 깨진 것을 거른다.
    try {
      return Object.keys(parseFen(h.fen).board).length > 0;
    } catch {
      return false;
    }
  });
}

function isSide(v: unknown): boolean {
  return v === null || v === "cho" || v === "han";
}

/**
 * 두던 판을 저장해 둔 모양.
 *
 * 시계는 넣지 않는다. 새로고침한 동안 시간이 흘렀는지 알 길이 없어서 되살린
 * 값이 맞다고 할 수 없고, 시계는 100ms 마다 바뀌어서 저장이 폭주한다.
 * 이어서 열면 시계는 새로 찬다.
 */
interface SavedGame {
  history: HistoryEntry[];
  cursor: number;
  resigned: Side | null;
  flagged: Side | null;
}

function isSavedGame(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const g = v as Record<string, unknown>;
  return (
    isHistory(g.history) &&
    typeof g.cursor === "number" &&
    g.cursor >= 0 &&
    g.cursor < (g.history as unknown[]).length &&
    isSide(g.resigned) &&
    isSide(g.flagged)
  );
}

export default function App() {
  const { engine, status, progress, error } = useEngine();

  const [mode, setMode] = useState<Mode>("play");

  /*
   * 두던 판을 되살린다.
   *
   * 새로고침하거나 폰에서 앱을 잠깐 나갔다 오면 기보가 통째로 사라졌다.
   * 한 판 두던 중이면 그게 제일 아깝다.
   *
   * 다만 '실제로 두던 판' 일 때만 되살린다(한 수라도 둔 것). 분석에서 국면만
   * 만지다 나갔는데 다음에 열었을 때 그 이상한 판이 대국판으로 떠 있으면
   * 영문을 모른다.
   */
  const savedGame = useMemo(
    () => readStored<SavedGame | null>("game", null, isSavedGame),
    []
  );
  const [history, setHistory] = useState<HistoryEntry[]>(
    savedGame && savedGame.history.length > 1 ? savedGame.history : initialHistory
  );
  const [cursor, setCursor] = useState(
    savedGame && savedGame.history.length > 1 ? savedGame.cursor : 0
  );
  const [flipped, setFlipped] = usePersisted("flipped", false, (v) => typeof v === "boolean");
  const [selected, setSelected] = useState<Square | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // --- 대국 ------------------------------------------------------------
  // 예전에는 "watch"(구경) 도 값이었다. 그때 골라둔 사람이 있을 수 있는데,
  // 여기서 받아주지 않으면 usePersisted 가 알아서 기본값(초)으로 되돌린다.
  const [mySide, setMySide] = usePersisted<Side>("mySide", "cho", (v) =>
    v === "cho" || v === "han"
  );
  // 저장해 둔 급수가 지금 사다리에 없을 수 있다 (단계를 바꾼 적이 있다).
  const [levelId, setLevelId] = usePersisted(
    "levelId",
    DEFAULT_LEVEL_ID,
    (v) => typeof v === "string" && LEVELS.some((l) => l.id === v)
  );
  const [resigned, setResigned] = useState<Side | null>(
    savedGame && savedGame.history.length > 1 ? savedGame.resigned : null
  );
  /**
   * 시간패한 쪽.
   *
   * 기권과 마찬가지로 되살린다. 되살리지 않았을 때는 시간패로 진 판을
   * 새로고침하면 패배가 사라지고 그대로 이어서 둘 수 있었다.
   */
  const [flagged, setFlagged] = useState<Side | null>(
    savedGame && savedGame.history.length > 1 ? savedGame.flagged : null
  );
  const [clockId, setClockId] = usePersisted(
    "clockId",
    DEFAULT_CLOCK_ID,
    (v) =>
      typeof v === "string" &&
      (v === CUSTOM_CLOCK_ID || CLOCK_PRESETS.some((c) => c.id === v))
  );
  /** 직접 입력을 골랐을 때 쓰는 값. 프리셋으로 돌아가도 그대로 남는다. */
  const [customClock, setCustomClock] = usePersisted(
    "customClock",
    DEFAULT_CUSTOM_CLOCK,
    isClockSettings
  );
  /*
   * 반드시 메모해야 한다.
   *
   * 직접 입력일 때 resolveClock 은 clampCustomClock 으로 매번 새 객체를 만든다.
   * 그 값이 아래 '엔진이 쓸 시간' effect 의 의존성에 들어 있어서, 메모하지
   * 않으면 렌더마다 effect 가 돈다. 시계는 200ms 마다 깎이므로 예산이 계속
   * 바뀌고 → searchLimits → optionsKey → 탐색이 멈췄다 다시 시작한다.
   * 그래서 직접 입력 시계를 고르면 엔진이 한 수도 두지 못했다.
   */
  const clockSettings = useMemo(
    () => resolveClock(clockId, customClock),
    [clockId, customClock]
  );
  // 되살린 판이 시간패로 끝난 것이면 그 쪽 시계를 다 쓴 모습으로 채운다.
  // 시계만 가득 찬 채 "시간패" 배너가 뜨면 앞뒤가 맞지 않는다.
  const [clocks, setClocks] = useState<ClockState>(() =>
    withFlagged(initialClocks(clockSettings), flagged)
  );
  /** 두는 동안 훈수를 볼지. 기본은 꺼둔다 — 켜두면 대국이 아니라 받아쓰기가 된다. */
  const [hintOn, setHintOn] = usePersisted("hintOn", false, (v) => typeof v === "boolean");
  const level = levelById(levelId);

  // --- 편집 (분석 모드) -------------------------------------------------
  // 편집 모드는 기보와 따로 논다. 편집하는 동안 판은 draft 에만 반영하고,
  // 편집을 끝낼 때 비로소 기보를 정한다. 이렇게 해야 "편집 한 번 눌렀다가
  // 두던 판이 날아가는" 일이 없다.
  const [draft, setDraft] = useState<Position | null>(null);
  const editMode = draft !== null;
  const [brush, setBrush] = useState<Brush>(null);

  // --- 분석 설정 --------------------------------------------------------
  const [analysisOn, setAnalysisOn] = usePersisted(
    "analysisOn", true, (v) => typeof v === "boolean"
  );
  const [prefs, setPrefs] = usePersisted<Omit<EngineOptions, "skill">>(
    "enginePrefs",
    {
      threads: Math.max(1, Math.min(navigator.hardwareConcurrency || 2, 4)),
      hashMb: 128,
      multiPV: 3,
      variant: "janggi",
    },
    isEnginePrefs
  );
  // 기본값은 3초. 무제한은 코어를 계속 붙잡고 있어서 기본으로 두기엔 부담스럽다.
  const [limits, setLimits] = useState<SearchLimits>({ movetimeMs: 3000 });

  // --- 복기 -------------------------------------------------------------
  const [reviewDepthId, setReviewDepthId] = usePersisted(
    "reviewDepthId",
    DEFAULT_REVIEW_DEPTH_ID,
    (v) => typeof v === "string" && REVIEW_DEPTHS.some((d) => d.id === v)
  );
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

  const engineSide: "none" | Side =
    mode !== "play" ? "none" : mySide === "cho" ? "han" : "cho";

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
    engineSide === position.turn;

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
  /** 끝났다면 어떻게 끝났는지. 다섯 갈래를 outcomeOf 한곳에서 받는다. */
  const outcome = useMemo(
    () => outcomeOf(gstatus, resigned, flagged),
    [gstatus, resigned, flagged]
  );
  /**
   * 대국이 끝난 것으로 '보여줄지'.
   *
   * 분석은 국면을 보는 곳이라 대국 결과가 해당되지 않는다. 거기서는 끝난 판도
   * 둘 수 있으므로(canTouchBoard 주석 참고), 둘 수 있는 판 위에 "기권 — 한이
   * 이겼습니다" 가 떠 있으면 앞뒤가 맞지 않는다.
   */
  const showOver = over && mode !== "analyze";

  /**
   * 대국자 카드와 화면 읽기 프로그램에 알릴 결과.
   *
   * 분석에서는 기권·시간패를 뺀다. 둘은 '대국' 에 붙는 결과라 국면을 보는
   * 곳에는 해당되지 않는다(바로 위 주석). 외통·수몰·점수는 지금 국면의
   * 판정이라 분석에서도 그대로 말한다.
   */
  const shownOutcome = useMemo(
    () => (mode === "analyze" ? outcomeOf(gstatus, null, null) : outcome),
    [mode, gstatus, outcome]
  );

  /*
   * 두던 판을 남긴다.
   *
   * 수를 둘 때마다 한 번씩이라 잦지 않다. 시계는 넣지 않는다 — 100ms 마다
   * 바뀌어서 저장이 폭주하고, 새로고침한 동안 시간이 흘렀는지도 알 수 없다.
   *
   * 편집 중(draft)에는 남기지 않는다. 고치다 만 판이 다음에 대국판으로
   * 떠 있으면 곤란하다.
   *
   * 대국 탭에서 둔 것만 남긴다. 기보는 세 탭이 함께 쓰는 하나뿐이라, 이걸
   * 가려내지 않으면 분석에서 수순을 짚어본 것까지 '내 대국' 으로 저장된다.
   * 다음에 열었을 때 둔 적 없는 수가 대국 기보에 들어 있으면 영문을 모른다.
   */
  useEffect(() => {
    if (draft !== null || mode !== "play") return;
    writeStored("game", { history, cursor, resigned, flagged } satisfies SavedGame);
  }, [history, cursor, resigned, flagged, draft, mode]);

  /*
   * 대국이 끝나면 골라둔 기물을 놓는다.
   *
   * 기물을 하나 고른 채로 기권하면 선택 링과 갈 곳 점이 판에 그대로 남았다.
   * "한이 이겼습니다" 배너 아래에서 아직 둘 수 있는 것처럼 보인다. 실제로는
   * 막혀 있어서 눌러도 아무 일이 없으니 더 헷갈린다.
   *
   * 끝나는 길이 넷(기권·시간패·외통·200수 점수)이라 각각 손보는 대신
   * '끝났는가' 하나만 보고 지운다.
   */
  useEffect(() => {
    if (showOver) setSelected(null);
  }, [showOver]);

  /*
   * 결과 팝업.
   *
   * '지금 끝난 판인지'가 아니라 '방금 끝났는지'를 본다. 앞의 것으로 하면
   * 새로고침해서 끝난 판을 되살릴 때마다 이미 아는 결과가 다시 튀어나오고,
   * 복기하러 들어올 때마다 창을 닫아야 한다. 그래서 대국이 끝나는 '순간'만
   * 잡는다 - 처음 그릴 때의 over 는 이미 본 것으로 치고 넘어간다.
   */
  const [resultOpen, setResultOpen] = useState(false);
  const wasOver = useRef(over);
  useEffect(() => {
    if (over && !wasOver.current) setResultOpen(true);
    wasOver.current = over;
  }, [over]);

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
      if (clockSettings.enabled) {
        setClocks((prev) => commitMove(prev, mover, clockSettings));
      }
      // 수가 하나라도 바뀌면 앞서 돌린 복기는 더 이상 이 기보의 것이 아니다.
      setReviewed(null);
    },
    [cursor, mover, clockSettings, position.board]
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
    setClocks(initialClocks(clockSettings));
    setFlagged(null);
  }, [clockSettings]);

  /*
   * 설정을 바꾸면 양쪽 시계를 새로 채운다.
   *
   * 처음 뜰 때는 아무것도 하지 않아야 한다. 시계는 이미 고른 설정으로 차 있고,
   * 여기서 한 번 더 채우면 되살린 시간패가 지워진다. 그래서 '처음인가' 대신
   * '설정이 실제로 달라졌는가' 를 본다 — StrictMode 가 effect 를 두 번 돌려도
   * 두 번째는 값이 같으니 그냥 지나간다.
   */
  const lastClockSetup = useRef(clockSettings);
  useEffect(() => {
    if (lastClockSetup.current === clockSettings) return;
    lastClockSetup.current = clockSettings;
    setClocks(initialClocks(clockSettings));
    setFlagged(null);
  }, [clockSettings]);

  /**
   * 시계는 첫 수가 놓여야 돈다.
   * 급수를 고르고 상차림을 맞추는 동안 시간이 깎이면 곤란하기 때문이다.
   * 기보를 되짚는 중(기보 끝이 아님)이나 대국이 끝난 뒤에는 멈춘다.
   */
  const clockRunning =
    clockSettings.enabled && mode === "play" && started && atTip && !over && !editMode;

  useEffect(() => {
    if (!clockRunning) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      setClocks((prev) => tickClock(prev, mover, dt, clockSettings));
    }, 200);
    return () => window.clearInterval(id);
    // mover 가 바뀌면 타이머를 다시 건다. 그 순간 last 도 새로 잡혀 시간이 새지 않는다.
  }, [clockRunning, clockSettings, mover]);

  useEffect(() => {
    const out = flaggedSide(clocks);
    // 알림은 띄우지 않는다. 결과 팝업·대국자 카드·시계 칸이 이미 같은 말을 한다.
    if (out && !flagged) setFlagged(out);
  }, [clocks, flagged]);

  // 엔진 차례가 되면 탐색이 끝나는 대로 그 수를 둔다.
  const playedFor = useRef<string | null>(null);
  useEffect(() => {
    const key = positionKey(positionRef);
    // 국면을 벗어났으면 '이미 둔 자리' 기억을 버린다. 이 한 줄이 없으면
    // 무르고 같은 수를 다시 뒀을 때 엔진이 영영 두지 않는다 (forgetIfMoved 주석 참고).
    playedFor.current = forgetIfMoved(playedFor.current, key);

    if (!engineTurn || over) return;
    if (!snapshot || snapshot.running || !snapshot.bestmove) return;
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

  /**
   * 대국에서의 무르기.
   *
   * 한 칸만 되감으면 엔진 차례에 멈춘다. 그런데 기보 끝이 아니면 엔진은 두지
   * 않으므로, 판이 조용히 멈춘 것처럼 보인다 — 내 기물을 눌러도 아무 일도
   * 일어나지 않고 안내도 없다. 실제로 그래서 고장인 줄 알았다.
   *
   * 그래서 내 차례가 나올 때까지 되감는다. 보통 두 수(내 수 + 엔진 응수)다.
   * 분석·복기에서는 한 칸씩 움직이는 것이 맞으므로 그대로 둔다.
   */
  const undoMove = useCallback(() => {
    setSelected(null);
    setCursor((c) =>
      undoTarget(
        history.map((h) => h.fen),
        c,
        mode === "play" ? mySide : null
      )
    );
  }, [mode, mySide, history]);

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

  /**
   * 판을 만질 수 있는지.
   *
   * 복기는 읽기만 한다. 대국에서는 내 차례에만, 그리고 대국이 끝나면 못 둔다.
   *
   * 분석에서는 끝난 판이라도 둘 수 있어야 한다. 기권·시간패는 '국면' 이 아니라
   * '대국' 에 붙는 결과인데, 그것 때문에 분석판까지 잠겨 있었다. 진 판을 다시
   * 놓아보는 것이 분석판의 쓸모라 이건 앞뒤가 맞지 않는다. 정말로 둘 수가 없는
   * 국면(외통·수몰)은 legalFrom 이 비어 있어서 저절로 막히므로, 여기서 한 번
   * 더 막을 필요가 없다.
   */
  const canTouchBoard =
    mode === "analyze"
      ? true
      : mode === "play" && !over && !engineTurn;

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

  /**
   * 탭을 옮긴다.
   *
   * 탭 말고도 '복기 보기' 버튼처럼 다른 데서 탭을 옮기는 자리가 생겨서, 옮길 때
   * 같이 해야 하는 일(편집 끝내기·고른 기물 놓기)을 한곳에 뒀다.
   */
  const goMode = useCallback(
    (next: Mode) => {
      if (reviewRunning) return;
      if (next !== "analyze" && draft !== null) leaveEdit();
      setMode(next);
      setSelected(null);
    },
    // leaveEdit 은 매 렌더 새로 만들어지지만 draft 를 닫는 일만 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reviewRunning, draft]
  );

  const resign = () => {
    // 기권하면 결과 팝업이 뜨고, 거기에 '복기 보기'가 있다. 예전에는 여기서
    // 머리말 알림으로 "복기 탭에서 볼 수 있습니다" 를 띄웠는데, 팝업·판 위
    // 배너까지 셋이 같은 말을 하게 됐다.
    setResigned(mySide);
  };

  // --- 기보 저장·불러오기 -----------------------------------------------

  const recordPlayers = (): Record<"cho" | "han", RecordPlayer> => {
    const make = (side: Side): RecordPlayer =>
      mySide === side
        ? { kind: "human", label: "나" }
        : { kind: "engine", level: levelId, label: level.name };
    return { cho: make("cho"), han: make("han") };
  };

  /**
   * 기보에 적을 승부.
   *
   * 기권과 시간패를 먼저 본다. 둘은 상태로 들고 있어서 기보를 되짚는 중에
   * 저장해도 그대로다. 외통·수몰·점수는 엔진이 '지금 보고 있는 국면' 을
   * 판정한 값이라 기보 끝에 있을 때만 믿을 수 있다.
   *
   * 시간패와 200수 점수제가 빠져 있어서, 그렇게 끝난 판을 저장하면 승부가
   * 통째로 'unfinished' 로 적혔다.
   */
  const recordResult = (): RecordResult => {
    // 기보 끝이 아니면 외통·수몰·점수는 믿을 수 없다(지금 보고 있는 국면의
    // 판정이라서). 기권·시간패는 대국에 붙는 결과라 그대로 쓴다.
    const o = outcomeOf(atTip ? gstatus : { kind: "playing" }, resigned, flagged);
    if (!o) return "unfinished";
    return o.winner ?? "draw";
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
        // 고른 급수에 맞춰 등급 눈높이를 낮춘다. 12급과 둔 판을 9단 잣대로
        // 재면 평범한 첫 수부터 '부정확' 이 붙는다.
        tolerance: gradeToleranceOf(level),
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
  //
  // 헤더와 판·패널 덩어리를 가운데로 모으려면(layout.css 의 .top/.layout)
  // '판이 들어갈 수 있는 폭' 도 알아야 한다. 이건 --board-w 로 쓰면 안 된다.
  // 처음에 그렇게 짰더니 1440 에서 잰 659 가 덩어리 폭을 정하고, 덩어리 폭이
  // 다시 판 칸을 659 로 묶어서 1920 으로 창을 키워도 판이 커지지 못했다.
  // 판이 제 폭으로 제 칸을 정하는 고리다.
  //
  // 그래서 판 자리의 '높이' 에서 거꾸로 계산한다(--board-fit). 판 자리의
  // 높이는 헤더·대국자 카드처럼 세로로 쌓인 것만 보고 정해지므로 가로 폭에
  // 기대지 않는다. 판은 그 높이를 다 쓰고, 폭은 높이 × 판의 가로세로 비다.
  // 둘 다 .app 에 걸어 헤더와 판 칸이 같은 값을 본다.
  //
  // --board-fit 은 같은 창 크기 안에서는 줄이지 않는다. 장군·기권 알림이나
  // 편집 팔레트가 판 위아래에 끼면 판 자리가 낮아지는데, 그때마다 덩어리 폭을
  // 따라 줄이면 헤더와 패널이 옆으로 25px 씩 움직였다. 장군은 대국 중에 수시로
  // 떴다 사라지니 화면 전체가 출렁인다. 가장 컸던 값을 쥐고 있으면 판만 제
  // 칸 안에서 줄고(예전과 같다) 헤더와 패널은 제자리에 있다. 창 크기가
  // 바뀌면 그때 새로 잰다.
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const table = tableRef.current;
    const svg = table?.querySelector<SVGSVGElement>("svg.board");
    const stage = table?.querySelector<HTMLElement>(".board-stage");
    if (!table || !svg || !stage) return;
    const host = table.closest<HTMLElement>(".app") ?? table;
    let fitFor = "";
    let fit = 0;
    const ro = new ResizeObserver(() => {
      host.style.setProperty(
        "--board-w",
        `${Math.ceil(svg.getBoundingClientRect().width)}px`
      );
      const viewport = `${window.innerWidth}x${window.innerHeight}`;
      if (viewport !== fitFor) {
        fitFor = viewport;
        fit = 0;
      }
      const { width: vbW, height: vbH } = svg.viewBox.baseVal;
      fit = Math.max(fit, Math.ceil((stage.getBoundingClientRect().height * vbW) / vbH));
      host.style.setProperty("--board-fit", `${fit}px`);
    });
    ro.observe(svg);
    ro.observe(stage);
    return () => ro.disconnect();
    // 엔진을 내려받는 동안에는 로딩 화면이라 판이 아직 없다. 준비가 끝나고
    // 판이 붙은 뒤에 다시 걸어야 한다.
  }, [status]);

  // --- 대국자 카드 ------------------------------------------------------

  // 판은 초를 아래에 놓고 그린다. 뒤집으면 위아래가 바뀐다.
  const bottomSide: Side = flipped ? "han" : "cho";
  const topSide: Side = flipped ? "cho" : "han";

  const scores = useMemo(() => scoreBoard(position), [position]);

  // 이 판을 어떤 상차림으로 시작했는지. 대국 탭이 고른 칸을 짚는 데 쓴다.
  // 지금 국면이 아니라 시작 국면을 본다 - 몇 수 두고 나면 마·상이 움직여서
  // 지금 판으로는 되읽을 수 없다.
  const startSetups = useMemo(() => {
    const board = parseFen(history[0].fen).board;
    return { cho: detectSetup(board, "cho"), han: detectSetup(board, "han") };
  }, [history]);

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
      active: !showOver && position.turn === side,
      thinking: mode === "play" && engineTurn && position.turn === side,
      // 시계는 대국에서만 돈다. 복기·분석에서 남은 시간을 보여주면 아직
      // 대국 중인 것처럼 읽힌다.
      clock: mode === "play" && clockSettings.enabled ? clocks[side] : null,
      // 막대 길이를 재려면 '전체가 얼마였는지'가 있어야 한다.
      settings: mode === "play" && clockSettings.enabled ? clockSettings : null,
      // 장군·승패. 예전의 판 위 배너 대신 여기서 말한다(sideTag 주석).
      tag: sideTag(gstatus, shownOutcome, side),
    }),
    [
      mySide, level.name, scores, position, showOver, engineTurn, mode,
      clockSettings.enabled, clocks, gstatus, shownOutcome,
    ]
  );

  /*
   * 헤더 오른쪽에 거는 판 상태. 편집 중이거나 판이 규칙에 맞지 않을 때만 뜬다.
   *
   * '성립하지 않는 국면' 은 예전에 판 위 배너였다. 배너가 뜨면 판이 그만큼
   * 줄어서, 높이가 늘 같은 헤더 줄로 옮겼다. 무엇이 틀렸는지는 국면 카드의
   * 경고 목록(편집 중에도, 보기에서도 뜬다)과 이 표시의 툴팁이 말한다.
   *
   * 말은 짧아야 한다. 폰(390)에서 앱 이름과 탭 옆에 남는 자리가 71px 이라
   * "판 편집 중 · 성립하지 않는 국면" 을 붙였더니 헤더가 두 줄이 되며 판이
   * 38px 내려갔다. 배너를 없앤 까닭이 그대로 되살아난 셈이다. 그래서 편집
   * 중에는 "판 편집 중" 만 두고(바로 옆 편집 패널이 경고를 보여준다), 편집을
   * 마친 뒤에도 틀린 판이면 "잘못된 판"(57px) 을 건다.
   */
  const problems = gstatus.kind === "invalid" ? gstatus.problems : null;
  const headTag = editMode ? "판 편집 중" : problems ? "잘못된 판" : null;

  // 눈으로는 대국자 카드와 헤더가 말하는 것을 화면 읽기 프로그램에 한 줄로 알린다.
  const spoken = shownOutcome ? outcomeMessage(shownOutcome) : (statusMessage(gstatus) ?? "");

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
        {/*
          예전에는 여기에 "신경망 적용됨" 배지가 있었다. 만든 쪽에서나 뿌듯한
          말이지 두는 사람에게는 아무 뜻이 없고, 화면에서 제일 좋은 자리를
          차지하고 있었다. 신경망이 붙었는지는 useEngine 의 evalMode 로 여전히
          알 수 있다 — 필요하면 콘솔에서 본다.
        */}
        <ModeTabs mode={mode} onMode={goMode} canReview={history.length > 1} />

        {/*
          예전에는 여기서 늘 "둘 차례: 초 楚 · 엔진이 생각 중…" 을 말했다.
          판 바로 위아래 대국자 카드가 같은 말(둘 차례, 생각 중인 점)을 하고
          있어서 한 화면에 두 번 나왔고, 폰에서는 이 한 줄 때문에 헤더가 두
          줄이 됐다. '복기 중' 도 바로 옆 탭이 이미 말한다. 편집 중만 남긴다 -
          그때는 대국자 카드가 빠져서 판의 상태를 말할 곳이 여기뿐이다.
          규칙에 맞지 않는 판도 여기서 말한다(headTag 주석).
        */}
        {headTag && (
          <span className="turn-tag" title={problems?.join(" ")}>
            {headTag}
          </span>
        )}
        <p className="sr-only" role="status">
          {spoken}
        </p>
      </header>

      <main className="layout">
        <section className="board-col">
          <div className="table" ref={tableRef}>
            {/*
              판 위에는 아무것도 끼우지 않는다. 예전에는 장군·외통·기권·시간패·
              성립하지 않는 국면을 여기 배너로 띄웠는데, 판 크기가 남은 높이로
              정해지는 탓에 배너가 뜰 때마다 판이 50px 남짓 줄었다 늘었다 했다.
              장군이 걸릴 때마다 그랬다. 이제 장군·승패는 대국자 카드가,
              성립하지 않는 국면은 헤더가 말한다. 배너의 '한 수 무르기' 는
              오른쪽 위 무르기 버튼과 같은 일이라 따로 두지 않는다.
            */}

            {/*
              대국자 카드는 편집 중을 빼고 어디서나 그린다.
              대국 탭에만 두었더니 탭을 옮길 때마다 판이 596↔695 로 출렁였다.
              카드가 차지하는 높이가 빠지고 더해지기 때문이다. 어차피 누가 어느
              쪽인지·기물 점수·잡은 기물은 복기와 분석에서도 볼 값이라 같이 둔다.
              편집 중에는 팔레트에 자리를 내준다.
            */}
            {!editMode && <PlayerBar {...playerOf(topSide)} />}

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
                onPick={handleSquareClick}
              />
            </div>

            {!editMode && <PlayerBar {...playerOf(bottomSide)} />}

            {/*
              버튼 줄은 오른쪽 칸(BoardControls)으로 갔다. 판 아래에 두면 그
              44px 만큼 판이 작아진다. 편집 중의 팔레트는 판 바로 아래가 맞다 -
              집은 기물을 판에 찍는 동작이라 손이 오가는 거리가 짧아야 한다.
            */}
            {editMode && <PiecePalette brush={brush} onPick={setBrush} />}
          </div>
        </section>

        <section className="side-col">
          <BoardControls
            mode={mode}
            editing={editMode}
            cursor={cursor}
            last={history.length - 1}
            canTouch={canTouchBoard}
            onJump={goTo}
            onUndo={undoMove}
            onFlip={() => setFlipped((f) => !f)}
            onPass={passMove}
          />

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
                  /*
                   * 고른 쪽을 아래에 놓는다.
                   *
                   * 판은 늘 초를 아래에 두고 그렸다. 그래서 한을 잡으면 내
                   * 기물이 화면 위쪽에 거꾸로 서 있고, 판 뒤집기를 직접
                   * 눌러야 했다. 앉은 자리에서 보는 것이 당연한 기본값이다.
                   * 그래도 뒤집어 보고 싶으면 판 뒤집기로 언제든 바꾼다.
                   */
                  setFlipped(s === "han");
                  playedFor.current = null;
                }}
                onLevel={setLevelId}
                setups={startSetups}
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
              />

              <AnalysisPanel
                snapshot={snapshot}
                board={position.board}
                enabled={analysisEnabled}
                editing={editMode}
                onHoverLine={setHover}
                onPlayLine={(move) => {
                  if (editMode || !canTouchBoard) return;
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
              levelName={level.name}
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
                onHoverMove={setHover}
                onSave={saveRecord}
                onLoad={loadRecord}
              />
            </>
          )}
        </section>

        {/*
          알림. 예전에는 헤더 아래 한 줄을 차지해서, 뜰 때와 4초 뒤 사라질 때
          화면 전체가 두 번 아래위로 움직였다. 이제 자리를 차지하지 않고
          오른쪽 칸 아래에 떴다가 사라진다. 판은 가리지 않는다.
        */}
        <div className="toast" role="status">
          {notice}
        </div>
      </main>

      {/*
        결과 팝업. 대국에서만 뜬다 - 분석·복기에서 끝난 국면을 불러올 때마다
        창이 뜨면 그게 곧 방해다.
      */}
      {mode === "play" && resultOpen && outcome && (
        <GameOverDialog
          outcome={outcome}
          mySide={mySide}
          moveCount={history.length - 1}
          levelName={level.name}
          onReview={() => {
            setResultOpen(false);
            goMode("review");
          }}
          onNewGame={() => {
            setResultOpen(false);
            newGame();
          }}
          onClose={() => setResultOpen(false)}
        />
      )}
    </div>
  );
}
