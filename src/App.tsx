import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Volume2, VolumeX } from "lucide-react";

import { Board } from "./components/board/Board";
import { ModeTabs } from "./components/ModeTabs";
import type { Mode } from "./components/ModeTabs";
import { EvalGraph } from "./components/panels/EvalGraph";
import { MoveList } from "./components/panels/MoveList";
import type { HistoryEntry } from "./components/panels/MoveList";
import { BoardControls } from "./components/panels/BoardControls";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { GameList } from "./components/GameList";
import { GameOverDialog } from "./components/GameOverDialog";
import { PlayPanel } from "./components/panels/PlayPanel";
import { PlayerBar } from "./components/board/PlayerBar";
import { ReviewPanel } from "./components/panels/ReviewPanel";

import { readStored, safeStore, usePersisted, writeStored } from "./hooks/usePersisted";
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
import { playMoveSound, playPickSound, playTickSound, setSoundEnabled } from "./audio/sound";

import type { Board as BoardMap, Position, Square } from "./janggi/board";
import { START_FEN, parseFen, toFen, undoTarget } from "./janggi/board";
import { arrowOf, describeMove, splitMove } from "./janggi/notation";
import type { PieceChar, PieceType, Side } from "./janggi/pieces";
import { sideOf } from "./janggi/pieces";
import { applySetup, detectSetup } from "./janggi/setups";
import type { Setup } from "./janggi/setups";
import {
  gameStatus,
  outcomeOf,
  outcomeMessage,
  capturedPieces,
  scoreBoard,
  sideTag,
  statusMessage,
  trailingPasses,
} from "./janggi/status";
import type { Outcome } from "./janggi/status";
import {
  CLOCK_PRESETS,
  DEFAULT_CLOCK_ID,
  alarmSecondOf,
  clockPresetById,
  withFlagged,
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
import type { ReviewProgress } from "./janggi/review";
import { newGameId, readArchive, resultTag, upsertGame, whenLabel } from "./janggi/archive";
import type { ArchivedGame, ArchivedResult } from "./janggi/archive";

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

const VARIANTS = ["janggi", "janggimodern", "janggitraditional"];

/**
 * 저장해 둔 값이 지금도 쓸 수 있는 모양인지.
 *
 * localStorage 는 사람이 직접 고칠 수 있고 예전 판에서 남긴 값도 들어 있다.
 * 여기서 걸러내면 이상한 값이 들어가도 다음 실행에 저절로 낫는다.
 */
function isEnginePrefs(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.threads === "number" && p.threads >= 1 && p.threads <= 16 &&
    typeof p.hashMb === "number" && p.hashMb >= 16 &&
    typeof p.multiPV === "number" && p.multiPV >= 1 && p.multiPV <= 8 &&
    typeof p.variant === "string" && VARIANTS.includes(p.variant)
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
  /**
   * 이 판의 이름표. 끝난 판을 기보 목록에 넣을 때 쓴다 - 같은 판이 두 번
   * 들어와도 한 줄로 바뀌게. 목록이 생기기 전에 저장된 판에는 없다.
   */
  id?: string;
  history: HistoryEntry[];
  cursor: number;
  resigned: Side | null;
  flagged: Side | null;
}

function isSavedGame(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const g = v as Record<string, unknown>;
  return (
    (g.id === undefined || typeof g.id === "string") &&
    isHistory(g.history) &&
    typeof g.cursor === "number" &&
    g.cursor >= 0 &&
    g.cursor < (g.history as unknown[]).length &&
    isSide(g.resigned) &&
    isSide(g.flagged)
  );
}

/** 폰처럼 좁은 화면인지. layout.css 의 900 과 같은 경계다. */
const NARROW = "(max-width: 900px)";

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

/**
 * 기보 목록을 남긴다. 저장 공간이 차면 오래된 판부터 덜어내고 다시 남긴다.
 * 남긴 목록을 돌려준다. 저장소가 아예 없으면(사생활 보호 모드) 손대지 않는다 -
 * 그때 덜어내면 지금 화면의 목록까지 비워진다.
 */
function storeArchive(list: ArchivedGame[]): ArchivedGame[] {
  if (!safeStore()) return list;
  let kept = list;
  while (kept.length > 0 && !writeStored("games", kept)) kept = kept.slice(0, -1);
  return kept;
}

export default function App() {
  const { engine, status, progress, error } = useEngine();

  const [mode, setMode] = useState<Mode>("play");
  const narrow = useNarrow();

  /*
   * 두던 판을 되살린다.
   *
   * 새로고침하거나 폰에서 앱을 잠깐 나갔다 오면 기보가 통째로 사라졌다.
   * 한 판 두던 중이면 그게 제일 아깝다. 한 수라도 둔 판일 때만 되살린다.
   */
  const savedGame = useMemo(() => {
    const g = readStored<SavedGame | null>("game", null, isSavedGame);
    return g && g.history.length > 1 ? g : null;
  }, []);

  /*
   * 판은 둘이다. 대국 탭의 두던 판(play*)과 기보 탭에서 연 지난 판(openGame).
   *
   * 예전에는 기보가 하나뿐이라 세 탭이 나눠 썼다. 분석에서 수순을 짚어 보면 그게
   * 대국 기보에 섞였고, 복기는 방금 둔 판만 볼 수 있었다. 이제 두던 판은 대국
   * 탭만 만지고, 기보 탭은 목록에서 고른 판을 따로 들고 본다. 아래의 history·
   * cursor 는 '지금 화면에 떠 있는 판' 이라 탭에 따라 둘 중 하나를 가리킨다.
   */
  const [playHistory, setPlayHistory] = useState<HistoryEntry[]>(
    savedGame ? savedGame.history : initialHistory
  );
  const [playCursor, setPlayCursor] = useState(savedGame ? savedGame.cursor : 0);
  const [gameId, setGameId] = useState(() => savedGame?.id ?? newGameId());
  const [flipped, setFlipped] = usePersisted("flipped", false, (v) => typeof v === "boolean");
  const [selected, setSelected] = useState<Square | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 헤더의 소리 버튼. 소리를 내는 effect 들보다 먼저 선언해 같은 렌더에서 먼저 돈다.
  const [soundOn, setSoundOn] = usePersisted("soundOn", true, (v) => typeof v === "boolean");
  useEffect(() => setSoundEnabled(soundOn), [soundOn]);

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
  const [resigned, setResigned] = useState<Side | null>(savedGame ? savedGame.resigned : null);
  /**
   * 시간패한 쪽.
   *
   * 기권과 마찬가지로 되살린다. 되살리지 않았을 때는 시간패로 진 판을
   * 새로고침하면 패배가 사라지고 그대로 이어서 둘 수 있었다.
   */
  const [flagged, setFlagged] = useState<Side | null>(savedGame ? savedGame.flagged : null);
  // 예전에 골라 둔 10분·20분·직접 입력은 여기서 걸러져 기본값(5분)으로 간다.
  const [clockId, setClockId] = usePersisted(
    "clockId",
    DEFAULT_CLOCK_ID,
    (v) => typeof v === "string" && CLOCK_PRESETS.some((c) => c.id === v)
  );
  /*
   * 참조가 바뀌지 않아야 한다.
   *
   * 이 값이 아래 '엔진이 쓸 시간' effect 의 의존성에 들어 있다. 렌더마다 새
   * 객체가 되면 탐색이 멈췄다 다시 시작해 엔진이 한 수도 못 둔다 - 직접 입력
   * 시계가 있던 때 실제로 그랬다. clockPresetById 는 목록 속 객체를 그대로
   * 돌려주므로 괜찮다.
   */
  const clockSettings = clockPresetById(clockId);
  // 되살린 판이 시간패로 끝난 것이면 그 쪽 시계를 다 쓴 모습으로 채운다.
  // 시계만 가득 찬 채 "시간패" 가 적혀 있으면 앞뒤가 맞지 않는다.
  const [clocks, setClocks] = useState<ClockState>(() =>
    withFlagged(initialClocks(clockSettings), flagged)
  );
  // '두는 동안 훈수 보기' 는 뺐다. 켜 두면 대국이 아니라 받아쓰기가 되고,
  // 엔진이 권하는 수는 판이 끝난 뒤 기보 탭의 복기에서 본다.
  const level = levelById(levelId);

  // 엔진 설정. 스레드·해시 슬라이더가 있던 분석 탭을 뺐으므로 처음 값 그대로
  // 쓴다. 규칙(variant)은 대국 패널이 바꾼다.
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

  // --- 지난 판 ----------------------------------------------------------
  const [games, setGames] = useState<ArchivedGame[]>(() =>
    readArchive(readStored<unknown>("games", []))
  );
  useEffect(() => {
    const kept = storeArchive(games);
    if (kept.length !== games.length) setGames(kept);
  }, [games]);

  /** 기보 탭에서 연 판. null 이면 목록을 보여준다. */
  const [openId, setOpenId] = useState<string | null>(null);
  /** 기보 목록에서 보던 쪽. 한 판을 열었다가 '목록' 으로 돌아오면 이 쪽으로 온다. */
  const [listPage, setListPage] = useState(0);
  const [viewCursor, setViewCursor] = useState(0);
  /** 연 판은 그 판을 둔 쪽이 아래로 오게 따로 뒤집는다. 대국 탭의 설정은 건드리지 않는다. */
  const [viewFlipped, setViewFlipped] = useState(false);
  const openGame =
    mode === "games" && openId ? (games.find((g) => g.id === openId) ?? null) : null;
  const listView = mode === "games" && !openGame;

  // --- 복기 -------------------------------------------------------------
  const [reviewDepthId, setReviewDepthId] = usePersisted(
    "reviewDepthId",
    DEFAULT_REVIEW_DEPTH_ID,
    (v) => typeof v === "string" && REVIEW_DEPTHS.some((d) => d.id === v)
  );
  const [reviewRunning, setReviewRunning] = useState(false);
  const [reviewProgress, setReviewProgress] = useState<ReviewProgress | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const cancelReview = useRef(false);

  // --- 지금 화면에 떠 있는 판 ---------------------------------------------
  const history = openGame ? openGame.history : playHistory;
  const cursor = openGame ? Math.min(viewCursor, openGame.history.length - 1) : playCursor;
  const setCursor = openGame ? setViewCursor : setPlayCursor;
  const reviewed = openGame?.reviewed ?? null;
  const boardFlipped = openGame ? viewFlipped : flipped;

  const entry = history[cursor];
  const position = useMemo(() => parseFen(entry.fen), [entry.fen]);
  /** 대국 탭의 판에 한 수라도 뒀는지. 시계와 새 대국 확인이 본다. */
  const started = playHistory.length > 1;
  /** 연 판은 그 판의 규칙으로 본다. 빅장·수 반복 판정이 규칙마다 다르다. */
  const variant = (
    openGame && VARIANTS.includes(openGame.variant) ? openGame.variant : prefs.variant
  ) as EngineOptions["variant"];

  /**
   * 엔진에 넘길 국면. 지금 FEN 만 주면 안 되고 수순을 함께 줘야 한다.
   * 장기의 장군반복 금지·빅장 판정이 "어떻게 여기까지 왔는가"를 보기 때문이다.
   */
  const positionRef: PositionRef = useMemo(
    () => ({
      startFen: history[0].fen,
      moves: history
        .slice(1, cursor + 1)
        .map((h) => h.move)
        .filter((m): m is string => Boolean(m)),
    }),
    [history, cursor]
  );

  // --- 엔진 차례 --------------------------------------------------------

  const engineSide: "none" | Side =
    mode !== "play" ? "none" : mySide === "cho" ? "han" : "cho";

  /**
   * 엔진이 지금 둬야 하는지.
   * 기보 끝이 아닐 때는 두지 않는다. 무르고 되짚어 보는 중에 엔진이 끼어들어
   * 기보를 잘라먹으면 곤란하다.
   */
  const atTip = cursor === history.length - 1;
  const engineTurn = mode === "play" && atTip && engineSide === position.turn;

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

  /**
   * 엔진의 탐색량. 엔진은 제 차례에만 돈다(훈수·분석을 뺐다).
   * 급수대로 노드를 걸고, 시계를 쓰면 남은 시간도 함께 건다. 엔진은 둘 중
   * 먼저 닿는 쪽에서 멈추므로, 시간이 넉넉하면 급수대로 노드를 다 쓰고
   * 쫓기면 일찍 끊는다.
   *
   * 시계를 껐을 때도 상한은 있어야 한다. '시간 제한 없음'은 사람이 무제한이라는
   * 뜻이지 엔진까지 무제한이라는 뜻이 아니다. 높은 급수는 노드가 수백만이라
   * 상한이 없으면 한 수에 분 단위로 기다리게 된다.
   */
  const searchLimits: SearchLimits = useMemo(() => {
    const cap = moveBudget > 0 ? moveBudget : ENGINE_MOVE_CAP_MS;
    return { ...limitsOf(level), movetimeMs: cap };
  }, [level, moveBudget]);

  const options: EngineOptions = useMemo(
    () => ({
      ...prefs,
      variant,
      // 엔진은 제 수 하나만 고른다. 후보를 넓게 보면 느려질 뿐이다.
      multiPV: 1,
      skill: engineTurn ? level.skill : 20,
    }),
    [prefs, variant, engineTurn, level.skill]
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

  /** 복기 중에는 탐색을 세워둔다. 같은 엔진을 둘이 나눠 쓸 수는 없다. */
  const analysisEnabled = !reviewRunning && engineTurn;

  const { snapshot, legal, checkers, probed } = useAnalysis(
    engine,
    positionRef,
    analysisEnabled,
    searchLimits,
    optionsKey
  );

  // --- 대국 상태 --------------------------------------------------------

  // 전통 규칙에는 점수제가 없어서 수 제한으로 갈리지 않고, 빅장·양쪽 한수쉼은 비긴다.
  const pointsRule = variant !== "janggitraditional";
  // 현대(카카오) 규칙에는 빅장이 없다. 두 궁이 마주 봐도 아무 일이 없다.
  const bikjangRule = variant !== "janggimodern";
  const passesInRow = useMemo(() => trailingPasses(positionRef.moves), [positionRef]);
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
        bikjangRule,
        passesInRow,
      }),
    [position, legal, checkers, probed, cursor, pointsRule, bikjangRule, passesInRow]
  );

  /**
   * 대국 탭의 판이 끝났는지, 끝났다면 어떻게. 다섯 갈래를 outcomeOf 한곳에서 받는다.
   * 기보 탭에서는 null 이다 - 그때 gstatus 는 연 판의 국면이고, 기권·시간패는
   * 두던 판의 것이라 둘을 섞으면 안 된다.
   */
  const outcome = useMemo(
    () => (mode === "play" ? outcomeOf(gstatus, resigned, flagged) : null),
    [mode, gstatus, resigned, flagged]
  );
  const over = outcome !== null;

  /**
   * 기보 탭에서 연 판의 결과. 마지막 수에 가 있을 때만 카드에 적는다 - 중간
   * 국면에 "기권패" 가 붙어 있으면 그 국면에서 기권한 것처럼 읽힌다.
   * 중단한 판, 끝나지 않은 채 저장된 파일은 적을 결과가 없다.
   */
  const viewOutcome: Outcome | null = useMemo(() => {
    if (!openGame || !atTip) return null;
    const { kind, winner } = openGame.result;
    if (kind === "abandoned") return null;
    return { kind, winner };
  }, [openGame, atTip]);

  /** 대국자 카드와 화면 읽기 프로그램에 알릴 결과. */
  const shownOutcome = mode === "play" ? outcome : viewOutcome;
  /** 끝난 판이면 두 카드를 다 눌러 둔다(둘 차례가 없다). */
  const showOver = shownOutcome !== null;

  /*
   * 두던 판을 남긴다.
   *
   * 수를 둘 때마다 한 번씩이라 잦지 않다. 시계는 넣지 않는다 — 100ms 마다
   * 바뀌어서 저장이 폭주하고, 새로고침한 동안 시간이 흘렀는지도 알 수 없다.
   *
   * 예전에는 '대국 탭에서 둔 것만' 걸러 남겨야 했다. 기보가 하나뿐이라 분석에서
   * 짚어 본 수까지 섞였기 때문이다. 이제 대국 탭의 판은 따로 들고 있어서 그대로
   * 남기면 된다.
   */
  useEffect(() => {
    writeStored("game", {
      id: gameId,
      history: playHistory,
      cursor: playCursor,
      resigned,
      flagged,
    } satisfies SavedGame);
  }, [gameId, playHistory, playCursor, resigned, flagged]);

  /*
   * 대국이 끝나면 골라둔 기물을 놓는다.
   *
   * 기물을 하나 고른 채로 기권하면 선택 링과 갈 곳 점이 판에 그대로 남았다.
   * 아직 둘 수 있는 것처럼 보이는데 실제로는 막혀 있어서 더 헷갈린다.
   * 끝나는 길이 넷(기권·시간패·외통·200수 점수)이라 각각 손보는 대신
   * '끝났는가' 하나만 보고 지운다.
   */
  useEffect(() => {
    if (showOver) setSelected(null);
  }, [showOver]);

  // --- 끝난 판을 목록에 남기기 ---------------------------------------------

  /** 대국 탭의 판을 기보 목록에 넣을 모양으로. */
  const archiveOf = useCallback(
    (result: ArchivedResult): ArchivedGame => ({
      id: gameId,
      endedAt: Date.now(),
      mySide,
      levelId,
      levelName: level.name,
      variant: prefs.variant,
      result,
      history: playHistory,
      reviewed: null,
    }),
    [gameId, mySide, levelId, level.name, prefs.variant, playHistory]
  );

  /*
   * 판이 끝나면 기보 목록에 넣고, 방금 끝났으면 결과 창을 띄운다.
   *
   * 결과 창은 '지금 끝난 판인지' 가 아니라 '방금 끝났는지' 를 본다. 앞의 것으로
   * 하면 새로고침할 때마다 이미 아는 결과가 다시 튀어나오고, 탭을 오갈 때마다
   * 창을 닫아야 한다. 예전에는 처음 그릴 때의 over 를 이미 본 것으로 쳤는데,
   * 이제는 목록이 답한다. 같은 결과로 이미 들어 있으면 본 판이다.
   *
   * 끝난 뒤 무르고 다시 두어 다르게 끝나면 한 번 더 들어온다. 이름표(gameId)가
   * 같아서 목록에서는 한 줄이 바뀐다(upsertGame). 결과가 같고 수만 달라졌으면
   * 목록만 고치고 창은 다시 띄우지 않는다.
   */
  const [resultOpen, setResultOpen] = useState(false);
  useEffect(() => {
    if (!outcome || playHistory.length < 2) return;
    const prev = games.find((g) => g.id === gameId);
    const sameResult =
      prev !== undefined &&
      prev.result.kind === outcome.kind &&
      prev.result.winner === outcome.winner;
    if (sameResult && prev.history.length === playHistory.length) return;
    setGames((list) => upsertGame(list, archiveOf(outcome)));
    if (!sameResult) setResultOpen(true);
  }, [outcome, games, gameId, playHistory, archiveOf]);

  /**
   * 대국 탭의 판이 끝났는지. 판·무르기·설정 잠금과 새 대국 확인 창이 본다.
   *
   * over 는 지금 보고 있는 국면의 판정이라, 외통으로 끝난 판을 '이전' 으로
   * 되짚으면 false 가 된다. 그것으로 잠그면 앞 국면에서 판이 풀려 끝난 판을
   * 이어 둘 수 있다. 그래서 판 전체로 본다 - 끝나는 순간 목록에 들어간 결과가
   * 있고 수순이 그대로면 끝난 판이다. 잠긴 판은 수순이 바뀌지 않으므로 새
   * 대국을 누를 때까지 끝난 판으로 남는다.
   */
  const archivedSelf = games.find((g) => g.id === gameId);
  const ended =
    over ||
    (archivedSelf !== undefined &&
      archivedSelf.result.kind !== "abandoned" &&
      archivedSelf.history.length === playHistory.length);

  // --- 수 두기 ----------------------------------------------------------

  /** 지금 둘 차례. 시계에서 "누구 시간을 깎을지" 를 정하는 값이기도 하다. */
  const mover = position.turn;

  /**
   * 방금 둔 수의 날아오는 모양(Board 의 flyMove). ply 는 그 수로 생긴 국면 번호라,
   * 무르거나 되짚어 다른 국면을 보고 있으면 날지 않는다.
   */
  const [fly, setFly] = useState<{
    from: Square;
    to: Square;
    captured?: PieceChar;
    ply: number;
    /** 날 때마다 다른 값. 무르고 같은 번호의 국면을 다시 둬도 새로 난다. */
    key: number;
  } | null>(null);

  /** 방금 수를 둬서 생긴 국면 번호. 장군·멍군을 그 순간에만 외치려고 기억한다. */
  const justMoved = useRef<number | null>(null);

  const pushMove = useCallback(
    (from: Square, to: Square, animate = true) => {
      // 소리는 판을 고치기 전에 낸다. 여기를 사람도 엔진도 다 지나가므로
      // 한 군데만 손보면 된다. 한수쉼(제자리 수)은 잡는 게 아니다.
      playMoveSound(from !== to && position.board[to] ? "capture" : "move");
      // 끌어서 둔 수는 손으로 이미 옮겼으니 날리지 않는다. 한수쉼은 움직임이 없다.
      setFly(
        animate && from !== to
          ? { from, to, captured: position.board[to], ply: playCursor + 1, key: Date.now() }
          : null
      );
      justMoved.current = playCursor + 1;
      setPlayHistory((prev) => {
        const base = prev.slice(0, playCursor + 1);
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
      setPlayCursor((c) => c + 1);
      setSelected(null);
      // 초읽기는 "회 안에만 두면 회수가 줄지 않는" 규칙이라, 둘 때마다 되채운다.
      if (clockSettings.enabled) {
        setClocks((prev) => commitMove(prev, mover, clockSettings));
      }
    },
    [playCursor, mover, clockSettings, position.board]
  );

  // --- 장군·멍군 ---------------------------------------------------------

  /**
   * 국면마다 장군이 걸려 있었는지. 멍군을 가리려면 '바로 앞 국면' 이 장군이었는지
   * 알아야 한다. 대국 탭의 국면은 다음 수를 두기 전에 반드시 엔진 응답(probed)을
   * 받으므로(합법수가 있어야 둘 수 있다) 앞 국면의 값은 늘 채워져 있다.
   */
  const checkAt = useRef(new Map<number, boolean>());
  const [callout, setCallout] = useState<{ text: string; key: number } | null>(null);

  /*
   * 방금 둔 수로 장군이나 빅장이 걸렸으면 판 가운데에 외친다.
   *
   * 장군을 받은 쪽이 그 수로 피하면서 되받아 장군을 부르면 멍군이다 - 앞 국면도
   * 장군, 이번 국면도 장군. 외통은 외치지 않는다. 결과 창이 바로 뜨기 때문이다.
   * 되짚거나 무르다가 장군 국면에 와도 외치지 않는다(방금 둔 수일 때만).
   *
   * 빅장도 외친다. 받은 쪽은 궁을 비키거나 막아야 하고, 모르고 한수쉼을 두면 판이
   * 끝난다. 두 궁이 마주 선 것은 판을 봐서는 눈에 잘 안 띈다.
   */
  useEffect(() => {
    if (mode !== "play" || !probed) return;
    const inCheck = checkers.length > 0;
    checkAt.current.set(playCursor, inCheck);
    if (justMoved.current !== playCursor) return;
    justMoved.current = null;
    if (gstatus.kind === "check") {
      const text = checkAt.current.get(playCursor - 1) ? "멍군!" : "장군!";
      setCallout({ text, key: playCursor });
    } else if (gstatus.kind === "facing") {
      setCallout({ text: "빅장!", key: playCursor });
    }
  }, [mode, probed, checkers, playCursor, gstatus.kind]);

  useEffect(() => {
    if (!callout) return;
    // CSS 가 1.1초에 걸쳐 떴다 사라진다. 요소는 조금 뒤에 걷는다.
    const t = window.setTimeout(() => setCallout(null), 1200);
    return () => window.clearTimeout(t);
  }, [callout]);

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
   * 기보를 되짚는 중(기보 끝이 아님)이나 대국이 끝난 뒤, 기보 탭에 가 있는
   * 동안에는 멈춘다.
   */
  const clockRunning = clockSettings.enabled && mode === "play" && started && atTip && !over;

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

  /*
   * 초읽기 소리. 내 차례에, 다 쓰면 한 회가 줄거나 지는 시간의 마지막 10초에
   * 1초마다 한 번(alarmSecondOf 주석). 값이 10 → 9 → … → 1 로 바뀔 때마다 이
   * effect 가 한 번씩 돌아서 따로 타이머를 걸 필요가 없다. 엔진 차례에는 울리지
   * 않는다 - 엔진은 제 시간에 쫓기지 않고, 소리는 사람에게 하는 말이다.
   */
  const myAlarm =
    clockRunning && !engineTurn && mover === mySide ? alarmSecondOf(clocks[mySide]) : null;
  useEffect(() => {
    if (myAlarm !== null) playTickSound(myAlarm <= 5);
  }, [myAlarm]);

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
    [history.length, setCursor]
  );

  /**
   * 대국에서의 무르기.
   *
   * 한 칸만 되감으면 엔진 차례에 멈춘다. 그런데 기보 끝이 아니면 엔진은 두지
   * 않으므로, 판이 조용히 멈춘 것처럼 보인다 — 내 기물을 눌러도 아무 일도
   * 일어나지 않고 안내도 없다. 실제로 그래서 고장인 줄 알았다.
   *
   * 그래서 내 차례가 나올 때까지 되감는다. 보통 두 수(내 수 + 엔진 응수)다.
   * 기보 탭에서는 한 칸씩 움직이는 것이 맞으므로 '이전' 이 goTo 를 쓴다.
   */
  const undoMove = useCallback(() => {
    setSelected(null);
    setPlayCursor((c) =>
      undoTarget(
        playHistory.map((h) => h.fen),
        c,
        mySide
      )
    );
  }, [mySide, playHistory]);

  const flip = useCallback(
    () => (openGame ? setViewFlipped((f) => !f) : setFlipped((f) => !f)),
    [openGame, setFlipped]
  );

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
   * 대국 탭에서 내 차례에만, 판이 끝나기 전까지. 기보 탭은 지난 판을 읽기만 한다.
   * over 가 아니라 ended 를 본다 - 끝난 판을 앞 국면으로 되짚어도 잠겨 있어야 한다.
   */
  const canTouchBoard = mode === "play" && !ended && !engineTurn;

  /**
   * 집어 들 수 있는 기물. 눌러서 고르는 것(handleSquareClick)과 같은 조건이다.
   * 판을 만질 수 있고, 둘 차례인 쪽의 기물이고, 갈 곳이 있어야 한다.
   * 엔진 차례면 canTouchBoard 가 막으므로 곧 '내 기물만' 이다.
   */
  const canPick = (square: Square) => {
    const piece = position.board[square];
    return (
      canTouchBoard &&
      piece !== undefined &&
      sideOf(piece) === position.turn &&
      legalFrom.has(square)
    );
  };

  const handleSquareClick = (square: Square) => {
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

  // 끌어서 둔 수. 기물은 손을 따라 이미 도착했으므로 날리지 않는다.
  const handleMove = (from: Square, to: Square) => {
    if (!canTouchBoard) return;
    if (legalFrom.get(from)?.includes(to)) pushMove(from, to, false);
    else setSelected(null);
  };

  const passMove = () => {
    const king = Object.entries(position.board).find(
      ([, p]) => p.toLowerCase() === "k" && sideOf(p) === position.turn
    );
    if (king && legal.has(king[0] + king[0])) pushMove(king[0], king[0]);
  };

  // --- 판 새로 놓기 -------------------------------------------------------

  /** 상차림을 바꾸면 그 판을 새 시작 국면으로 삼는다. 수를 두기 전에만 된다. */
  const startFrom = (next: Position, label: string) => {
    setPlayHistory([
      { fen: toFen(next), move: null, notation: label, mover: null, score: null },
    ]);
    setPlayCursor(0);
    setSelected(null);
    setResigned(null);
    resetClocks();
    forgetMoves();
  };

  /** 판을 새로 놓으면 지난 판의 날던 수·장군 기억을 버린다. 국면 번호가 다시 0부터다. */
  const forgetMoves = () => {
    setFly(null);
    setCallout(null);
    justMoved.current = null;
    checkAt.current.clear();
  };

  /**
   * 새 대국. 지금 시작 국면(상차림 포함)은 그대로 두고 수만 지운다.
   *
   * 두던 판은 기보 목록에 남긴다. 끝난 판은 끝나는 순간 이미 들어갔고, 끝나지
   * 않은 판은 여기서 '중단' 으로 들어간다. 한 수도 두지 않은 판은 남길 것이 없다.
   */
  const newGame = () => {
    // over 가 아니라 ended 를 본다. 외통으로 끝난 판을 되짚던 중에 누르면 over 는
    // false 라서, 끝난 판이 '중단' 으로 덮여 쓰였다.
    if (started && !ended) {
      setGames((list) => upsertGame(list, archiveOf({ kind: "abandoned", winner: null })));
    }
    const base = parseFen(playHistory[0].fen);
    setPlayHistory([
      {
        fen: toFen({ ...base, turn: "cho", halfmove: 0, fullmove: 1 }),
        move: null,
        notation: "시작",
        mover: null,
        score: null,
      },
    ]);
    setPlayCursor(0);
    setGameId(newGameId());
    setSelected(null);
    setResigned(null);
    resetClocks();
    forgetMoves();
    playedFor.current = null;
    // 예전에는 여기서 "새 대국을 시작합니다. 상대는 ○○ 입니다." 알림을 띄웠다.
    // 이제는 누르기 전에 확인 창이 물으므로 한 번 더 말하지 않는다.
  };

  /**
   * 탭을 옮긴다. 기보 탭은 늘 목록에서 시작한다.
   *
   * 탭 말고도 '기보 보기' 버튼처럼 다른 데서 탭을 옮기는 자리가 있어서, 옮길 때
   * 같이 해야 하는 일(고른 기물 놓기)을 한곳에 뒀다. 복기가 도는 동안에는 엔진을
   * 붙잡고 있으므로 옮기지 않는다.
   */
  const goMode = useCallback(
    (next: Mode) => {
      if (reviewRunning) return;
      setMode(next);
      setOpenId(null);
      // 탭으로 들어오면 첫 쪽(가장 최근 판)부터 본다.
      setListPage(0);
      setSelected(null);
      setHover(null);
    },
    [reviewRunning]
  );

  /** 기보 탭에서 한 판을 연다. 끝난 모양부터 보이도록 마지막 수에 선다. */
  const openArchived = (id: string) => {
    if (reviewRunning) return;
    const game = games.find((g) => g.id === id);
    if (!game) return;
    setMode("games");
    setOpenId(id);
    setViewCursor(game.history.length - 1);
    setViewFlipped(game.mySide === "han");
    setSelected(null);
    setHover(null);
    setReviewError(null);
  };

  const closeArchived = () => {
    if (reviewRunning) return;
    setOpenId(null);
    setHover(null);
  };

  const resign = () => {
    // 기권하면 결과 팝업이 뜨고, 거기에 '기보 보기'가 있다. 예전에는 여기서
    // 머리말 알림으로 "복기 탭에서 볼 수 있습니다" 를 띄웠는데, 팝업·판 위
    // 배너까지 셋이 같은 말을 하게 됐다.
    setResigned(mySide);
  };

  /*
   * 대국을 끝내는 두 동작(새 대국·기권)은 창을 띄워 한 번 더 묻는다.
   *
   * 예전에는 창 대신 '새 대국' 버튼이 그 자리에서 "기보를 지우고 시작" 으로
   * 바뀌었다. 창이 흐름을 끊는다고 봤는데, 버튼 글자가 바뀌는 것은 눈에 덜
   * 띄어서 묻는 줄 모르고 지나쳤고, 기권은 아예 묻지 않았다.
   */
  const [asking, setAsking] = useState<"new" | "resign" | null>(null);

  useKeyboard(
    useMemo(
      () => ({
        prev: () => goTo(cursor - 1),
        next: () => goTo(cursor + 1),
        first: () => goTo(0),
        last: () => goTo(history.length - 1),
        flip,
      }),
      [cursor, goTo, history.length, flip]
    ),
    !reviewRunning && !listView && asking === null && !resultOpen
  );

  // --- 기보 파일 --------------------------------------------------------

  /** 연 판을 파일로 저장한다. 누가 어느 쪽을 어떤 급수로 잡았는지와 승부까지 담는다. */
  const saveRecord = () => {
    const g = openGame;
    if (!g) return;
    const make = (side: Side): RecordPlayer =>
      g.mySide === side
        ? { kind: "human", label: "나" }
        : { kind: "engine", level: g.levelId, label: g.levelName };
    const result: RecordResult =
      g.result.kind === "abandoned" ? "unfinished" : (g.result.winner ?? "draw");
    downloadRecord(
      buildRecord({
        startFen: g.history[0].fen,
        moves: g.history.slice(1).map((h) => ({
          move: h.move ?? "",
          notation: h.notation,
          score: h.score ?? undefined,
        })),
        variant: g.variant,
        players: { cho: make("cho"), han: make("han") },
        result,
      })
    );
  };

  /**
   * 파일로 저장해 둔 기보를 목록에 넣는다.
   *
   * 예전에는 불러온 기보가 두던 판을 덮어썼다. 이제는 목록에 한 판으로 들어가
   * 두던 판은 그대로다. 파일에는 누가 이겼는지만 있고 어떻게 끝났는지는 없어서
   * 결과는 '불러온 기보' 로 적는다.
   */
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
        const moverSide = pos.turn;
        pos = applyMove(pos, from, to);
        rebuilt.push({
          fen: toFen(pos),
          move: m.move,
          notation: m.notation || m.move,
          mover: moverSide,
          score: m.score ?? null,
        });
      }
      if (rebuilt.length < 2) throw new Error("수가 하나도 없는 기보입니다.");

      // 사람이 잡은 쪽을 '나' 로 본다. 둘 다 사람이면 초.
      const me: Side = record.players.han.kind === "human" &&
        record.players.cho.kind !== "human" ? "han" : "cho";
      const opponent = record.players[me === "cho" ? "han" : "cho"];
      const game: ArchivedGame = {
        id: newGameId(),
        // 목록 맨 위에 서야 불러온 것이 보인다. 파일의 저장 날짜로 두면 한참 아래에 묻힌다.
        endedAt: Date.now(),
        mySide: me,
        levelId: opponent.level ?? "",
        levelName: opponent.label,
        variant: record.variant,
        result:
          record.result === "unfinished"
            ? { kind: "abandoned", winner: null }
            : { kind: "record", winner: record.result === "draw" ? null : record.result },
        history: rebuilt,
        reviewed: null,
      };
      setGames((list) => upsertGame(list, game));
      // 불러온 판은 목록 맨 위(첫 쪽)에 선다. 다른 쪽을 보던 중이면 보이지 않는다.
      setListPage(0);
      setNotice(`기보를 불러왔습니다. ${record.moves.length}수.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  };

  // --- 복기 -------------------------------------------------------------

  /**
   * 연 판을 복기한다. 결과와 복기로 얻은 점수는 목록의 그 판에 남긴다 - 다시
   * 열 때 또 돌리지 않는다.
   */
  const startReview = async () => {
    const game = openGame;
    if (!engine || !game) return;
    const moves = game.history
      .slice(1)
      .map((h) => h.move)
      .filter((m): m is string => Boolean(m));
    if (moves.length === 0) return;

    cancelReview.current = false;
    setReviewError(null);
    setReviewProgress(null);
    setReviewRunning(true);

    try {
      // 탐색을 먼저 세운다. 엔진은 하나뿐이라 둘이 나눠 쓸 수 없다.
      await engine.stop();
      await engine.setOptions({ ...prefs, variant, multiPV: 1, skill: 20 });

      const result = await runReview({
        engine,
        startFen: game.history[0].fen,
        moves,
        nodes: reviewDepthById(reviewDepthId).nodes,
        // 그 판의 상대 급수에 맞춰 등급 눈높이를 낮춘다. 12급과 둔 판을 9단
        // 잣대로 재면 평범한 첫 수부터 '부정확' 이 붙는다.
        tolerance: gradeToleranceOf(levelById(game.levelId)),
        onProgress: setReviewProgress,
        shouldStop: () => cancelReview.current,
      });

      // 복기로 얻은 점수를 기보에 옮겨 적는다. 형세 그래프의 재료가 된다.
      const scored = [...game.history];
      if (result.length > 0) {
        if (scored[0]) scored[0] = { ...scored[0], score: result[0].scoreBefore };
        for (const r of result) {
          if (scored[r.index]) scored[r.index] = { ...scored[r.index], score: r.scoreAfter };
        }
      }
      setGames((list) =>
        list.map((g) => (g.id === game.id ? { ...g, history: scored, reviewed: result } : g))
      );
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
  // 복기한 판에서는 고른 수에 "이랬어야 했다" 를 그린다. 대국 중에는 그리지 않는다.
  const bestArrow = openGame ? bestArrowOf(currentReview) : null;

  const lastMove = useMemo(() => arrowOf(entry.move), [entry.move]);

  // --- 판 너비 재기 ------------------------------------------------------
  //
  // 판은 남은 높이에 맞춰 크기가 정해지므로 너비를 CSS 만으로는 알 수 없다.
  // 다 그려진 뒤에 재서 --board-w 로 넘기면, 폰에서 판 위아래에 붙는 대국자
  // 카드가 판과 정확히 같은 너비로 선다. (layout.css 의 .table 주석 참고)
  //
  // 헤더와 판·패널 덩어리를 가운데로 모으려면(layout.css 의 .top/.layout)
  // '판이 들어갈 수 있는 폭' 도 알아야 한다. 이건 --board-w 로 쓰면 안 된다.
  // 처음에 그렇게 짰더니 1440 에서 잰 659 가 덩어리 폭을 정하고, 덩어리 폭이
  // 다시 판 칸을 659 로 묶어서 1920 으로 창을 키워도 판이 커지지 못했다.
  // 판이 제 폭으로 제 칸을 정하는 고리다.
  //
  // 그래서 판 자리의 '높이' 에서 거꾸로 계산한다(--board-fit). 판 자리의
  // 높이는 세로로 쌓인 것만 보고 정해지므로 가로 폭에 기대지 않는다. 판은 그
  // 높이를 다 쓰고, 폭은 높이 × 판의 가로세로 비다. 둘 다 .app 에 걸어 헤더와
  // 판 칸이 같은 값을 본다.
  //
  // --board-fit 은 같은 창 크기 안에서는 줄이지 않는다. 판 위아래에 무언가
  // 끼어 판 자리가 낮아질 때마다 덩어리 폭을 따라 줄이면 헤더와 패널이 옆으로
  // 움직인다. 가장 컸던 값을 쥐고 있다가 창 크기가 바뀌면 그때 새로 잰다.
  //
  // 기보 목록에서는 판이 없다. 목록에서 판으로 돌아오면 판이 새로 붙으므로
  // 그때 다시 건다(listView 의존성).
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
      const drawn = svg.getBoundingClientRect();
      host.style.setProperty("--board-w", `${Math.ceil(drawn.width)}px`);
      // 대국 탭의 오른쪽 칸이 판 아래 끝에 맞춰 선다(layout.css 의 .side-col.play).
      host.style.setProperty("--board-h", `${Math.floor(drawn.height)}px`);
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
  }, [status, listView]);

  // --- 대국자 카드 ------------------------------------------------------

  // 판은 초를 아래에 놓고 그린다. 뒤집으면 위아래가 바뀐다.
  const bottomSide: Side = boardFlipped ? "han" : "cho";
  const topSide: Side = boardFlipped ? "cho" : "han";

  const scores = useMemo(() => scoreBoard(position), [position]);

  // 이 판을 어떤 상차림으로 시작했는지. 대국 탭이 고른 칸을 짚는 데 쓴다.
  // 지금 국면이 아니라 시작 국면을 본다 - 몇 수 두고 나면 마·상이 움직여서
  // 지금 판으로는 되읽을 수 없다.
  const startSetups = useMemo(() => {
    const board = parseFen(playHistory[0].fen).board;
    return { cho: detectSetup(board, "cho"), han: detectSetup(board, "han") };
  }, [playHistory]);

  const playerOf = useCallback(
    (side: Side) => {
      const me = openGame ? openGame.mySide : mySide;
      return {
        side,
        name: me === side ? "나" : openGame ? openGame.levelName : level.name,
        kind: (me === side ? "human" : "engine") as "human" | "engine",
        score: side === "cho" ? scores.cho : scores.han,
        // 이 진영이 '잡아낸' 기물 = 상대가 잃은 기물
        captured: capturedPieces(position, side === "cho" ? "han" : "cho") as PieceType[],
        active: !showOver && position.turn === side,
        thinking: engineTurn && position.turn === side,
        // 시계는 대국에서만 돈다. 기보 탭에서 남은 시간을 보여주면 아직
        // 대국 중인 것처럼 읽힌다.
        clock: mode === "play" && clockSettings.enabled ? clocks[side] : null,
        // 막대 길이를 재려면 '전체가 얼마였는지'가 있어야 한다.
        settings: mode === "play" && clockSettings.enabled ? clockSettings : null,
        // 장군·승패. 예전의 판 위 배너 대신 여기서 말한다(sideTag 주석).
        tag: sideTag(gstatus, shownOutcome, side),
        // 넓은 화면은 오른쪽 칸의 두 줄 카드, 폰은 판 위아래의 한 줄(PlayerBar 주석).
        layout: (narrow ? "row" : "stacked") as "row" | "stacked",
      };
    },
    [
      openGame, mySide, level.name, scores, position, showOver, engineTurn, mode,
      clockSettings, clocks, gstatus, shownOutcome, narrow,
    ]
  );

  /*
   * 헤더 오른쪽에 거는 판 상태. 판이 규칙에 맞지 않을 때만 뜬다.
   *
   * 예전에는 판 위 배너였다. 배너가 뜨면 판이 그만큼 줄어서, 높이가 늘 같은 헤더
   * 줄로 옮겼다. 말은 짧게(57px) 둔다 - 앱 이름·탭 옆에 남는 자리가 360 폰에서
   * 145px 이다(이름이 '장기 AI' 로 짧아진 뒤). 대국에서는 생길 일이 없고, 파일에서
   * 불러온 기보가 이상할 때를 위한 것이다. 무엇이 틀렸는지는 툴팁이 말한다.
   */
  const problems = gstatus.kind === "invalid" ? gstatus.problems : null;
  const headTag = problems && !listView ? "잘못된 판" : null;

  // 눈으로는 대국자 카드와 헤더가 말하는 것을 화면 읽기 프로그램에 한 줄로 알린다.
  const spoken = listView
    ? ""
    : shownOutcome
      ? outcomeMessage(shownOutcome)
      : (statusMessage(gstatus) ?? "");

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
        <h1>장기 AI</h1>
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
  const openTag = openGame ? resultTag(openGame) : null;

  /*
   * 알림. 예전에는 헤더 아래 한 줄을 차지해서, 뜰 때와 4초 뒤 사라질 때
   * 화면 전체가 두 번 아래위로 움직였다. 이제 자리를 차지하지 않고
   * 오른쪽 칸 아래에 떴다가 사라진다. 판은 가리지 않는다.
   */
  const toast = (
    <div className="toast" role="status">
      {notice}
    </div>
  );

  return (
    <div className="app">
      <header className="top">
        <h1>장기 AI</h1>
        {/*
          예전에는 여기에 "신경망 적용됨" 배지가 있었다. 만든 쪽에서나 뿌듯한
          말이지 두는 사람에게는 아무 뜻이 없고, 화면에서 제일 좋은 자리를
          차지하고 있었다. 신경망이 붙었는지는 useEngine 의 evalMode 로 여전히
          알 수 있다 — 필요하면 콘솔에서 본다.
        */}
        <ModeTabs mode={mode} onMode={goMode} />

        {/*
          예전에는 여기서 늘 "둘 차례: 초 楚 · 엔진이 생각 중…" 을 말했다.
          대국자 카드가 같은 말(둘 차례, 생각 중인 점)을 하고 있어서 한 화면에
          두 번 나왔고, 폰에서는 이 한 줄 때문에 헤더가 두 줄이 됐다.
          규칙에 맞지 않는 판만 여기서 말한다(headTag 주석).
        */}
        <div className="top-end">
          {headTag && (
            <span className="turn-tag" title={problems?.join(" ")}>
              {headTag}
            </span>
          )}
          {/* 착수음·초읽기 소리를 한 번에 켜고 끈다. 고른 값은 브라우저에 남는다. */}
          <button
            type="button"
            className="ghost icon"
            onClick={() => setSoundOn((on) => !on)}
            aria-label={soundOn ? "소리 끄기" : "소리 켜기"}
            title={soundOn ? "소리 끄기" : "소리 켜기"}
          >
            {soundOn ? (
              <Volume2 size={20} strokeWidth={2} aria-hidden />
            ) : (
              <VolumeX size={20} strokeWidth={2} aria-hidden />
            )}
          </button>
        </div>
        <p className="sr-only" role="status">
          {spoken}
        </p>
      </header>

      {listView ? (
        <main className="layout list">
          <GameList
            games={games}
            now={Date.now()}
            onOpen={openArchived}
            onLoad={loadRecord}
            page={listPage}
            onPage={setListPage}
          />
          {toast}
        </main>
      ) : (
        <main className="layout">
          <section className="board-col">
            <div className="table" ref={tableRef}>
              {/*
                판 위에는 아무것도 끼우지 않는다. 예전에는 장군·외통·기권·시간패
                배너를 여기 띄웠는데, 판 크기가 남은 높이로 정해지는 탓에 배너가
                뜰 때마다 판이 50px 남짓 줄었다 늘었다 했다.

                대국자 카드도 넓은 화면에서는 오른쪽 칸으로 갔다(PlayerBar 주석).
                판 위아래 두 장이 세로 92px 을 가져가고 있었다. 폰은 오른쪽 칸이
                판 아래로 내려가서 카드를 판 위아래에 그대로 둔다.
              */}
              {narrow && <PlayerBar {...playerOf(topSide)} />}

              <div className="board-stage">
                <Board
                  board={position.board}
                  flipped={boardFlipped}
                  selected={selected}
                  targets={targets}
                  lastMove={lastMove}
                  bestMove={bestArrow}
                  hoverMove={hoverArrow}
                  checkedKing={checkedKing}
                  onSquareClick={handleSquareClick}
                  onMove={handleMove}
                  onPick={handleSquareClick}
                  canPick={canPick}
                  // 대국 탭에서, 방금 둔 그 국면을 보고 있을 때만 난다.
                  flyMove={mode === "play" && fly && fly.ply === playCursor ? fly : null}
                  callout={mode === "play" ? callout : null}
                />
              </div>

              {narrow && <PlayerBar {...playerOf(bottomSide)} />}
            </div>
          </section>

          <section className={"side-col" + (mode === "play" ? " play" : "")}>
            {openGame && openTag && (
              <div className="game-back">
                <button
                  type="button"
                  className="ghost"
                  onClick={closeArchived}
                  disabled={reviewRunning}
                >
                  <ChevronLeft size={20} strokeWidth={2} aria-hidden />
                  목록
                </button>
                <span className="game-back-meta">
                  vs {openGame.levelName} · {whenLabel(openGame.endedAt)} ·{" "}
                  <b className={"game-result " + openTag.tone}>{openTag.text}</b>
                </span>
              </div>
            )}

            {/* 상대가 위, 내가 아래 - 판과 같은 순서로 포갠다. */}
            {!narrow && (
              <div className="players">
                <PlayerBar {...playerOf(topSide)} />
                <PlayerBar {...playerOf(bottomSide)} />
              </div>
            )}

            <BoardControls
              mode={mode}
              cursor={cursor}
              last={history.length - 1}
              canTouch={canTouchBoard}
              finished={mode === "play" && ended}
              onJump={goTo}
              onUndo={undoMove}
              onFlip={flip}
              onPass={passMove}
              passTitle={
                // 빅장이 걸린 쪽의 한수쉼은 빅장을 받는 수라 판이 끝난다. 모르고 누르지 않게.
                gstatus.kind === "facing"
                  ? pointsRule
                    ? "한수쉼을 두면 빅장을 받아 점수로 승부를 가립니다"
                    : "한수쉼을 두면 빅장을 받아 비깁니다"
                  : undefined
              }
            />

            {mode === "play" && (
              <PlayPanel
                mySide={mySide}
                levelId={levelId}
                started={started}
                ended={ended}
                status={gstatus}
                resigned={resigned}
                flagged={flagged}
                clockId={clockId}
                onClock={setClockId}
                variant={prefs.variant}
                onVariant={(v) => setPrefs((o) => ({ ...o, variant: v }))}
                thinking={thinking}
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
                onNewGame={() => setAsking("new")}
                onResign={() => setAsking("resign")}
              />
            )}

            {openGame && (
              <>
                <ReviewPanel
                  moveCount={openGame.history.length - 1}
                  levelName={openGame.levelName}
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
                <EvalGraph history={history} cursor={cursor} onJump={goTo} />
                <MoveList
                  history={history}
                  cursor={cursor}
                  reviewed={reviewed}
                  canSave
                  onJump={goTo}
                  onHoverMove={setHover}
                  onSave={saveRecord}
                />
              </>
            )}
          </section>

          {toast}
        </main>
      )}

      {/*
        결과 팝업. 대국에서만 뜬다 - 기보 탭에서 끝난 판을 열 때마다 창이
        뜨면 그게 곧 방해다.
      */}
      {mode === "play" && resultOpen && outcome && (
        <GameOverDialog
          outcome={outcome}
          mySide={mySide}
          onReview={() => {
            setResultOpen(false);
            openArchived(gameId);
          }}
          onClose={() => setResultOpen(false)}
        />
      )}

      {/*
        새 대국은 언제 눌러도 묻는다. 예전에는 두던 판이 있을 때만 물었는데,
        끝난 판·시작 전 판에서는 누르는 즉시 판이 바뀌고 알림만 떴다. 무엇이
        달라지는지 한 줄만 상황마다 다르게 적는다.
      */}
      {asking === "new" && (
        <ConfirmDialog
          title="새 대국을 시작할까요?"
          message={
            !started
              ? "판을 처음 모양으로 다시 놓습니다."
              : ended
                ? "끝난 판은 기보 목록에서 다시 볼 수 있습니다."
                : "두던 판은 기보 목록에 '중단'으로 남습니다."
          }
          confirmLabel="새 대국"
          onConfirm={() => {
            setAsking(null);
            newGame();
          }}
          onCancel={() => setAsking(null)}
        />
      )}
      {asking === "resign" && (
        <ConfirmDialog
          title="기권할까요?"
          message="이 판은 기권패로 끝납니다."
          confirmLabel="기권"
          danger
          onConfirm={() => {
            setAsking(null);
            resign();
          }}
          onCancel={() => setAsking(null)}
        />
      )}
    </div>
  );
}
