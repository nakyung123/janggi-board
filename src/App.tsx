// 장기 AI — 화면 조립과 대국 흐름
//
// 판은 둘이다. 대국 탭의 두던 판(play*)과, 기보 탭에서 목록에서 골라 연 지난 판
// (openGame). 아래의 history·cursor 는 '지금 화면에 떠 있는 판' 이라 탭에 따라 둘
// 중 하나를 가리킨다. 두던 판은 대국 탭만 만지고, 기보 탭은 연 판을 읽기만 한다.
//
// 여기서 하는 일
//   · 두던 판 — 수 두기, 엔진 차례, 무르기, 새 대국·기권, 끝난 판을 기보 목록에 넣기
//   · 기보 탭 — 판 열기, 복기, 파일로 저장·불러오기
//   · 화면 — 헤더 / 판 칸(판, 폰에서는 위아래 대국자 카드) / 오른쪽 칸(대국자 카드,
//     판 조작 줄, 대국 패널 또는 복기·형세·기보)
//
// 규칙 판정은 엔진에 묻고(janggi/status.ts), 시계·복기·기보 목록 저장·판 크기 재기는
// hooks/ 에 있다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";

import { Board } from "./components/board/Board";
import { BoardControls } from "./components/board/BoardControls";
import { PlayerCard } from "./components/board/PlayerCard";
import { ConfirmDialog } from "./components/common/ConfirmDialog";
import { APP_VERSION } from "./updates/log";
import { EvalGraph } from "./components/games/EvalGraph";
import { GameList } from "./components/games/GameList";
import { ReviewPanel } from "./components/games/ReviewPanel";
import { AppHeader } from "./components/layout/AppHeader";
import { BootScreen } from "./components/layout/BootScreen";
import { UpdatesDialog } from "./components/layout/UpdatesDialog";
import type { Mode } from "./components/layout/ModeTabs";
import { GameOverDialog } from "./components/play/GameOverDialog";
import { PlayPanel } from "./components/play/PlayPanel";

import { playMoveSound, playPickSound } from "./audio/sound";
import {
  DEFAULT_LEVEL_ID,
  DEFAULT_REVIEW_DEPTH_ID,
  ENGINE_MOVE_CAP_MS,
  LEVELS,
  MIN_THINK_MS,
  REVIEW_DEPTHS,
  levelById,
  limitsOf,
  reviewDepthById,
  reviewPlan,
} from "./engine/levels";
import type { EngineOptions, PositionRef, SearchLimits, Variant } from "./engine/types";
import { forgetIfMoved, isEnginePrefs, isVariant, positionKey } from "./engine/types";
import { useAnalysis, useEngine } from "./engine/useEngine";
import { useArchive } from "./hooks/useArchive";
import { useBoardFit } from "./hooks/useBoardFit";
import { useClockTicking, useGameClock } from "./hooks/useGameClock";
import { useKeyboard } from "./hooks/useKeyboard";
import { useNarrow } from "./hooks/useNarrow";
import { readStored, usePersisted, writeStored } from "./hooks/usePersisted";
import { useReview } from "./hooks/useReview";

import { newGameId, resultTag, upsertGame, whenLabel } from "./janggi/archive";
import type { ArchivedGame, ArchivedResult } from "./janggi/archive";
import type { Position, Square } from "./janggi/board";
import { START_FEN, parseFen, toFen, undoTarget } from "./janggi/board";
import { CLOCK_PRESETS, DEFAULT_CLOCK_ID, clockPresetById, moveBudgetMs } from "./janggi/clock";
import type { HistoryEntry } from "./janggi/history";
import { hangulHistory, movesOf, nextEntry, startHistory } from "./janggi/history";
import { arrowOf, splitMove } from "./janggi/notation";
import type { PieceChar, PieceType, Side } from "./janggi/pieces";
import { sideOf } from "./janggi/pieces";
import { downloadRecord, gameOfRecord, readRecordFile, recordOfGame } from "./janggi/record";
import { bestArrowOf } from "./janggi/review";
import type { SavedGame } from "./janggi/savedGame";
import { isSavedGame } from "./janggi/savedGame";
import { applySetup, detectSetup } from "./janggi/setups";
import type { Setup } from "./janggi/setups";
import {
  capturedPieces,
  gameStatus,
  outcomeMessage,
  outcomeOf,
  scoreBoard,
  sideTag,
  statusMessage,
  trailingPasses,
} from "./janggi/status";
import type { Outcome } from "./janggi/status";

export default function App() {
  const { engine, status, progress, error } = useEngine();
  const [mode, setMode] = useState<Mode>("play");
  const narrow = useNarrow();

  // --- 두던 판 (대국 탭) --------------------------------------------------

  /** 새로고침 전에 두던 판. 한 수 이상 둔 판만 되살린다. */
  const savedGame = useMemo(() => {
    const g = readStored<SavedGame | null>("game", null, isSavedGame);
    // 예전 판은 기보 표기가 한자다(73卒63). 이 판이 끝나 목록에 들 때 한글 표기와 섞이지 않게.
    return g && g.history.length > 1 ? { ...g, history: hangulHistory(g.history) } : null;
  }, []);

  const [playHistory, setPlayHistory] = useState<HistoryEntry[]>(
    savedGame ? savedGame.history : startHistory(START_FEN)
  );
  const [playCursor, setPlayCursor] = useState(savedGame ? savedGame.cursor : 0);
  /** 이 판의 이름표. 끝난 판을 목록에 넣을 때 같은 판이면 한 줄로 바뀐다(upsertGame). */
  const [gameId, setGameId] = useState(() => savedGame?.id ?? newGameId());
  /** 기권한 쪽 */
  const [resigned, setResigned] = useState<Side | null>(savedGame ? savedGame.resigned : null);
  const [flipped, setFlipped] = usePersisted("flipped", false, (v) => typeof v === "boolean");
  /** 집어 든 기물의 자리 */
  const [selected, setSelected] = useState<Square | null>(null);
  /**
   * 화면 읽기 프로그램에 한 번 말하고 마는 알림. 4초 뒤 비운다. 화면에는 띄우지 않는다 -
   * 보이는 알림은 누른 자리에 있다(넣은 판의 카드, 목록 제목 아래 한 줄).
   * 떠 있는 알림은 오른쪽 칸의 무언가(복기 설명, 쪽 번호)를 가렸다.
   */
  const [notice, setNotice] = useState<string | null>(null);

  // --- 대국 설정 (브라우저에 남는다) ----------------------------------------
  // 남겨 둔 값이 지금 목록에 없으면(옛 급수·옛 시계 등) usePersisted 가 기본값으로 돌린다.

  const [mySide, setMySide] = usePersisted<Side>("mySide", "cho", (v) => v === "cho" || v === "han");
  const [levelId, setLevelId] = usePersisted(
    "levelId",
    DEFAULT_LEVEL_ID,
    (v) => typeof v === "string" && LEVELS.some((l) => l.id === v)
  );
  const [clockId, setClockId] = usePersisted(
    "clockId",
    DEFAULT_CLOCK_ID,
    (v) => typeof v === "string" && CLOCK_PRESETS.some((c) => c.id === v)
  );
  /** 엔진 설정. 화면에서 고르는 것은 규칙(variant)뿐이고 스레드·해시는 처음 값 그대로다. */
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
  const level = levelById(levelId);
  /*
   * 목록 속 객체 그대로다(렌더마다 같은 참조). 엔진이 쓸 시간과 시계가 이 값을 의존성으로
   * 쥐고 있어서, 새 객체가 되면 탐색이 계속 다시 시작돼 엔진이 한 수도 못 둔다.
   */
  const clockSettings = clockPresetById(clockId);
  const clock = useGameClock(clockSettings, savedGame ? savedGame.flagged : null);
  const { clocks, flagged, clocksRef, commit: commitClock, reset: resetClocks } = clock;

  // --- 기보 탭 ----------------------------------------------------------

  const [games, setGames] = useArchive();
  /** 기보 탭에서 연 판의 id. null 이면 목록을 보여준다. */
  const [openId, setOpenId] = useState<string | null>(null);
  /** 목록에서 보던 쪽. 한 판을 열었다가 '목록' 으로 돌아오면 이 쪽으로 온다. */
  const [listPage, setListPage] = useState(0);
  /** 파일을 못 읽은 까닭. 목록 제목 아래에 남고, 다음에 무언가를 누르면 지운다. */
  const [listError, setListError] = useState<string | null>(null);
  /** 방금 목록에 넣은 판. 그 카드가 잠깐 도드라진다. */
  const [freshId, setFreshId] = useState<string | null>(null);
  const [viewCursor, setViewCursor] = useState(0);
  /** 연 판은 그 판에서 내가 잡은 쪽이 아래로 오게 따로 뒤집는다. 대국 탭의 뒤집기는 그대로다. */
  const [viewFlipped, setViewFlipped] = useState(false);
  const openGame =
    mode === "games" && openId ? (games.find((g) => g.id === openId) ?? null) : null;
  const listView = mode === "games" && !openGame;

  const [reviewDepthId, setReviewDepthId] = usePersisted(
    "reviewDepthId",
    DEFAULT_REVIEW_DEPTH_ID,
    (v) => typeof v === "string" && REVIEW_DEPTHS.some((d) => d.id === v)
  );
  const review = useReview(engine);

  // --- 지금 화면에 떠 있는 판 ---------------------------------------------

  /*
   * 복기가 도는 동안의 중간 결과. 지금 연 판의 것일 때만 쓴다.
   * 다 끝나기를 기다리지 않고 설명과 형세를 띄우려는 것이다 - 1차가 끝나면(기보 전체를
   * 가볍게 훑는 데 몇 초) 모든 수에 설명이 붙고, 2차가 고른 수를 갈아 끼운다.
   */
  const partial =
    review.partial && openGame && review.partial.gameId === openGame.id
      ? review.partial
      : null;

  const history = openGame ? (partial?.history ?? openGame.history) : playHistory;
  const cursor = openGame ? Math.min(viewCursor, openGame.history.length - 1) : playCursor;
  const setCursor = openGame ? setViewCursor : setPlayCursor;
  const reviewed = openGame?.reviewed ?? partial?.reviewed ?? null;
  const boardFlipped = openGame ? viewFlipped : flipped;

  const entry = history[cursor];
  const position = useMemo(() => parseFen(entry.fen), [entry.fen]);
  /** 대국 탭의 판에 한 수라도 뒀는지. 시계·규칙 잠금·새 대국 확인이 본다. */
  const started = playHistory.length > 1;
  /** 연 판은 그 판을 둔 규칙으로 판정한다. 빅장·수 반복이 규칙마다 다르다. */
  const variant: Variant =
    openGame && isVariant(openGame.variant) ? openGame.variant : prefs.variant;

  /**
   * 엔진에 넘길 국면. FEN 만이 아니라 수순까지 준다 - 장군반복 금지·빅장은 '어떻게
   * 여기까지 왔는가' 를 봐야 판정된다.
   */
  const positionRef: PositionRef = useMemo(
    () => ({ startFen: history[0].fen, moves: movesOf(history.slice(0, cursor + 1)) }),
    [history, cursor]
  );

  // --- 엔진 차례 --------------------------------------------------------

  const engineSide: Side | null = mode === "play" ? (mySide === "cho" ? "han" : "cho") : null;
  /** 기보 끝을 보고 있는지. 무르거나 되짚는 중에는 엔진이 두지 않는다(기보를 잘라먹지 않게). */
  const atTip = cursor === history.length - 1;
  const engineTurn = mode === "play" && atTip && engineSide === position.turn;

  /**
   * 엔진이 이번 수에 쓸 시간(ms). 0 이면 시계를 쓰지 않는다.
   * 차례가 바뀔 때 한 번만 정하고 그 수를 두는 동안은 붙잡아 둔다 - 200ms 마다 줄어드는
   * 시계를 탐색 한계에 그대로 물리면 한계가 계속 바뀌어 탐색이 처음부터 다시 시작된다.
   */
  const [moveBudget, setMoveBudget] = useState(0);
  useEffect(() => {
    if (!clockSettings.enabled || !engineTurn) {
      setMoveBudget(0);
      return;
    }
    setMoveBudget(Math.round(moveBudgetMs(clocksRef.current[position.turn], clockSettings)));
  }, [engineTurn, position.turn, entry.fen, clockSettings, clocksRef]);

  /**
   * 엔진의 탐색량. 급수대로 노드를 걸고 시간 한계도 함께 건다. 엔진은 둘 중 먼저 닿는
   * 쪽에서 멈춘다. 시계를 껐어도 상한(ENGINE_MOVE_CAP_MS)은 둔다 - 높은 급수는 노드가
   * 수백만이라 상한이 없으면 한 수에 분 단위로 기다린다.
   */
  const searchLimits: SearchLimits = useMemo(
    () => ({ ...limitsOf(level), movetimeMs: moveBudget > 0 ? moveBudget : ENGINE_MOVE_CAP_MS }),
    [level, moveBudget]
  );

  const options: EngineOptions = useMemo(
    () => ({
      ...prefs,
      variant,
      // 엔진은 제 수 하나만 고른다. 후보를 넓게 보면 느려질 뿐이다.
      multiPV: 1,
      // 제 차례가 아니면 합법수·장군만 물으므로 실력은 상관없다.
      skill: engineTurn ? level.skill : 20,
    }),
    [prefs, variant, engineTurn, level.skill]
  );

  /** 탐색을 다시 걸어야 하는지 가리는 열쇠. 이 값이 바뀔 때만 useAnalysis 가 새로 묻는다. */
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

  // 복기가 도는 동안에는 엔진을 복기에 내준다. 엔진은 하나라 둘이 나눠 쓸 수 없다.
  useEffect(() => {
    if (engine && !review.running) void engine.setOptions(options);
  }, [engine, options, review.running]);

  /*
   * 국면마다 엔진에 합법수·장군을 묻고(probed 가 되면 답이 온 것), 엔진 차례면 둘 수를
   * 찾는다(snapshot.bestmove).
   */
  const { snapshot, legal, checkers, probed } = useAnalysis(
    engine,
    positionRef,
    !review.running && engineTurn,
    searchLimits,
    optionsKey
  );

  // --- 판정 ------------------------------------------------------------

  /** 점수제(200수·빅장·양쪽 한수쉼을 점수로 가림)가 있는지. 전통 규칙은 없고 비긴다. */
  const pointsRule = variant !== "janggitraditional";
  /** 빅장 규칙이 있는지. 현대(카카오) 규칙에서는 두 궁이 마주 봐도 아무 일이 없다. */
  const bikjangRule = variant !== "janggimodern";
  const passesInRow = useMemo(() => trailingPasses(positionRef.moves), [positionRef]);
  const gstatus = useMemo(
    () =>
      gameStatus({
        position,
        legal,
        checkers,
        ready: probed,
        // 지금 보고 있는 국면까지 둔 수. history[0] 이 시작 국면이다.
        plies: cursor,
        pointsRule,
        bikjangRule,
        passesInRow,
      }),
    [position, legal, checkers, probed, cursor, pointsRule, bikjangRule, passesInRow]
  );

  /**
   * 대국 탭의 판이 지금 보고 있는 국면에서 끝났는지, 끝났다면 어떻게(outcomeOf).
   * 기보 탭에서는 null 이다 - 그때 gstatus 는 연 판의 것이고 기권·시간패는 두던 판의
   * 것이라 섞으면 안 된다.
   */
  const outcome = useMemo(
    () => (mode === "play" ? outcomeOf(gstatus, resigned, flagged) : null),
    [mode, gstatus, resigned, flagged]
  );
  const over = outcome !== null;

  /**
   * 기보 탭에서 연 판의 결과. 마지막 수에 가 있을 때만 적는다 - 중간 국면에 "기권패" 가
   * 붙어 있으면 그 국면에서 기권한 것처럼 읽힌다. 중단한 판은 적을 결과가 없다.
   */
  const viewOutcome: Outcome | null = useMemo(() => {
    if (!openGame || !atTip) return null;
    const { kind, winner } = openGame.result;
    if (kind === "abandoned") return null;
    return { kind, winner };
  }, [openGame, atTip]);

  /** 대국자 카드와 화면 읽기에 알릴 결과. 있으면 두 카드를 다 눌러 둔다(둘 차례가 없다). */
  const shownOutcome = mode === "play" ? outcome : viewOutcome;
  const showOver = shownOutcome !== null;

  // 수를 둘 때마다 두던 판을 남긴다(savedGame.ts). 시계는 넣지 않는다.
  useEffect(() => {
    writeStored("game", {
      id: gameId,
      history: playHistory,
      cursor: playCursor,
      resigned,
      flagged,
    } satisfies SavedGame);
  }, [gameId, playHistory, playCursor, resigned, flagged]);

  // 판이 끝나면 집어 든 기물을 놓는다. 선택 링과 갈 곳 점이 남아 있으면 아직 둘 수 있는 것처럼 보인다.
  useEffect(() => {
    if (showOver) setSelected(null);
  }, [showOver]);

  // --- 끝난 판을 기보 목록에 ----------------------------------------------

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
   * '방금 끝났는지' 는 목록이 답한다. 같은 결과로 이미 들어 있으면 본 판이라 창을
   * 띄우지 않는다 - 새로고침하거나 탭을 오갈 때마다 아는 결과가 다시 뜨지 않게.
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
  }, [outcome, games, gameId, playHistory, archiveOf, setGames]);

  /**
   * 대국 탭의 판이 끝났는지 - 지금 보는 국면이 아니라 판 전체로. 판·무르기·설정 잠금과
   * 새 대국의 '중단' 기록·확인 문구가 본다.
   *
   * over 는 보고 있는 국면의 판정이라, 외통으로 끝난 판을 '이전' 으로 되짚으면 false 가
   * 된다. 그래서 끝나는 순간 목록에 들어간 결과가 있고 수순이 그대로면 끝난 판으로 친다.
   * 끝난 판은 잠겨서 수순이 바뀌지 않으므로 새 대국을 누를 때까지 끝난 판으로 남는다.
   */
  const archivedSelf = games.find((g) => g.id === gameId);
  const ended =
    over ||
    (archivedSelf !== undefined &&
      archivedSelf.result.kind !== "abandoned" &&
      archivedSelf.history.length === playHistory.length);

  // --- 수 두기 ----------------------------------------------------------

  /** 둘 차례인 쪽. 시계가 이 쪽의 시간을 깎는다. */
  const mover = position.turn;

  /**
   * 방금 둔 수가 날아가는 모양(Board 의 flyMove). ply 는 그 수로 생긴 국면 번호라,
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

  /** 방금 수를 둬서 생긴 국면 번호. 장군·빅장을 그 순간에만 외치려고 기억한다. */
  const justMoved = useRef<number | null>(null);

  /**
   * 한 수를 둔다. 사람의 수도 엔진의 수도 여기를 지난다. from === to 는 한수쉼.
   * animate 가 false 면 날리지 않는다(끌어서 둔 수는 이미 손으로 옮겼다).
   * 되짚던 자리에서 두면 그 뒤의 수는 버리고 새로 잇는다.
   */
  const pushMove = useCallback(
    (from: Square, to: Square, animate = true) => {
      // 소리는 판을 고치기 전에 낸다 - 잡는 수인지 지금 판에서 본다.
      playMoveSound(from !== to && position.board[to] ? "capture" : "move");
      setFly(
        animate && from !== to
          ? { from, to, captured: position.board[to], ply: playCursor + 1, key: Date.now() }
          : null
      );
      justMoved.current = playCursor + 1;
      setPlayHistory((prev) => {
        const base = prev.slice(0, playCursor + 1);
        return [...base, nextEntry(base[base.length - 1].fen, from, to)];
      });
      setPlayCursor((c) => c + 1);
      setSelected(null);
      commitClock(mover);
    },
    [playCursor, mover, position.board, commitClock]
  );

  // --- 장군·멍군·빅장 외치기 ------------------------------------------------

  /**
   * 국면 번호마다 장군이 걸려 있었는지. 멍군을 가리려면 바로 앞 국면이 장군이었는지
   * 알아야 한다. 대국 탭에서는 다음 수를 두기 전에 반드시 엔진 답(probed)을 받으므로
   * (합법수가 있어야 둔다) 앞 국면의 값은 늘 채워져 있다.
   */
  const checkAt = useRef(new Map<number, boolean>());
  const [callout, setCallout] = useState<{ text: string; key: number } | null>(null);

  /*
   * 방금 둔 수로 장군이나 빅장이 걸렸으면 판 가운데에 외친다(CheckCallout).
   *
   * 장군을 받은 쪽이 피하면서 되받아 장군을 부르면 멍군이다 - 앞 국면도 이번 국면도
   * 장군. 외통은 외치지 않는다(결과 창이 바로 뜬다). 되짚거나 무르다가 장군 국면에
   * 와도 외치지 않는다. 빅장은 받은 쪽이 모르고 한수쉼을 두면 판이 끝나서 외친다.
   */
  useEffect(() => {
    if (mode !== "play" || !probed) return;
    checkAt.current.set(playCursor, checkers.length > 0);
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

  /**
   * 시계가 도는지. 첫 수가 놓여야 돈다(급수·상차림을 고르는 동안 깎이지 않게). 되짚는
   * 중(기보 끝이 아님)·끝난 뒤·기보 탭에 가 있는 동안에는 선다.
   */
  const clockRunning = clockSettings.enabled && mode === "play" && started && atTip && !over;
  // 초읽기 소리는 내 차례에만 - 엔진은 시간에 쫓기지 않고, 소리는 사람에게 하는 말이다.
  useClockTicking(clock, clockRunning, mover, !engineTurn && mover === mySide ? mySide : null);

  // --- 엔진이 두기 --------------------------------------------------------

  /** 엔진이 이미 둔 국면의 열쇠. 같은 국면에서 두 번 두지 않게(forgetIfMoved 주석). */
  const playedFor = useRef<string | null>(null);
  useEffect(() => {
    const key = positionKey(positionRef);
    // 국면을 벗어났으면 기억을 버린다. 안 버리면 무르고 같은 수를 다시 뒀을 때 엔진이 영영 두지 않는다.
    playedFor.current = forgetIfMoved(playedFor.current, key);

    if (!engineTurn || over) return;
    if (!snapshot || snapshot.running || !snapshot.bestmove) return;
    if (playedFor.current === key) return;
    const { from, to } = splitMove(snapshot.bestmove);
    if (!from || !to) return;

    // 약한 급수는 2천 노드만 보고 끝나 눈 깜짝할 새에 둔다. 최소한의 뜸(MIN_THINK_MS)을 들인다.
    const timer = window.setTimeout(() => {
      playedFor.current = key;
      pushMove(from, to);
    }, MIN_THINK_MS);
    return () => window.clearTimeout(timer);
  }, [engineTurn, snapshot, positionRef, pushMove, over]);

  // --- 기보 오가기 --------------------------------------------------------

  /*
   * 기보를 오간다. 한 칸만 움직일 때는 기물이 날아간다.
   *
   * 예전에는 되짚어 볼 때 기물이 순간이동했다. 한 수씩 짚어 보는 것이 복기의 전부인데,
   * 무엇이 어디서 어디로 갔는지를 눈이 따라가지 못해 매번 두 판을 머릿속에서 비교해야
   * 했다. 날려 주면 그 일을 눈이 한다.
   *
   * 두 칸 이상(처음·끝·무르기·슬라이더로 멀리)은 날리지 않는다. 지나친 수를 다 건너뛰는
   * 것이라 날릴 '한 수' 가 없고, 한 수만 날리면 나머지가 순간이동한 것처럼 보여 오히려
   * 거짓말이 된다.
   */
  const goTo = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(history.length - 1, i));
      if (next === cursor) return;
      setSelected(null);

      // 앞으로 한 칸이면 그 수를, 뒤로 한 칸이면 그 수를 거꾸로 날린다.
      const step = next === cursor + 1 ? history[next].move : null;
      const back = next === cursor - 1 ? history[cursor].move : null;
      const mv = step ?? back;
      const { from, to } = mv ? splitMove(mv) : { from: "", to: "" };
      setFly(
        from && to && from !== to
          ? {
              from: (step ? from : to) as Square,
              to: (step ? to : from) as Square,
              // 앞으로 갈 때 잡힌 기물은 날아오는 동안 제자리에 남는다.
              captured: step ? parseFen(history[cursor].fen).board[to] : undefined,
              ply: next,
              key: Date.now(),
            }
          : null
      );
      setCursor(next);
    },
    [cursor, history, setCursor]
  );

  /**
   * 대국의 무르기. 내 차례가 나올 때까지(보통 내 수 + 엔진 응수 두 칸) 되감는다.
   * 한 칸만 되감으면 엔진 차례에 멈추는데, 기보 끝이 아니라 엔진이 두지 않아서 판이
   * 조용히 멈춘 것처럼 보인다. 기보 탭과 끝난 판의 '이전' 은 한 칸씩(goTo)이다.
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

  // --- 판 만지기 ----------------------------------------------------------

  /** 기물 자리 → 그 기물이 갈 수 있는 자리들. 엔진이 알려 준 합법수에서 만든다. */
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
   * 판을 만질 수 있는지. 대국 탭에서 내 차례에만, 판이 끝나기 전까지. 기보 탭은 읽기만 한다.
   * over 가 아니라 ended 를 본다 - 끝난 판을 앞 국면으로 되짚어도 잠겨 있어야 한다.
   */
  const canTouchBoard = mode === "play" && !ended && !engineTurn;

  /** 집어 들 수 있는 기물. 둘 차례인 쪽의 기물이고 갈 곳이 있어야 한다. */
  const canPick = (square: Square) => {
    const piece = position.board[square];
    return (
      canTouchBoard &&
      piece !== undefined &&
      sideOf(piece) === position.turn &&
      legalFrom.has(square)
    );
  };

  /** 눌러서 두기: 기물을 집고, 갈 곳을 누르면 둔다. 집은 기물을 다시 누르면 놓는다. */
  const handleSquareClick = (square: Square) => {
    if (!canTouchBoard) return;
    if (selected && targets.includes(square)) {
      pushMove(selected, square);
      return;
    }
    if (canPick(square)) {
      const picking = selected !== square;
      setSelected(picking ? square : null);
      // 집을 때도 소리를 낸다. 알을 판에서 살짝 드는 소리라 착수음보다 얕다.
      if (picking) playPickSound();
    } else {
      setSelected(null);
    }
  };

  /** 끌어서 두기. 기물은 손을 따라 이미 도착했으므로 날리지 않는다. */
  const handleMove = (from: Square, to: Square) => {
    if (!canTouchBoard) return;
    if (legalFrom.get(from)?.includes(to)) pushMove(from, to, false);
    else setSelected(null);
  };

  /**
   * 한수쉼 - 궁을 제자리에 둔다. 엔진이 한수쉼을 합법수로 알려 준 때만 된다. 합법수를
   * 받기 전(수를 둔 직후)이나 장군을 받고 있을 때는 없어서, 그동안은 버튼도 잠근다.
   * 잠그지 않으면 눌러도 아무 일이 없다.
   */
  const passSquare = useMemo(() => {
    const king = Object.entries(position.board).find(
      ([, p]) => p.toLowerCase() === "k" && sideOf(p) === position.turn
    );
    return king && legal.has(king[0] + king[0]) ? king[0] : null;
  }, [position, legal]);
  const passMove = () => {
    if (passSquare) pushMove(passSquare, passSquare);
  };

  // --- 판 새로 놓기 -------------------------------------------------------

  /** 날던 수·외친 말·장군 기억을 버린다. 판을 새로 놓으면 국면 번호가 다시 0부터다. */
  const forgetMoves = () => {
    setFly(null);
    setCallout(null);
    justMoved.current = null;
    checkAt.current.clear();
  };

  /** 상차림을 바꾸면 그 판을 새 시작 국면으로 삼는다. 첫 수를 두기 전에만 된다. */
  const startFrom = (next: Position) => {
    setPlayHistory(startHistory(toFen(next)));
    setPlayCursor(0);
    setSelected(null);
    setResigned(null);
    resetClocks();
    forgetMoves();
  };

  /**
   * 새 대국. 시작 국면(상차림 포함)은 그대로 두고 수만 지운다.
   *
   * 두던 판은 남기지 않는다. 한동안 '중단' 으로 목록에 넣었는데(끝난 판은 끝날 때 이미
   * 들어간다), 목록이 '기보' 인 이상 거기 선 것은 다 둔 판으로 읽힌다. 몇 수 두다 만
   * 판이 섞여 서면 끝난 판을 골라내기가 오히려 어렵다. 없어지는 것은 새 대국을 묻는
   * 창이 미리 말한다. 파일에서 불러온 끝나지 않은 기보는 그대로 '중단' 으로 든다 -
   * 그건 사람이 일부러 가져온 것이다.
   */
  const newGame = () => {
    const base = parseFen(playHistory[0].fen);
    setPlayHistory(startHistory(toFen({ ...base, turn: "cho", halfmove: 0, fullmove: 1 })));
    setPlayCursor(0);
    setGameId(newGameId());
    setSelected(null);
    setResigned(null);
    resetClocks();
    forgetMoves();
    playedFor.current = null;
  };

  const resign = () => setResigned(mySide);

  /** 판을 끝내는 두 동작(새 대국·기권)은 확인 창으로 한 번 더 묻는다. */
  const [asking, setAsking] = useState<"new" | "resign" | null>(null);

  /** 헤더의 '업데이트 내역' 으로 여는 창. 두던 판은 그대로 있다. */
  const [updatesOpen, setUpdatesOpen] = useState(false);

  // --- 탭 오가기 ----------------------------------------------------------

  /**
   * 탭을 옮긴다. 기보 탭은 늘 목록의 첫 쪽(가장 최근 판)에서 시작한다. 복기가 도는
   * 동안에는 엔진을 복기가 쥐고 있으므로 옮기지 않는다.
   */
  const goMode = useCallback(
    (next: Mode) => {
      if (review.running) return;
      setMode(next);
      setOpenId(null);
      setListPage(0);
      setListError(null);
      setSelected(null);
      // 탭을 옮기면 판이 통째로 바뀐다. 남아 있던 '날아가는 수' 가 새 판에서 같은 국면
      // 번호를 만나 엉뚱하게 날지 않도록 지운다.
      setFly(null);
    },
    [review.running]
  );

  /** 기보 탭에서 한 판을 연다. 끝난 모양부터 보이도록 마지막 수에 선다. */
  const openArchived = (id: string) => {
    const game = games.find((g) => g.id === id);
    if (!game || review.running) return;
    setMode("games");
    setOpenId(game.id);
    setViewCursor(game.history.length - 1);
    setViewFlipped(game.mySide === "han");
    setListError(null);
    setSelected(null);
    setFly(null);
    review.clearError();
  };

  const closeArchived = () => {
    if (review.running) return;
    setOpenId(null);
  };

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
    // 창이 떠 있거나 목록 화면·복기 중에는 키를 가로채지 않는다.
    !review.running && !listView && asking === null && !resultOpen
  );

  // --- 기보 파일 --------------------------------------------------------

  /** 연 판을 파일로 내려받는다. */
  const saveRecord = () => {
    if (openGame) downloadRecord(recordOfGame(openGame));
  };

  /**
   * 파일로 들어온 판의 수가 모두 규칙에 맞는지 엔진에 묻는다. 틀린 수가
   * 있으면 그 수를 들어 Error 를 던진다.
   *
   * 규칙에 맞지 않는 수가 하나라도 있으면 목록에 넣지 않는다. 화면은 그 수를 둔 판을
   * 그리는데 엔진은 그 수를 받지 않고 앞 국면에 머물러서, 장군·복기가 화면과 다른 판을
   * 두고 말한다. 판을 열 때와 같은 규칙으로 가린다(위의 variant 와 같은 식).
   */
  const checkMoves = async (game: ArchivedGame) => {
    if (!engine) throw new Error("엔진이 아직 준비되지 않았습니다.");
    const bad = await engine.firstIllegalMove(
      isVariant(game.variant) ? game.variant : prefs.variant,
      game.history[0].fen,
      movesOf(game.history)
    );
    if (bad !== null) {
      throw new Error(`${bad + 1}번째 수(${game.history[bad + 1].notation})가 규칙에 맞지 않습니다.`);
    }
  };

  /**
   * 파일로 저장해 둔 기보를 목록 맨 위(첫 쪽)에 한 판으로 넣는다. 두던 판은 그대로다.
   * 넣은 판의 카드가 잠깐 도드라지고(freshId), 못 넣으면 목록 제목 아래에 까닭이 남는다.
   */
  const loadRecord = async (file: File) => {
    setListError(null);
    try {
      const game = gameOfRecord(await readRecordFile(file));
      await checkMoves(game);
      setGames((list) => upsertGame(list, game));
      setListPage(0);
      setFreshId(game.id);
      setNotice(`기보를 불러왔습니다. ${game.history.length - 1}수.`);
    } catch (err) {
      setListError(`기보를 불러오지 못했습니다. ${messageOf(err)}`);
    }
  };

  // 방금 넣은 판의 카드는 3초 동안 도드라진다(GameList).
  useEffect(() => {
    if (!freshId) return;
    const t = window.setTimeout(() => setFreshId(null), 3000);
    return () => window.clearTimeout(t);
  }, [freshId]);

  // --- 복기 -------------------------------------------------------------

  /**
   * 연 판을 복기하고, 얻은 평가치·등급을 목록의 그 판에 남긴다(다시 열 때 또 돌리지 않게).
   * 중간에 멈춘 복기는 남기지 않는다 - 그 판은 복기 전(또는 지난 복기) 그대로다.
   */
  const startReview = async () => {
    const game = openGame;
    if (!game) return;
    const run = await review.start(
      game,
      { ...prefs, variant, multiPV: 1, skill: 20 },
      reviewPlan(reviewDepthById(reviewDepthId), game.history.length - 1)
    );
    if (!run?.complete) return;
    setGames((list) =>
      list.map((g) => (g.id === game.id ? { ...g, history: run.history, reviewed: run.reviewed } : g))
    );
    setNotice("복기가 끝났습니다.");
  };

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  // --- 판 위 표시 ---------------------------------------------------------

  const currentReview = useMemo(
    () => reviewed?.find((r) => r.index === cursor) ?? null,
    [reviewed, cursor]
  );
  /** 복기한 판에서, 고른 수 대신 뒀어야 할 수 */
  const bestArrow = openGame ? bestArrowOf(currentReview) : null;
  const lastMove = useMemo(() => arrowOf(entry.move), [entry.move]);

  /** 장군을 맞은 궁의 자리. 판에서 붉게 테를 두른다. */
  const checkedKing = useMemo(() => {
    if (checkers.length === 0) return null;
    return (
      Object.entries(position.board).find(
        ([, p]) => p.toLowerCase() === "k" && sideOf(p) === position.turn
      )?.[0] ?? null
    );
  }, [checkers, position]);

  const tableRef = useBoardFit(status === "ready" && !listView);

  // --- 대국자 카드 ------------------------------------------------------

  // 판은 초를 아래에 놓고 그린다. 뒤집으면 위아래가 바뀐다.
  const bottomSide: Side = boardFlipped ? "han" : "cho";
  const topSide: Side = boardFlipped ? "cho" : "han";

  const scores = useMemo(() => scoreBoard(position), [position]);

  /**
   * 두던 판을 어떤 상차림으로 시작했는지. 대국 패널이 고른 칸을 짚는다. 시작 국면에서
   * 읽는다 - 몇 수 두면 마·상이 움직여 지금 판으로는 되읽을 수 없다.
   */
  const startSetups = useMemo(() => {
    const board = parseFen(playHistory[0].fen).board;
    return { cho: detectSetup(board, "cho"), han: detectSetup(board, "han") };
  }, [playHistory]);

  const playerOf = useCallback(
    (side: Side) => {
      const me = openGame ? openGame.mySide : mySide;
      // 시계는 대국 탭에서만 보여준다. 지난 판에 남은 시간이 떠 있으면 아직 두는 판처럼 읽힌다.
      const timed = mode === "play" && clockSettings.enabled;
      return {
        side,
        name: me === side ? "나" : openGame ? openGame.levelName : level.name,
        kind: (me === side ? "human" : "engine") as "human" | "engine",
        score: side === "cho" ? scores.cho : scores.han,
        // 이 진영이 잡아낸 기물 = 상대가 잃은 기물
        captured: capturedPieces(position, side === "cho" ? "han" : "cho") as PieceType[],
        active: !showOver && position.turn === side,
        thinking: engineTurn && position.turn === side,
        clock: timed ? clocks[side] : null,
        settings: timed ? clockSettings : null,
        tag: sideTag(gstatus, shownOutcome, side),
        layout: (narrow ? "row" : "stacked") as "row" | "stacked",
      };
    },
    [
      openGame, mySide, level.name, scores, position, showOver, engineTurn, mode,
      clockSettings, clocks, gstatus, shownOutcome, narrow,
    ]
  );

  // 판이 규칙에 맞지 않을 때(불러온 기보가 이상할 때)만 헤더가 "잘못된 판" 을 건다.
  const problems = gstatus.kind === "invalid" && !listView ? gstatus.problems : null;

  // 눈으로는 대국자 카드와 헤더가 말하는 것을 화면 읽기 프로그램에 한 줄로 알린다.
  const spoken = listView
    ? ""
    : shownOutcome
      ? outcomeMessage(shownOutcome)
      : (statusMessage(gstatus) ?? "");

  // --- 화면 -------------------------------------------------------------

  if (status !== "ready") {
    return <BootScreen failed={status === "error"} progress={progress} error={error} />;
  }

  const thinking = engineTurn && Boolean(snapshot?.running);
  const openTag = openGame ? resultTag(openGame) : null;

  /*
   * 연 판의 머리 한 줄: 목록으로 · 어떤 판인지 · 저장.
   *
   * 목록으로는 이전·다음과 같은 테두리 버튼이다. 테두리 없는 글자 버튼일 때는 버튼으로
   * 보이지 않았다. 저장도 이 판에 하는 일이라 같은 줄에 둔다. 폰은 오른쪽 칸이 판 아래로
   * 내려가 판을 지나야 보이므로, 이 줄만 판 위로 올린다.
   */
  const gameBar = openGame && openTag && (
    <div className="game-back">
      <button type="button" className="back" onClick={closeArchived} disabled={review.running}>
        <ChevronLeft size={20} strokeWidth={2} aria-hidden />
        목록으로
      </button>
      {/* 승부를 앞에 둔다. 폰에서 자리가 모자라면 뒤(언제 뒀는지)부터 말줄임으로 준다. */}
      <span className="game-back-meta">
        <b className={"game-result " + openTag.tone}>{openTag.text}</b> · vs {openGame.levelName} ·{" "}
        {whenLabel(openGame.endedAt)}
      </span>
      <button type="button" className="save" onClick={saveRecord} aria-label="파일로 저장">
        저장
      </button>
    </div>
  );

  return (
    <div className="app">
      <AppHeader
        mode={mode}
        onMode={goMode}
        problems={problems}
        spoken={spoken}
        onUpdates={() => setUpdatesOpen(true)}
      />
      {/* 처음부터 있어야 새 말을 읽어 준다. 내용이 없어도 요소는 남겨 둔다. */}
      <p className="sr-only" role="status">
        {notice}
      </p>

      {listView ? (
        <main className="layout list">
          <GameList
            games={games}
            now={Date.now()}
            onOpen={openArchived}
            onLoad={loadRecord}
            page={listPage}
            onPage={(page) => {
              setListPage(page);
              setListError(null);
            }}
            error={listError}
            freshId={freshId}
          />
        </main>
      ) : (
        <main className="layout">
          <section className="board-col">
            <div className="table" ref={tableRef}>
              {/*
                판 칸에는 판만 둔다. 판 크기가 남은 높이로 정해져서, 위아래에 무언가
                뜨고 지면 판이 줄었다 늘었다 한다. 폰은 오른쪽 칸이 판 아래로 내려가서
                대국자 카드를 판 위아래에 붙이고, 연 판의 머리 줄을 맨 위에 둔다(판은
                폰에서 폭으로 크기가 정해져 줄지 않는다).
              */}
              {narrow && gameBar}
              {narrow && <PlayerCard {...playerOf(topSide)} />}

              <div className="board-stage">
                <Board
                  board={position.board}
                  flipped={boardFlipped}
                  selected={selected}
                  targets={targets}
                  lastMove={lastMove}
                  bestMove={bestArrow}
                  checkedKing={checkedKing}
                  onSquareClick={handleSquareClick}
                  onMove={handleMove}
                  onPick={handleSquareClick}
                  canPick={canPick}
                  // 지금 보고 있는 국면이 방금 난 그 국면일 때만 난다. 두 탭 모두에서.
                  flyMove={fly && fly.ply === cursor ? fly : null}
                  callout={mode === "play" ? callout : null}
                />
              </div>

              {narrow && <PlayerCard {...playerOf(bottomSide)} />}
            </div>
          </section>

          <section className={"side-col" + (mode === "play" ? " play" : "")}>
            {!narrow && gameBar}

            {/* 상대가 위, 내가 아래 - 판과 같은 순서로 포갠다. */}
            {!narrow && (
              <div className="players">
                <PlayerCard {...playerOf(topSide)} />
                <PlayerCard {...playerOf(bottomSide)} />
              </div>
            )}

            <BoardControls
              mode={mode}
              cursor={cursor}
              last={history.length - 1}
              canPass={canTouchBoard && passSquare !== null}
              finished={mode === "play" && ended}
              onJump={goTo}
              onUndo={undoMove}
              onFlip={flip}
              onPass={passMove}
            />

            {mode === "play" && (
              <PlayPanel
                mySide={mySide}
                levelId={levelId}
                started={started}
                ended={ended}
                clockId={clockId}
                onClock={setClockId}
                variant={prefs.variant}
                onVariant={(v) => setPrefs((o) => ({ ...o, variant: v }))}
                thinking={thinking}
                onMySide={(s) => {
                  setMySide(s);
                  // 고른 쪽을 아래에 놓는다. 앉은 자리에서 보는 것이 기본이고,
                  // 뒤집어 보고 싶으면 판 뒤집기로 언제든 바꾼다.
                  setFlipped(s === "han");
                  playedFor.current = null;
                }}
                onLevel={setLevelId}
                setups={startSetups}
                onSetup={(side: Side, setup: Setup) =>
                  startFrom({ ...position, board: applySetup(position.board, side, setup) })
                }
                onNewGame={() => setAsking("new")}
                onResign={() => setAsking("resign")}
              />
            )}

            {/*
              형세가 위, 복기가 아래 - 지금 국면의 형세를 보고 그 수의 설명으로 들어간다.
              형세는 복기 전에는 그릴 것이 없어 뜨지 않는다. 수를 옮기는 것은 판 조작 줄이
              (이전·다음과 수 슬라이더로) 맡는다.
            */}
            {openGame && (
              <>
                <EvalGraph history={history} cursor={cursor} />
                <ReviewPanel
                  moveCount={openGame.history.length - 1}
                  depthId={reviewDepthId}
                  threads={prefs.threads}
                  onDepth={setReviewDepthId}
                  running={review.running}
                  progress={review.progress}
                  reviewed={reviewed}
                  cursor={cursor}
                  error={review.error}
                  onStart={() => void startReview()}
                  onStop={review.stop}
                />
              </>
            )}
          </section>
        </main>
      )}

      {/*
        제보 버튼. 어느 탭에서나 같은 자리에 있다 - 사고는 어디서든 나고, 그때
        찾아 헤매게 하면 제보가 오지 않는다. 지금 보고 있는 판을 같이 담아 준다.
      */}
      <FeedbackButton
        detail={`${mode === "play" ? "대국" : "기보"} · ${history.length - 1}수 · ${entry.fen}`}
      />

      {/* 결과 창은 대국 탭에서 판이 끝나는 순간에만 뜬다. 기보 탭에서 끝난 판을 열 때는 뜨지 않는다. */}
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

      {updatesOpen && <UpdatesDialog onClose={() => setUpdatesOpen(false)} />}

      {/* 새 대국은 언제 눌러도 묻는다. 무엇이 달라지는지 한 줄만 상황마다 다르게 적는다. */}
      {asking === "new" && (
        <ConfirmDialog
          title="새 대국을 시작할까요?"
          message={
            !started
              ? "판을 처음 모양으로 다시 놓습니다."
              : ended
                ? "끝난 판은 기보 목록에서 다시 볼 수 있습니다."
                : "두던 판은 사라집니다. 기보 목록에는 끝난 판만 남습니다."
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

/** 던져진 값에서 사람에게 보일 말을 꺼낸다. */
function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/*
 * 제보 창구. 아직 열지 않았으면(값이 비어 있으면) 버튼을 아예 그리지 않는다 -
 * 눌러도 갈 데가 없는 버튼을 두지 않는다. README 의 '환경 변수' 참고.
 */
const FEEDBACK_URL = import.meta.env.VITE_FEEDBACK_URL ?? "";
/** 폼의 '환경' 칸 이름표(entry.NNN). 있으면 그 칸을 미리 채워서 연다. */
const FEEDBACK_ENTRY = import.meta.env.VITE_FEEDBACK_ENTRY ?? "";

/*
 * 브라우저와 운영체제를 짧은 말로 옮긴다.
 *
 * 긴 userAgent 를 그대로 적으면 보내는 사람이 그 덩어리를 보게 된다 - 자기가 적은 말보다
 * 긴 알 수 없는 글이 폼에 들어 있으면 지우거나, 보내기를 그만둔다. 필요한 것은 "크롬
 * 154 · 윈도우" 한 토막이다.
 *
 * 차례가 중요하다. 엣지·웨일·삼성 인터넷은 userAgent 에 Chrome 을 같이 적고, 크롬도
 * Safari 를 같이 적는다. 좁은 것부터 본다.
 */
const BROWSERS: [RegExp, string][] = [
  [/Edg\/(\d+)/, "엣지"],
  [/OPR\/(\d+)/, "오페라"],
  [/Whale\/(\d+)/, "웨일"],
  [/SamsungBrowser\/(\d+)/, "삼성 인터넷"],
  [/Firefox\/(\d+)/, "파이어폭스"],
  [/Chrome\/(\d+)/, "크롬"],
  [/Version\/(\d+)[\d.]*\s+(?:Mobile\/\S+\s+)?Safari/, "사파리"],
];

const SYSTEMS: [RegExp, string][] = [
  [/Windows/, "윈도우"],
  [/iPhone/, "아이폰"],
  [/iPad/, "아이패드"],
  [/Android/, "안드로이드"],
  [/Mac OS X/, "맥"],
  [/Linux/, "리눅스"],
];

function browserLabel(ua: string): string {
  for (const [re, name] of BROWSERS) {
    const m = re.exec(ua);
    if (m) return `${name} ${m[1]}`;
  }
  // 모르는 브라우저는 그대로 보낸다. 드물고, 드물 때가 제일 궁금하다.
  return ua;
}

function systemLabel(ua: string): string | null {
  for (const [re, name] of SYSTEMS) if (re.test(ua)) return name;
  return null;
}

/**
 * 제보에 같이 붙일 것. 두 줄이다.
 *
 *   장기 AI v0.1.0 · 크롬 154 · 윈도우 · 창 1440×900
 *   기보 · 42수 · rnba1abnr/4k4/...
 *
 * "말이 안 움직여요" 만 오면 아무것도 못 한다. 어느 버전인지, 어떤 브라우저인지,
 * 어떤 판이었는지를 매번 되물어야 하는데 - 제보는 몇 건 안 오고 되물으면 절반은
 * 답이 오지 않는다. 그래서 적되, **읽는 사람이 겁먹지 않을 만큼만** 적는다.
 *
 * @param sep 줄을 잇는 글자. 폼의 받는 칸이 **장문형이어야** 줄바꿈이 남는다.
 *   단답형이면 줄바꿈이 지워져 붙어 버리므로 가운뎃점(" · ")으로 넘긴다.
 */
function reportInfo(detail: string, sep = "\n"): string {
  const ua = navigator.userAgent;
  const 자리 = [
    `장기 AI v${APP_VERSION}`,
    browserLabel(ua),
    systemLabel(ua),
    `창 ${window.innerWidth}×${window.innerHeight}`,
  ].filter(Boolean);
  return [자리.join(" · "), detail].join(sep);
}

/**
 * 누르면 열릴 주소. 이름표가 있으면 '환경' 칸을 미리 채운 폼이다.
 *
 * 구글 폼은 주소 뒤에 `?usp=pp_url&entry.NNN=값` 을 붙이면 그 칸이 채워진 채로 열린다.
 * 붙여넣기를 시키면 절반은 그냥 비워 둔 채 보낸다 - 보내는 사람에게 할 일을 하나라도
 * 덜 주는 쪽이 받는 쪽에 이롭다.
 */
function feedbackLink(detail: string): string {
  if (!FEEDBACK_ENTRY) return FEEDBACK_URL;
  const sep = FEEDBACK_URL.includes("?") ? "&" : "?";
  // 받는 칸이 장문형이라 줄바꿈이 그대로 남는다(단답형이었을 때는 줄이 뭉개져 붙었다).
  const info = encodeURIComponent(reportInfo(detail));
  return `${FEEDBACK_URL}${sep}usp=pp_url&${FEEDBACK_ENTRY}=${info}`;
}

/**
 * 제보 버튼.
 *
 * 화면 오른쪽 아래에 떠 있다. DESIGN.md 는 떠 있는 것을 두지 않기로 했는데(오른쪽
 * 칸의 무언가를 가렸다) 이것만 예외다 - 까닭은 docs/DECISIONS.md 에 적었다.
 * 가리지 않도록 오른쪽 칸과 목록 칸 아래에 이 버튼 높이만큼 여백을 둔다.
 *
 * 누르면 제보 창구를 새 탭으로 연다. 폼의 칸 이름표(VITE_FEEDBACK_ENTRY)가 있으면
 * 버전·브라우저·보던 판이 이미 적힌 채로 열리고, 없으면 빈 폼이 열린다.
 *
 * 한동안 이름표가 없을 때 그 정보를 클립보드에 담아 줬다. 뺐다 - 폼에 받을 칸이 없으면
 * 붙여넣을 데도 없어서 담아 봐야 쓰이지 않고, 담았다고 알리려고 버튼 글자가 바뀌면
 * 떠 있는 버튼의 폭이 그때마다 달라진다.
 */
function FeedbackButton({ detail }: { detail: string }) {
  if (!FEEDBACK_URL) return null;

  const onClick = () => {
    window.open(feedbackLink(detail), "_blank", "noopener,noreferrer");
  };

  return (
    /*
     * 버그만 받는 창구가 아니다.
     *
     * 한동안 `버그 제보`(91)로 짧게 뒀다 - 넓을수록 많이 가려서다. 그런데 그 글자는
     * 받을 것을 좁힌다. "이건 버그는 아닌데" 싶은 말은 보내지 않게 되고, 쓰는 사람이
     * 바라는 것은 대개 버그가 아니라 그쪽이다. 가려지는 것은 아래 Known Gaps 에 적었다.
     */
    <button type="button" className="feedback-fab" onClick={onClick}>
      피드백 및 버그 제보
    </button>
  );
}
