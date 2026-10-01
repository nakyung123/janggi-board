// 엔진 자산 준비 스크립트
//
// 1) node_modules 의 fairy-stockfish-nnue.wasm 런타임 파일을 public/engine 으로 복사
// 2) 장기 전용 NNUE 신경망(약 11MB)을 내려받아 public/engine 에 저장
//
// 두 자산 모두 용량이 커서 저장소에 커밋하지 않는다(.gitignore 등록).
// 이미 받아둔 파일이 있으면 건너뛰므로 predev/prebuild 에서 매번 돌려도 부담이 없다.

import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, copyFile, writeFile, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE_DIR = join(ROOT, "public", "engine");
const PKG_DIR = join(ROOT, "node_modules", "fairy-stockfish-nnue.wasm");

// WASM 런타임 3종. stockfish.js 가 같은 폴더의 .wasm 과 .worker.js 를 찾으므로 함께 둬야 한다.
const RUNTIME_FILES = ["stockfish.js", "stockfish.wasm", "stockfish.worker.js"];

/*
 * 장기 NNUE.
 *
 * 파일명이 곧 검사값이다. fairy-stockfish 는 신경망을 그 파일의 SHA-256 앞 12자리로
 * 이름 짓는다 — janggi-9991472750de.nnue 의 SHA-256 은 9991472750deab2c… 로 시작한다.
 * 그래서 이름만 가지고도 "받은 것이 그 파일이 맞는지" 를 확인할 수 있다.
 *
 * 왜 확인해야 하나 — 이 파일만 저장소 밖(구글 드라이브)에서 받는다. 그 링크의 파일이
 * 바뀌면 빌드는 아무 말 없이 다른 신경망을 싣는다. 크기만 보던 전까지는 10MB 가 넘기만
 * 하면 무엇이든 통과했고, 11MB 짜리 바이너리는 열어 봐도 사람 눈에 다르지 않다.
 *
 * 출처: https://fairy-stockfish.github.io/nnue/
 */
const NNUE = {
  name: "janggi-9991472750de.nnue",
  url: "https://drive.google.com/uc?id=1dAEzbK1rOm8UGm_-CLdDEgeopFDcAtQP&export=download",
  minBytes: 10_000_000, // 실측 11,261,920 바이트. 구글 드라이브가 안내 HTML을 돌려준 경우를 걸러낸다.
};

/** 파일명에 박힌 검사값. janggi-<앞 12자리>.nnue 에서 가운데만 꺼낸다. */
const EXPECTED_HASH = NNUE.name.slice("janggi-".length, -".nnue".length);

const mb = (n) => (n / 1e6).toFixed(2) + "MB";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** 받은 바이트가 이름이 말하는 그 파일인지. 아니면 까닭을 들어 멈춘다. */
function checkNnue(bytes, where) {
  if (bytes.byteLength < NNUE.minBytes) {
    throw new Error(
      `${where}: 너무 작습니다(${mb(bytes.byteLength)}). ` +
        `구글 드라이브 확인 페이지를 받았을 수 있습니다.` +
        `\n수동으로 받으려면: https://fairy-stockfish.github.io/nnue/ 에서 ` +
        `${NNUE.name} 을 내려받아 public/engine/ 에 넣으세요.`
    );
  }
  const got = sha256(bytes);
  if (!got.startsWith(EXPECTED_HASH)) {
    throw new Error(
      `${where}: 신경망이 이름과 다릅니다. 다른 파일입니다.` +
        `\n  기대한 검사값: ${EXPECTED_HASH}… (파일명에서)` +
        `\n  실제 검사값  : ${got}` +
        `\n원본이 바뀌었거나 받는 도중 어긋났습니다. 파일을 지우고 다시 받아 보고,` +
        `\n그래도 같으면 https://fairy-stockfish.github.io/nnue/ 에서 직접 확인하세요.`
    );
  }
}

// 이 프로젝트 루트 package.json 은 "type": "module" 이라, 그대로 두면 Node 가
// engine/stockfish.js 를 ESM 으로 해석해 버린다(엠스크립튼 산출물은 CommonJS).
// 엔진 폴더에만 별도 표시를 남겨 CommonJS 로 읽히게 한다. 브라우저 동작에는 영향이 없다.
async function writeCjsMarker() {
  const dest = join(ENGINE_DIR, "package.json");
  if (existsSync(dest)) {
    console.log("  = package.json (이미 있음)");
    return;
  }
  await writeFile(dest, JSON.stringify({ type: "commonjs" }, null, 2));
  console.log("  + package.json (CommonJS 표시)");
}

async function copyRuntime() {
  if (!existsSync(PKG_DIR)) {
    throw new Error(
      "fairy-stockfish-nnue.wasm 패키지가 없습니다. 먼저 `npm install` 을 실행하세요."
    );
  }
  for (const file of RUNTIME_FILES) {
    const dest = join(ENGINE_DIR, file);
    if (existsSync(dest)) {
      console.log(`  = ${file} (이미 있음)`);
      continue;
    }
    await copyFile(join(PKG_DIR, file), dest);
    const { size } = await stat(dest);
    console.log(`  + ${file} (${mb(size)})`);
  }
}

async function fetchNnue() {
  const dest = join(ENGINE_DIR, NNUE.name);
  if (existsSync(dest)) {
    // 이미 있는 파일도 검사한다. 한 번 받아 두면 몇 달을 그대로 쓰는 파일이라,
    // 처음 받을 때만 보면 그 뒤에 바뀐 것은 영영 모른다. 11MB 해시는 수십 ms 다.
    const bytes = await readFile(dest);
    checkNnue(bytes, NNUE.name);
    console.log(`  = ${NNUE.name} (이미 있음, ${mb(bytes.byteLength)}, 검사값 확인)`);
    return;
  }

  console.log(`  ↓ ${NNUE.name} 내려받는 중... (약 11MB)`);
  const res = await fetch(NNUE.url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`NNUE 다운로드 실패: HTTP ${res.status} ${res.statusText}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  checkNnue(bytes, "내려받은 신경망");

  await writeFile(dest, bytes);
  console.log(`  + ${NNUE.name} (${mb(bytes.byteLength)}, 검사값 확인)`);
}

async function main() {
  await mkdir(ENGINE_DIR, { recursive: true });
  console.log("엔진 자산 준비:");
  await copyRuntime();
  await writeCjsMarker();
  await fetchNnue();
  console.log("완료.");
}

main().catch((err) => {
  console.error("\n[fetch-engine] " + err.message);
  process.exit(1);
});
