// Fairy-Stockfish 제어기
//
// UCI 는 한 번에 한 가지 일만 하는 줄 단위 프로토콜이라, 명령을 마구 던지면
// 응답이 뒤섞인다. 여기서 요청을 직렬화하고, 탐색 중에는 stop 으로만 끊는다.

import type {
  AnalysisLine,
  PositionProbe,
  PositionRef,
  AnalysisSnapshot,
  EngineOptions,
  LoadProgress,
  SearchLimits,
} from "./types";
import { positionCommand } from "./types";
import { parseInfo, parsePerftMoves } from "./uci";

const ENGINE_BASE = "/engine/";
const NNUE_FILE = "janggi-9991472750de.nnue";
/** 엠스크립튼 가상 파일시스템 안에서의 신경망 경로 */
const NNUE_VFS_PATH = "/" + NNUE_FILE;

type Listener = (line: string) => void;

interface RawEngine {
  postMessage(cmd: string): void;
  addMessageListener(fn: Listener): void;
  FS: { writeFile(path: string, data: Uint8Array): void };
}

declare global {
  interface Window {
    Stockfish?: (opts?: Record<string, unknown>) => Promise<RawEngine>;
  }
}

/** 진행률을 보고하면서 파일을 받는다. 11MB 신경망은 체감이 커서 표시가 필요하다. */
async function fetchWithProgress(
  url: string,
  stage: string,
  onProgress: (p: LoadProgress) => void
): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(stage + " 내려받기 실패 (HTTP " + res.status + ")");

  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(await res.arrayBuffer());

  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress({ stage, loaded, total });
  }

  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function loadEngineScript(): Promise<void> {
  if (window.Stockfish) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = ENGINE_BASE + "stockfish.js";
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("stockfish.js 를 불러오지 못했습니다."));
    document.head.appendChild(el);
  });
}

export class JanggiEngine {
  private raw: RawEngine;
  private listeners = new Set<Listener>();
  /** 명령 직렬화용 꼬리. 앞선 작업이 끝나야 다음이 시작된다. */
  private tail: Promise<unknown> = Promise.resolve();
  private searching = false;
  /** 가장 최근 탐색 요청의 번호. 뒤늦게 차례가 온 옛 요청을 걸러낸다. */
  private searchGen = 0;
  /** 진행 중인(또는 대기 중인) 탐색 작업. stop() 이 이걸 기다린다. */
  private searchSettled: Promise<unknown> = Promise.resolve();
  private options: EngineOptions = {
    threads: 1,
    hashMb: 128,
    multiPV: 3,
    variant: "janggi",
  };

  private constructor(raw: RawEngine) {
    this.raw = raw;
    this.raw.addMessageListener((line) => {
      for (const fn of this.listeners) fn(line);
    });
  }

  static async create(
    onProgress: (p: LoadProgress) => void
  ): Promise<JanggiEngine> {
    if (!crossOriginIsolated) {
      throw new Error(
        "SharedArrayBuffer 를 쓸 수 없습니다. COOP/COEP 헤더가 적용된 서버로 접속해야 합니다 " +
          "(npm run dev 또는 npm run preview)."
      );
    }

    await loadEngineScript();
    const factory = window.Stockfish;
    if (!factory) throw new Error("Stockfish 로더를 찾지 못했습니다.");

    const wasmBinary = await fetchWithProgress(
      ENGINE_BASE + "stockfish.wasm",
      "엔진",
      onProgress
    );
    const nnue = await fetchWithProgress(
      ENGINE_BASE + NNUE_FILE,
      "장기 신경망",
      onProgress
    );

    onProgress({ stage: "엔진 초기화", loaded: 0, total: 0 });
    const raw = await factory({ wasmBinary });
    const engine = new JanggiEngine(raw);

    await engine.handshake();
    raw.FS.writeFile(NNUE_VFS_PATH, nnue);
    await engine.applyOptions();

    return engine;
  }

  // --- 저수준 통신 -------------------------------------------------------

  private send(cmd: string) {
    this.raw.postMessage(cmd);
  }

  /** 종료 조건을 만족하는 줄이 나올 때까지 모아서 돌려준다. */
  private collect(
    isDone: (line: string) => boolean,
    timeoutMs = 60000
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const buffer: string[] = [];
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error("엔진 응답 시간이 초과되었습니다."));
      }, timeoutMs);

      const listener: Listener = (line) => {
        buffer.push(line);
        if (isDone(line)) {
          clearTimeout(timer);
          this.listeners.delete(listener);
          resolve(buffer);
        }
      };
      this.listeners.add(listener);
    });
  }

  /** 앞선 요청이 끝난 뒤에 실행되도록 줄을 세운다. */
  private queue<T>(job: () => Promise<T>): Promise<T> {
    const next = this.tail.then(job, job);
    this.tail = next.catch(() => undefined);
    return next;
  }

  private async handshake() {
    const done = this.collect((l) => l === "uciok");
    this.send("uci");
    await done;
  }

  private async ready() {
    const done = this.collect((l) => l === "readyok");
    this.send("isready");
    await done;
  }

  // --- 설정 -------------------------------------------------------------

  private async applyOptions() {
    const o = this.options;
    // 순서가 중요하다. 변형을 먼저 알리고 그 변형의 국면을 물린 뒤에야
    // EvalFile 이 장기용 신경망으로 인식된다.
    this.send("setoption name UCI_Variant value " + o.variant);
    this.send("position startpos");
    this.send("setoption name EvalFile value " + NNUE_VFS_PATH);
    this.send("setoption name Threads value " + o.threads);
    this.send("setoption name Hash value " + o.hashMb);
    this.send("setoption name MultiPV value " + o.multiPV);
    await this.ready();
  }

  getOptions(): EngineOptions {
    return { ...this.options };
  }

  async setOptions(patch: Partial<EngineOptions>): Promise<void> {
    this.options = { ...this.options, ...patch };
    // 설정을 바꾸려면 먼저 탐색을 끊어야 한다. 큐 밖에서 끊는 이유는 stop() 주석 참고.
    await this.stop();
    await this.queue(() => this.applyOptions());
  }

  /** 신경망이 실제로 물렸는지 확인한다. 진단용. */
  async evaluationMode(fen: string): Promise<string> {
    return this.queue(async () => {
      this.send("position fen " + fen);
      const done = this.collect((l) => l.includes("evaluation"));
      this.send("eval");
      const out = await done;
      return (
        out
          .find((l) => l.includes("evaluation"))
          ?.replace("info string ", "")
          .trim() ?? "알 수 없음"
      );
    });
  }

  // --- 국면 조회 ---------------------------------------------------------

  /**
   * 국면을 한 번에 살핀다. 엔진에게 두 가지를 묻는다.
   *   d           → 엔진이 해석한 FEN 과 "Checkers:" (궁을 노리는 기물 자리)
   *   go perft 1  → 합법수 전체
   * 합법수가 0이면 대국이 끝난 것이고, Checkers 가 비어 있지 않으면 장군이다.
   * 두 질문을 한 작업으로 묶어 큐를 덜 오간다.
   */
  async probe(ref: PositionRef): Promise<PositionProbe> {
    return this.queue(async () => {
      this.send(positionCommand(ref));

      const dumped = this.collect((l) => l.startsWith("Checkers:"));
      this.send("d");
      const dump = await dumped;

      const normalized =
        dump.find((l) => l.startsWith("Fen:"))?.replace("Fen:", "").trim() ??
        null;
      const checkers =
        dump
          .find((l) => l.startsWith("Checkers:"))
          ?.replace("Checkers:", "")
          .trim()
          .split(/\s+/)
          .filter(Boolean) ?? [];

      const listed = this.collect((l) => l.startsWith("Nodes searched"));
      this.send("go perft 1");
      const legal = parsePerftMoves(await listed);

      return { fen: normalized, checkers, legal };
    });
  }

  // --- 탐색 -------------------------------------------------------------

  /**
   * 탐색을 끊는다.
   *
   * 이 메서드는 일부러 큐를 거치지 않는다. 무제한 분석은 bestmove 가 올 때까지
   * 끝나지 않는 큐 작업이라, stop 까지 줄을 세우면 서로를 기다리며 영원히 멈춘다.
   * 끊는 명령은 큐 밖에서 곧장 나가야 안에서 도는 탐색을 깨울 수 있다.
   */
  async stop(): Promise<void> {
    // 아직 시작하지 않고 큐에서 대기 중인 탐색도 무효로 만든다.
    this.searchGen += 1;
    if (this.searching) this.send("stop");
    await this.searchSettled;
  }

  /**
   * 국면을 분석한다. 진행 상황이 갱신될 때마다 onUpdate 가 호출되고,
   * 탐색이 끝나면 마지막 스냅샷의 running 이 false 가 된다.
   */
  analyze(
    ref: PositionRef,
    limits: SearchLimits,
    onUpdate: (snap: AnalysisSnapshot) => void
  ): void {
    const gen = ++this.searchGen;
    const job = this.queue(async () => {
      // 줄을 서 있는 사이에 국면이 또 바뀌었다면 이 요청은 버린다.
      if (gen !== this.searchGen) return;

      // 둘 차례는 시작 국면과 둔 수의 개수로 정해진다.
      const startsWithCho = ref.startFen.split(/\s+/)[1] !== "b";
      const choToMove = ref.moves.length % 2 === 0 ? startsWithCho : !startsWithCho;
      const lines = new Map<number, AnalysisLine>();
      const snap: AnalysisSnapshot = {
        lines: [],
        depth: 0,
        nodes: 0,
        nps: 0,
        timeMs: 0,
        hashfull: 0,
        bestmove: null,
        running: true,
      };

      // 매 info 라인마다 렌더링하면 초당 수십 번이라 화면이 버벅인다.
      // 갱신은 모아뒀다가 일정 간격으로 흘려보낸다.
      let dirty = false;
      const flush = () => {
        if (!dirty) return;
        dirty = false;
        const sorted = [...lines.values()].sort((a, b) => a.multipv - b.multipv);
        onUpdate({ ...snap, lines: sorted.map((l) => ({ ...l })) });
      };
      const ticker = window.setInterval(flush, 120);

      const done = this.collect(
        (l) => l.startsWith("bestmove"),
        24 * 60 * 60 * 1000
      );
      const listener: Listener = (line) => {
        const info = parseInfo(line, choToMove);
        if (!info?.pv || info.depth === undefined) return;
        lines.set(info.multipv ?? 1, {
          multipv: info.multipv ?? 1,
          depth: info.depth,
          seldepth: info.seldepth ?? info.depth,
          score: info.score ?? 0,
          mate: info.mate ?? null,
          pv: info.pv,
        });
        snap.depth = Math.max(snap.depth, info.depth);
        snap.nodes = info.nodes ?? snap.nodes;
        snap.nps = info.nps ?? snap.nps;
        snap.timeMs = info.timeMs ?? snap.timeMs;
        snap.hashfull = info.hashfull ?? snap.hashfull;
        dirty = true;
      };
      this.listeners.add(listener);

      this.send(positionCommand(ref));
      let go = "go";
      if (limits.infinite) go += " infinite";
      if (limits.depth) go += " depth " + limits.depth;
      if (limits.movetimeMs) go += " movetime " + limits.movetimeMs;
      this.searching = true;
      this.send(go);

      const out = await done;
      this.searching = false;
      window.clearInterval(ticker);
      this.listeners.delete(listener);

      const best = out.find((l) => l.startsWith("bestmove"))?.split(" ")[1];
      snap.bestmove = best && best !== "(none)" ? best : null;
      snap.running = false;
      dirty = true;
      flush();
    });

    // stop() 이 이 작업의 끝을 기다릴 수 있게 해둔다. 실패해도 멈추지 않도록 삼킨다.
    this.searchSettled = job.catch(() => undefined);
    void job;
  }
}
