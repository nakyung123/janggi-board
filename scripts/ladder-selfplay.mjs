// 급수 사다리 만들기 — 자가대국으로 눈금을 뜬다
//
// 왜 이렇게 하는가
// ---------------------------------------------------------------------------
// 급수를 27단계로 잘게 나누면, 이웃한 두 급수의 실력 차이는 아주 작다.
// 그 차이를 자가대국으로 직접 확인하려면 한 쌍에 수백 판이 필요하다. 몇 시간을
// 부어도 "17급이 18급보다 세다" 한 줄을 못 만든다.
//
// 그래서 순서를 뒤집었다.
//
//   1. 엔진의 강도 손잡이(Skill Level, 노드 수)를 하나의 곡선으로 묶고,
//      그 위에 서로 확실히 구분되는 기준점 13개를 찍는다.
//   2. 기준점끼리 실제로 붙인다. 이웃 쌍과 한 칸 건너뛴 쌍까지.
//   3. 승패를 Bradley-Terry 로 풀어 기준점마다 레이팅(점수)을 매긴다.
//   4. 그 레이팅 눈금 위에 급수 27개를 고르게 앉힌다.
//
// 이러면 "18급에서 1급까지 몇 점 차이인가" 가 실측으로 나오고, 급수 사이 간격도
// 눈대중이 아니라 측정값 위에서 고르게 된다.
//
// 돌리는 법
// ---------------------------------------------------------------------------
//   node scripts/ladder-selfplay.mjs --engine <UCI 엔진 실행파일> --minutes 85
//
// 엔진은 UCI 로 말하는 fairy-stockfish 실행파일이면 된다. 브라우저용 WASM 으로도
// 같은 수를 두지만(노드로 자르므로 결과가 같다) 몇 배 느려서 권하지 않는다.
// --nnue 를 주면 EvalFile 로 물린다. 안 주면 엔진 기본 평가함수를 쓴다.
//
// 중간에 끊어도 된다. 그때까지의 결과를 --out 파일에 계속 적는다.

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import readline from "node:readline";

// --- 설정 ------------------------------------------------------------------

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}

const ENGINE = args.get("engine");
const NNUE = args.get("nnue") ?? null;
const WORKERS = Number(args.get("workers") ?? 4);
const MINUTES = Number(args.get("minutes") ?? 85);
const OUT = args.get("out") ?? "ladder-result.json";
const HASH_MB = Number(args.get("hash") ?? 32);

/** 이미 둬 둔 결과를 다시 계산만 할 때. 대국은 하지 않는다. */
const FROM = args.get("from") ?? null;

if (!ENGINE && !FROM) {
  console.error("--engine <UCI 엔진 실행파일> 이 필요합니다.");
  console.error("이미 둔 결과를 다시 계산만 하려면 --from <결과.json> 을 주세요.");
  process.exit(1);
}

/** 한 판을 몇 수로 어림잡을지. 시간 배분에만 쓰는 값이라 대충이어도 된다. */
const PLIES_EST = 120;
/** 한 판의 수 제한. 넘으면 심판이 최종 국면을 보고 판정한다. */
const PLY_CAP = 170;

// --- 기준점 ----------------------------------------------------------------
//
// t 는 0(가장 약함)에서 1(가장 셈)로 가는 강도 눈금이다.
//   Skill Level = -20 + 40t   (엔진이 최선수를 얼마나 자주 버리는가)
//   노드        = 1500 · (5,000,000/1500)^t   (얼마나 깊이 보는가)
//
// 위쪽 기준점은 한 판에 수십 분이 걸려서 t=0.87 에서 끊었다. 그 위(2단 이상)는
// 같은 곡선을 그대로 연장해 쓰고, 검증하지 않았다고 적는다.
const CANDIDATES = [
  { t: 0.0, skill: -20, nodes: 1_500 },
  { t: 0.0725, skill: -17, nodes: 2_700 },
  { t: 0.145, skill: -14, nodes: 4_900 },
  { t: 0.2175, skill: -11, nodes: 8_700 },
  { t: 0.29, skill: -8, nodes: 15_700 },
  { t: 0.3625, skill: -6, nodes: 28_000 },
  { t: 0.435, skill: -3, nodes: 51_000 },
  { t: 0.5075, skill: 0, nodes: 91_000 },
  { t: 0.58, skill: 3, nodes: 165_000 },
  { t: 0.6525, skill: 6, nodes: 298_000 },
  { t: 0.725, skill: 9, nodes: 505_000 },
  { t: 0.7975, skill: 12, nodes: 900_000 },
  { t: 0.87, skill: 15, nodes: 1_600_000 },
];

CANDIDATES.forEach((c, i) => {
  c.i = i;
  c.name = "C" + i;
});

// --- 상차림 ----------------------------------------------------------------
//
// 같은 판만 반복하면 같은 수순만 나온다. 뒷줄의 마·상 자리를 바꾼 16가지를 돌린다.
const LEFT = { in: "nb", out: "bn" };
const RIGHT = { in: "bn", out: "nb" };

const backRank = (left, right, upper) => {
  const s = "r" + LEFT[left] + "a1a" + RIGHT[right] + "r";
  return upper ? s.toUpperCase() : s;
};

const STARTS = [];
for (const hl of ["in", "out"])
  for (const hr of ["in", "out"])
    for (const cl of ["in", "out"])
      for (const cr of ["in", "out"])
        STARTS.push(
          backRank(hl, hr, false) +
            "/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/" +
            backRank(cl, cr, true) +
            " w - - 0 1"
        );

// --- 엔진 ------------------------------------------------------------------

const posCmd = (fen, moves) =>
  moves.length ? `position fen ${fen} moves ${moves.join(" ")}` : `position fen ${fen}`;

/** 장기에는 한수쉼이 있다. 제자리 수(a1a1)가 그것이다. */
const isPass = (m) => m.slice(0, m.length / 2) === m.slice(m.length / 2);

class Engine {
  static async open() {
    const proc = spawn(ENGINE, { stdio: ["pipe", "pipe", "ignore"] });
    const e = new Engine(proc);
    await e.until((l) => l === "uciok", () => e.send("uci"));
    e.send("setoption name UCI_Variant value janggi");
    if (NNUE) e.send("setoption name EvalFile value " + NNUE);
    e.send("setoption name Threads value 1");
    e.send("setoption name Hash value " + HASH_MB);
    await e.ready();
    return e;
  }

  constructor(proc) {
    this.proc = proc;
    this.waiters = [];
    readline.createInterface({ input: proc.stdout }).on("line", (line) => {
      for (const w of this.waiters.slice()) {
        w.buf.push(line);
        if (w.done(line)) {
          this.waiters.splice(this.waiters.indexOf(w), 1);
          clearTimeout(w.timer);
          w.resolve(w.buf);
        }
      }
    });
  }

  send(cmd) {
    this.proc.stdin.write(cmd + "\n");
  }

  until(done, fire, ms = 1_800_000) {
    return new Promise((resolve, reject) => {
      const w = {
        buf: [],
        done,
        resolve,
        timer: setTimeout(() => {
          this.waiters.splice(this.waiters.indexOf(w), 1);
          reject(new Error("엔진이 응답하지 않습니다"));
        }, ms),
      };
      this.waiters.push(w);
      if (fire) fire();
    });
  }

  ready() {
    return this.until((l) => l === "readyok", () => this.send("isready"));
  }

  async setSkill(skill) {
    this.send("setoption name Skill Level value " + skill);
    await this.ready();
  }

  /** 판을 새로 시작할 때마다 앞 판의 기억을 지운다. */
  async clearHash() {
    this.send("setoption name Clear Hash");
    await this.ready();
  }

  /** 둘 수 있는 수와 장군 여부. 외통을 가리려면 둘 다 필요하다. */
  async probe(fen, moves) {
    this.send(posCmd(fen, moves));
    const dump = await this.until((l) => l.startsWith("Checkers:"), () => this.send("d"));
    const checkers = dump
      .find((l) => l.startsWith("Checkers:"))
      .replace("Checkers:", "")
      .trim();
    const out = await this.until(
      (l) => l.startsWith("Nodes searched"),
      () => this.send("go perft 1")
    );
    const legal = [];
    for (const l of out) {
      const m = l.match(/^([a-i](?:10|[1-9])[a-i](?:10|[1-9])):\s*\d+$/);
      if (m) legal.push(m[1]);
    }
    return { legal, inCheck: checkers.length > 0 };
  }

  async search(fen, moves, nodes) {
    this.send(posCmd(fen, moves));
    const out = await this.until(
      (l) => l.startsWith("bestmove"),
      () => this.send("go nodes " + nodes)
    );
    const best = out.find((l) => l.startsWith("bestmove")).split(" ")[1];
    const info = out.filter((l) => l.includes(" pv ")).pop() ?? "";
    const cp = info.match(/score cp (-?\d+)/);
    const mate = info.match(/score mate (-?\d+)/);
    return {
      best,
      cp: cp ? Number(cp[1]) : null,
      mate: mate ? Number(mate[1]) : null,
    };
  }

  close() {
    try {
      this.send("quit");
    } catch {
      /* 이미 죽었으면 그만 */
    }
    this.proc.kill();
  }
}

// --- 한 판 -----------------------------------------------------------------

/**
 * 한 판을 끝까지 둔다. 이긴 쪽("cho" | "han") 또는 "draw" 를 돌려준다.
 *
 * 장기는 한수쉼이 있어서 둘 수 있는 수가 0이 되는 일이 없다. 그래서
 * 외통은 "장군인데 한수쉼 말고는 둘 게 없는 상태" 로 가린다.
 */
async function playGame(engCho, choSet, engHan, hanSet, startFen, judge) {
  await engCho.setSkill(choSet.skill);
  await engCho.clearHash();
  await engHan.setSkill(hanSet.skill);
  await engHan.clearHash();

  const moves = [];
  let decided = 0;

  for (let ply = 0; ply < PLY_CAP; ply++) {
    const choTurn = ply % 2 === 0;
    const mover = choTurn ? engCho : engHan;
    const set = choTurn ? choSet : hanSet;

    const { legal, inCheck } = await mover.probe(startFen, moves);
    if (legal.filter((m) => !isPass(m)).length === 0) {
      if (inCheck) return choTurn ? "han" : "cho";
      return "draw";
    }

    const r = await mover.search(startFen, moves, set.nodes);
    if (!r.best || r.best === "(none)") return choTurn ? "han" : "cho";
    moves.push(r.best);

    // 형세가 여섯 수 내리 한쪽으로 기울면 거기서 접는다. 끝까지 두게 두면
    // 약한 급수끼리는 외통을 못 내고 170수를 다 채운다.
    const cpCho = r.cp === null ? null : choTurn ? r.cp : -r.cp;
    if (cpCho !== null && Math.abs(cpCho) > 900) decided++;
    else decided = 0;
    if (decided >= 6) return cpCho > 0 ? "cho" : "han";

    if (r.mate !== null && Math.abs(r.mate) <= 3) {
      const mateCho = choTurn ? r.mate : -r.mate;
      return mateCho > 0 ? "cho" : "han";
    }
  }

  // 수를 다 썼다. 심판이 최종 국면을 보고 판정한다.
  await judge.setSkill(20);
  const v = await judge.search(startFen, moves, 400_000);
  const turnIsCho = moves.length % 2 === 0;
  const cpCho = v.cp === null ? 0 : turnIsCho ? v.cp : -v.cp;
  if (cpCho > 250) return "cho";
  if (cpCho < -250) return "han";
  return "draw";
}

// 이미 둔 결과만 다시 계산하는 길. 여기서 끝난다.
if (FROM) {
  const saved = JSON.parse(readFileSync(FROM, "utf8"));
  report(saved.candidates ?? CANDIDATES, saved.results ?? []);
  process.exit(0);
}

// --- 대진표 ----------------------------------------------------------------

const estSeconds = (a, b) => (PLIES_EST * ((a.nodes + b.nodes) / 2)) / 250_000;

const PAIRS = [];
for (let i = 0; i + 1 < CANDIDATES.length; i++) PAIRS.push([i, i + 1]);
for (let i = 0; i + 2 < CANDIDATES.length; i++) PAIRS.push([i, i + 2]);

const budgetSeconds = MINUTES * 60 * WORKERS;
const sharePerPair = budgetSeconds / PAIRS.length;

const plan = PAIRS.map(([i, j]) => {
  const est = estSeconds(CANDIDATES[i], CANDIDATES[j]);
  // 싼 쌍은 많이, 비싼 쌍은 적게. 아무리 비싸도 색을 바꿔 최소 4판은 둔다.
  const games = Math.max(4, Math.min(100, Math.round(sharePerPair / est)));
  return { i, j, est, games };
});

// 한 판씩 돌아가며 둔다. 중간에 끊겨도 모든 쌍에 골고루 표본이 남는다.
// 한 바퀴 안에서는 싼 판부터 둬서, 시간이 모자라 잘리는 쪽이 비싼 판이 되게 한다.
const tasks = [];
const byCost = [...plan].sort((a, b) => a.est - b.est);
const maxRounds = Math.max(...plan.map((p) => p.games));
for (let round = 0; round < maxRounds; round++) {
  for (const p of byCost) {
    if (round < p.games) tasks.push({ i: p.i, j: p.j, game: round, est: p.est });
  }
}

console.log(`기준점 ${CANDIDATES.length}개, 대진 ${PAIRS.length}쌍, 예정 ${tasks.length}판`);
console.log(`일꾼 ${WORKERS}, 시간 예산 ${MINUTES}분\n`);
for (const p of plan) {
  console.log(
    `  C${p.i}(${CANDIDATES[p.i].nodes.toLocaleString()}) vs C${p.j}(${CANDIDATES[
      p.j
    ].nodes.toLocaleString()}) — ${p.games}판, 한 판 약 ${p.est.toFixed(0)}초`
  );
}
console.log("");

// --- 돌리기 ----------------------------------------------------------------

const results = []; // { i, j, winner: "i"|"j"|"draw", ... }
const deadline = Date.now() + MINUTES * 60 * 1000;
let cursor = 0;
let done = 0;

function save() {
  writeFileSync(
    OUT,
    JSON.stringify(
      { candidates: CANDIDATES, plan, results, finishedAt: new Date().toISOString() },
      null,
      2
    )
  );
}

async function worker(id) {
  const engA = await Engine.open();
  const engB = await Engine.open();

  while (true) {
    const task = tasks[cursor++];
    if (!task) break;
    // 남은 시간에 못 끝낼 판은 건너뛴다. 예산을 넘겨 한참 더 도는 일을 막는다.
    const left = (deadline - Date.now()) / 1000;
    if (left <= 0) break;
    if (task.est > left * 1.3) continue;

    const lo = CANDIDATES[task.i];
    const hi = CANDIDATES[task.j];
    // 색을 번갈아 준다. 선수(초)가 유리하다면 양쪽이 똑같이 나눠 갖는다.
    const hiIsCho = task.game % 2 === 0;
    const start = STARTS[(task.i * 5 + task.j * 3 + task.game) % STARTS.length];

    let res;
    try {
      res = hiIsCho
        ? await playGame(engA, hi, engB, lo, start, engA)
        : await playGame(engA, lo, engB, hi, start, engA);
    } catch (err) {
      console.log(`  ! 일꾼 ${id}: ${err.message}`);
      continue;
    }

    const hiSide = hiIsCho ? "cho" : "han";
    const winner = res === "draw" ? "draw" : res === hiSide ? "j" : "i";
    results.push({ i: task.i, j: task.j, game: task.game, winner, hiIsCho });

    done++;
    if (done % 10 === 0) {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      console.log(`  ${done}판 끝 (남은 시간 ${Math.floor(left / 60)}분 ${left % 60}초)`);
      save();
    }
  }

  engA.close();
  engB.close();
}

// --- 레이팅 ----------------------------------------------------------------
//
// Bradley-Terry 를 MM(minorization-maximization)으로 푼다. 비김은 양쪽에 반 승씩
// 나눠 준다. 쌍마다 가상의 무승부 한 판을 섞어, 전승/전패가 나와도 점수가
// 무한대로 튀지 않게 한다.

function fitRatings(n, games) {
  const wins = Array.from({ length: n }, () => new Array(n).fill(0));
  const played = Array.from({ length: n }, () => new Array(n).fill(0));

  const add = (a, b, wa, wb) => {
    wins[a][b] += wa;
    wins[b][a] += wb;
    played[a][b] += wa + wb;
    played[b][a] += wa + wb;
  };

  for (const g of games) {
    if (g.winner === "draw") add(g.i, g.j, 0.5, 0.5);
    else if (g.winner === "i") add(g.i, g.j, 1, 0);
    else add(g.i, g.j, 0, 1);
  }
  // 가상 무승부 — 전승이 나와도 점수가 무한대로 튀지 않게 한다
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++) if (played[a][b] > 0) add(a, b, 0.5, 0.5);

  const gamma = new Array(n).fill(1);
  const totalWins = gamma.map((_, a) => wins[a].reduce((s, v) => s + v, 0));

  for (let iter = 0; iter < 5000; iter++) {
    let moved = 0;
    for (let a = 0; a < n; a++) {
      if (totalWins[a] === 0) continue;
      let denom = 0;
      for (let b = 0; b < n; b++) {
        if (b === a || played[a][b] === 0) continue;
        denom += played[a][b] / (gamma[a] + gamma[b]);
      }
      if (denom === 0) continue;
      const next = totalWins[a] / denom;
      moved = Math.max(moved, Math.abs(Math.log(next / gamma[a])));
      gamma[a] = next;
    }
    // 가장 아래를 1 로 고정해 눈금을 붙잡아 둔다.
    const base = gamma[0];
    for (let a = 0; a < n; a++) gamma[a] /= base;
    if (moved < 1e-9) break;
  }

  return gamma.map((g) => 400 * Math.log10(g));
}

// --- 급수 배치 --------------------------------------------------------------
//
// 기준점마다 나온 레이팅은 들쭉날쭉하다. 표본이 적으니 당연하다. 그래서 점을
// 그대로 쓰지 않고 t 에 대한 2차식으로 매끄럽게 편 뒤, 그 곡선 위에서 레이팅이
// 고르게 벌어지도록 급수 27개의 t 를 고른다.
//
// 간격을 't' 가 아니라 '레이팅' 으로 고르게 잡는 것이 핵심이다. t 로 고르게
// 나누면 실제 실력 차이는 아래쪽이 촘촘하고 위쪽이 듬성듬성해진다.

/**
 * 최소제곱으로 R(t) 를 맞춘다. 단, 반드시 단조 증가여야 한다.
 *
 * 그냥 2차식을 맞추면 아래쪽이 평평한 자료에서 곡선이 t=0 부근에서 아래로
 * 꺾인다. 그러면 "레이팅이 R 인 지점의 t" 가 둘이 되어 급수를 앉힐 수 없다.
 * 그래서 꼭짓점이 구간 안에 들어오면 기울기를 그 끝에서 0 으로 묶어 다시
 * 맞춘다. 남는 것은 한쪽으로만 휘는 곡선이다.
 */
function fitCurve(points) {
  // 주어진 기저함수들로 가중 최소제곱을 푼다 (정규방정식 + 가우스 소거)
  const solve = (basis) => {
    const n = basis.length;
    const M = Array.from({ length: n }, () => new Array(n + 1).fill(0));
    for (const { t, r, w } of points) {
      const weight = w ?? 1;
      const f = basis.map((b) => b(t));
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) M[a][b] += weight * f[a] * f[b];
        M[a][n] += weight * f[a] * r;
      }
    }
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let row = col + 1; row < n; row++)
        if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
      [M[col], M[pivot]] = [M[pivot], M[col]];
      for (let row = 0; row < n; row++) {
        if (row === col || M[col][col] === 0) continue;
        const f = M[row][col] / M[col][col];
        for (let k = col; k <= n; k++) M[row][k] -= f * M[col][k];
      }
    }
    const coef = M.map((row, k) => row[n] / row[k]);
    return (t) => coef.reduce((sum, c, k) => sum + c * basis[k](t), 0);
  };

  const one = () => 1;
  const lin = (t) => t;
  const sq = (t) => t * t;

  const free = solve([one, lin, sq]);
  // 끝점의 기울기를 수치로 확인한다
  const slope = (f, t) => (f(t + 1e-4) - f(t - 1e-4)) / 2e-4;
  if (slope(free, 0) >= 0 && slope(free, 1) >= 0) return free;

  // 아래로 꺾였다 → t=0 에서 기울기 0 으로 묶는다 (R = a + c·t²)
  if (slope(free, 0) < 0) {
    const tied = solve([one, sq]);
    if (slope(tied, 1) >= 0) return tied;
  }
  // 위에서 꺾였다 → t=1 에서 기울기 0 으로 묶는다 (R = a + c·(t²−2t))
  const tied = solve([one, (t) => t * t - 2 * t]);
  if (slope(tied, 0) >= 0) return tied;

  // 그래도 안 되면 직선으로 간다. 적어도 단조롭다.
  return solve([one, lin]);
}

function skillOf(t) {
  return Math.round(-20 + 40 * t);
}

/** 1,234,567 같은 숫자는 화면에 보여줄 값이 아니다. 읽기 좋게 반올림한다. */
function nodesOf(t) {
  const raw = 1500 * Math.pow(5000000 / 1500, t);
  const unit = Math.pow(10, Math.max(2, Math.floor(Math.log10(raw)) - 1));
  return Math.round(raw / unit) * unit;
}

/**
 * 레이팅 눈금 위에 급수 27개를 앉힌다.
 *
 * 양 끝은 손잡이의 양 극단에 못 박는다. 18급은 엔진이 낼 수 있는 가장 약한
 * 설정(Skill -20, 최소 노드), 9단은 가장 센 설정이다.
 *
 * 사이는 두 구간으로 나눠 앉힌다.
 *
 *   급(18급~1급)  t=0 부터 노드 15만까지
 *   단(1단~9단)   그 위부터 끝까지
 *
 * 왜 한 줄로 고르게 펴지 않는가. 엔진끼리의 레이팅은 약한 쪽에서 납작해진다.
 * 둘 다 실수를 하니 승패가 뒤집히고, 그래서 점수 차이가 작게 나온다. 하지만
 * 사람 눈에는 Skill -20(기물을 그냥 내준다)과 Skill -8(포진은 갖춘다)이 전혀
 * 다른 상대다. 레이팅만 믿고 고르게 펴면 급수 대부분이 사람이 이길 수 없는
 * 구간에 몰린다. 그래서 사람이 이길 수 있는 아래쪽에 급 18개를 몰아주고,
 * 그 위는 단 9개가 훑게 했다.
 *
 * 각 구간 안에서는 t 가 아니라 '레이팅' 이 고르게 벌어지도록 고른다.
 */

function placeLadder(curve) {
  /** 급수의 위 끝. 한 수에 15만 노드 — 이쯤이 사람이 해볼 만한 마지막 줄이다. */
  const KUP_TOP_T = Math.log(150_000 / 1500) / Math.log(5_000_000 / 1500);
  const KUP = Array.from({ length: 18 }, (_, k) => 18 - k + "급");
  const DAN = Array.from({ length: 9 }, (_, k) => k + 1 + "단");

  /** 곡선이 단조로우므로 이분법으로 레이팅 → t 를 되돌린다. */
  const tOf = (want, lo, hi) => {
    let a = lo;
    let b = hi;
    for (let it = 0; it < 60; it++) {
      const mid = (a + b) / 2;
      if (curve(mid) < want) a = mid;
      else b = mid;
    }
    return (a + b) / 2;
  };

  const band = (names, tLo, tHi) => {
    const rLo = curve(tLo);
    const rHi = curve(tHi);
    const last = names.length - 1;
    return names.map((name, k) => {
      const rating = rLo + ((rHi - rLo) * k) / last;
      const t = k === 0 ? tLo : k === last ? tHi : tOf(rating, tLo, tHi);
      return { name, t, skill: skillOf(t), nodes: nodesOf(t), rating };
    });
  };

  // 단은 급의 맨 위 바로 다음 칸부터 시작한다. 1단이 1급보다 세야 한다.
  const kup = band(KUP, 0, KUP_TOP_T);
  const danLo = KUP_TOP_T + (1 - KUP_TOP_T) / 9;
  const dan = band(DAN, danLo, 1);
  return [...kup, ...dan];
}

// --- 보고 ------------------------------------------------------------------

function report(candidates, games) {
  const ratings = fitRatings(candidates.length, games);

  console.log("\n=== 기준점 레이팅 (가장 약한 쪽을 0 으로) ===");
  const points = [];
  for (const c of candidates) {
    const played = games.filter((r) => r.i === c.i || r.j === c.i).length;
    const won = games.filter(
      (r) => (r.i === c.i && r.winner === "i") || (r.j === c.i && r.winner === "j")
    ).length;
    if (played > 0) points.push({ t: c.t, r: ratings[c.i], w: played });
    console.log(
      "  C" + String(c.i).padStart(2) +
        " skill=" + String(c.skill).padStart(3) +
        " nodes=" + String(c.nodes).padStart(9) +
        " | " + ratings[c.i].toFixed(0).padStart(5) + "점" +
        " (" + played + "판 중 " + won + "승)"
    );
  }

  console.log("\n=== 쌍별 성적 ===");
  const pairs = new Map();
  for (const g of games) {
    const key = g.i + "-" + g.j;
    const v = pairs.get(key) ?? { i: g.i, j: g.j, hi: 0, lo: 0, draw: 0 };
    if (g.winner === "draw") v.draw++;
    else if (g.winner === "j") v.hi++;
    else v.lo++;
    pairs.set(key, v);
  }
  for (const v of [...pairs.values()].sort((a, b) => a.i - b.i || a.j - b.j)) {
    const total = v.hi + v.lo + v.draw;
    const mark = v.hi > v.lo ? "OK  " : v.hi === v.lo ? "~~  " : "역전";
    console.log(
      "  " + mark + " C" + v.j + " vs C" + v.i +
        " | " + v.hi + "승 " + v.lo + "패 무 " + v.draw +
        " (" + total + "판, 위쪽 승률 " +
        (((v.hi + v.draw / 2) / total) * 100).toFixed(0) + "%)"
    );
  }

  if (points.length < 3) {
    console.log("\n표본이 모자라 급수 배치는 건너뜁니다.");
    return;
  }

  const curve = fitCurve(points);
  console.log(
    "\n=== 레이팅 곡선 ===  R(0)=" + curve(0).toFixed(0) +
      " · R(0.5)=" + curve(0.5).toFixed(0) +
      " · R(1)=" + curve(1).toFixed(0) +
      "  (폭 " + (curve(1) - curve(0)).toFixed(0) + "점)"
  );

  const rows = placeLadder(curve);
  const kupStep = (rows[17].rating - rows[0].rating) / 17;
  const danStep = (rows[26].rating - rows[18].rating) / 8;
  console.log(
    "급 한 칸 = " + kupStep.toFixed(0) + "점 · 단 한 칸 = " + danStep.toFixed(0) + "점 " +
      "(1급 → 1단 = " + (rows[18].rating - rows[17].rating).toFixed(0) + "점)\n"
  );
  console.log("=== levels.ts 에 넣을 표 ===");
  for (const r of rows) {
    console.log(
      '  { name: "' + r.name + '", skill: ' + r.skill + ", nodes: " + r.nodes + " }," +
        "  // t=" + r.t.toFixed(3) + " " + r.rating.toFixed(0) + "점"
    );
  }
}

await Promise.all(Array.from({ length: WORKERS }, (_, k) => worker(k)));
save();
report(CANDIDATES, results);

writeFileSync(
  OUT,
  JSON.stringify(
    {
      candidates: CANDIDATES,
      plan,
      results,
      ratings: fitRatings(CANDIDATES.length, results),
      finishedAt: new Date().toISOString(),
    },
    null,
    2
  )
);
console.log("\n" + results.length + "판을 두었습니다. 결과: " + OUT);
process.exit(0);
