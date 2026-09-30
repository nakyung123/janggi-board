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
import { EvalGraph } from "./components/games/EvalGraph";
import { GameList } from "./components/games/GameList";
import { MoveList } from "./components/games/MoveList";
import { ReviewPanel } from "./components/games/ReviewPanel";
import { AppHeader } from "./components/layout/AppHeader";
import { BootScreen } from "./components/layout/BootScreen";
import type { Mode } from "./components/layout/ModeTabs";
import { GameOverDialog } from "./components/play/GameOverDialog";
import { PlayPanel } from "./components/play/PlayPanel";

import { playMoveSound, playPickSound, setSoundEnabled } from "./audio/sound";
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
import { downloadRecord, gameOfRecord, parseRecord, recordOfGame } from "./janggi/record";
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

  // 헤더의 소리 버튼. 소리를 내는 effect 들보다 먼저 두어 같은 렌더에서 먼저 돈다.
  const [soundOn, setSoundOn] = usePersisted("soundOn", true, (v) => typeof v === "boolean");
  useEffect(() => setSoundEnabled(soundOn), [soundOn]);

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
  /** 기보 칸에 마우스를 올린 수. 판에 화살표로 미리 보여준다. */
  const [hover, setHover] = useState<string | null>(null);
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

  const history = openGame ? openGame.history : playHistory;
  const cursor = openGame ? Math.min(viewCursor, openGame.history.length - 1) : playCursor;
  const setCursor = openGame ? setViewCursor : setPlayCursor;
  const reviewed = openGame?.reviewed ?? null;
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
   * 끝나지 않은 판은 여기서 기보 목록에 '중단' 으로 남긴다(끝난 판은 끝날 때 이미 들어갔고,
   * 한 수도 두지 않은 판은 남길 것이 없다).
   */
  const newGame = () => {
    if (started && !ended) {
      setGames((list) => upsertGame(list, archiveOf({ kind: "abandoned", winner: null })));
    }
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
      setHover(null);
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
    setHover(null);
    review.clearError();
  };

  const closeArchived = () => {
    if (review.running) return;
    setOpenId(null);
    setHover(null);
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
      const game = gameOfRecord(parseRecord(await file.text()));
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
      reviewDepthById(reviewDepthId).nodes
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
  /** 기보 칸에 마우스를 올린 수 */
  const hoverArrow = arrowOf(hover);
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
        soundOn={soundOn}
        onToggleSound={() => setSoundOn((on) => !on)}
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
              형세가 위, 복기가 아래 - 판 전체의 흐름을 먼저 보고 한 수씩 들어간다. 형세는
              복기 전에는 그릴 것이 없어 뜨지 않는다. 수 목록은 복기 칸 안에 선다.
            */}
            {openGame && (
              <>
                <EvalGraph history={history} cursor={cursor} onJump={goTo} />
                <ReviewPanel
                  moveCount={openGame.history.length - 1}
                  levelName={openGame.levelName}
                  names={{
                    cho: openGame.mySide === "cho" ? "나" : openGame.levelName,
                    han: openGame.mySide === "han" ? "나" : openGame.levelName,
                  }}
                  depthId={reviewDepthId}
                  onDepth={setReviewDepthId}
                  running={review.running}
                  progress={review.progress}
                  reviewed={reviewed}
                  cursor={cursor}
                  error={review.error}
                  onStart={() => void startReview()}
                  onStop={review.stop}
                  onJump={goTo}
                  moves={
                    <MoveList
                      history={history}
                      cursor={cursor}
                      reviewed={reviewed}
                      onJump={goTo}
                      onHoverMove={setHover}
                    />
                  }
                />
              </>
            )}
          </section>
        </main>
      )}

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

      {/* 새 대국은 언제 눌러도 묻는다. 무엇이 달라지는지 한 줄만 상황마다 다르게 적는다. */}
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

/** 던져진 값에서 사람에게 보일 말을 꺼낸다. */
function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
