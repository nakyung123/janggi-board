// 엔진 자산 준비 스크립트
//
// 1) node_modules 의 fairy-stockfish-nnue.wasm 런타임 파일을 public/engine 으로 복사
// 2) 장기 전용 NNUE 신경망(11MB)을 내려받아 압축해서(5.7MB) public/engine 에 저장
// 3) 라이선스 전문을 public/licenses 로 복사 (GPL v3 전문·그 밖의 라이선스 모음·엔진 저작자)
//
// 두 자산 모두 용량이 커서 저장소에 커밋하지 않는다(.gitignore 등록).
// 이미 받아둔 파일이 있으면 건너뛰므로 predev/prebuild 에서 매번 돌려도 부담이 없다.

import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { mkdir, copyFile, writeFile, readFile, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE_DIR = join(ROOT, "public", "engine");
const LICENSE_DIR = join(ROOT, "public", "licenses");
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

/*
 * 신경망은 **압축해서** 둔다. 11.26MB → 5.74MB, 방문자마다 그만큼 덜 받는다.
 *
 * 푸는 쪽은 브라우저다(src/engine/engine.ts 의 fetchNnue). 서버가 Content-Encoding 을
 * 붙여 주기를 기다리지 않는 까닭은 그쪽 글에 적어 뒀다 - 한 줄로 줄이면, 그러면 동작이
 * 호스트 설정에 달린다.
 *
 * public/ 아래는 통째로 dist/ 로 복사되므로 **압축본 하나만** 남긴다. 원본을 같이 두면
 * 아무도 받지 않는 11MB 가 배포본에 끼어든다.
 *
 * 이름 끝이 `.bin` 인 까닭 — `.gz` 로 뒀더니 vite preview 가 보자마자
 * `Content-Encoding: gzip` 을 붙여서 브라우저가 먼저 풀어 버렸다. `.bin` 이면 아무도
 * 손대지 않는다. 가운데 `.gz` 는 사람이 보라고 남긴다.
 */
const NNUE_GZ = NNUE.name + ".gz.bin";

/*
 * 한 번 받아 검사까지 마친 신경망을 여기에 하나 더 둔다(압축본).
 *
 * 배포 서버는 빌드마다 빈 폴더에서 시작하므로 public/engine 에는 늘 아무것도 없고, 그래서
 * 배포할 때마다 남의 구글 드라이브에서 11MB 를 새로 받았다. 그 링크가 한 번 빈 응답을
 * 돌려주자 빌드가 통째로 실패했다. node_modules 아래는 Vercel 이 다음 빌드로 넘겨주므로
 * (빌드 캐시), 여기 두면 한 번 받은 뒤로는 드라이브에 가지 않는다.
 *
 * 캐시도 믿지 않는다 - 꺼내 쓸 때마다 검사값을 다시 본다.
 */
const CACHE_DIR = join(ROOT, "node_modules", ".cache", "janggi-engine");

/** 받기를 몇 번까지 해 볼지와, 다시 하기 전에 쉬는 시간(ms). */
const DOWNLOAD_WAITS = [3_000, 10_000];
const DOWNLOAD_TIMEOUT_MS = 60_000;

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

/** 검사를 마친 신경망을 압축해서 저장한다. 11MB 기준 3초쯤 걸리고, 한 번만 한다. */
async function packNnue(bytes, dest) {
  const packed = gzipSync(bytes, { level: 9 });
  await writeFile(dest, packed);
  console.log(
    `  + ${NNUE_GZ} (${mb(bytes.byteLength)} → ${mb(packed.byteLength)}, 검사값 확인)`
  );
}

/** 검사를 마친 압축본을 빌드 캐시에도 둔다. 못 써도 빌드는 계속한다 - 없으면 다음에 다시 받을 뿐이다. */
async function saveToCache(gzPath) {
  const cached = join(CACHE_DIR, NNUE_GZ);
  if (existsSync(cached)) return;
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await copyFile(gzPath, cached);
  } catch (err) {
    console.warn(`  ! 빌드 캐시에 두지 못했습니다: ${err.message}`);
  }
}

/** 빌드 캐시에 검사를 통과하는 압축본이 있으면 꺼내 쓴다. 꺼냈으면 true. */
async function restoreFromCache(gzPath) {
  const cached = join(CACHE_DIR, NNUE_GZ);
  if (!existsSync(cached)) return false;
  try {
    const packed = await readFile(cached);
    checkNnue(gunzipSync(packed), "빌드 캐시의 신경망");
    await copyFile(cached, gzPath);
    console.log(`  + ${NNUE_GZ} (빌드 캐시에서, ${mb(packed.byteLength)}, 검사값 확인)`);
    return true;
  } catch (err) {
    // 깨진 캐시는 버리고 새로 받는다. 캐시 때문에 빌드가 멈추면 안 된다.
    console.warn(`  ! 빌드 캐시를 쓰지 못해 새로 받습니다: ${err.message.split("\n")[0]}`);
    await rm(cached, { force: true });
    return false;
  }
}

/** 한 번 받아 검사까지 한다. 응답이 이상하면 던진다. */
async function downloadNnue() {
  const res = await fetch(NNUE.url, {
    redirect: "follow",
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`NNUE 다운로드 실패: HTTP ${res.status} ${res.statusText}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  checkNnue(bytes, "내려받은 신경망");
  return bytes;
}

/*
 * 받다가 어긋나면 쉬었다가 다시 받는다.
 *
 * 구글 드라이브는 가끔 파일 대신 빈 응답이나 안내 쪽을 돌려준다(배포 서버에서 실제로
 * 겪었다 - 30초 뒤 0.00MB). 잠깐 뒤에는 멀쩡히 주므로 한 번 실패로 빌드를 버리지 않는다.
 * 끝까지 안 되면 마지막 까닭을 그대로 올린다.
 */
async function downloadNnueWithRetry() {
  for (let attempt = 0; ; attempt++) {
    try {
      return await downloadNnue();
    } catch (err) {
      const wait = DOWNLOAD_WAITS[attempt];
      if (wait === undefined) throw err;
      console.warn(
        `  ! 받기 실패(${attempt + 1}번째): ${err.message.split("\n")[0]} - ${wait / 1000}초 뒤 다시 받습니다.`
      );
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

async function fetchNnue() {
  const gzPath = join(ENGINE_DIR, NNUE_GZ);
  const rawPath = join(ENGINE_DIR, NNUE.name);

  if (existsSync(gzPath)) {
    // 이미 있는 파일도 검사한다. 한 번 받아 두면 몇 달을 그대로 쓰는 파일이라,
    // 처음 받을 때만 보면 그 뒤에 바뀐 것은 영영 모른다. 풀고 해시까지 수백 ms 다.
    const packed = await readFile(gzPath);
    checkNnue(gunzipSync(packed), NNUE_GZ);
    console.log(`  = ${NNUE_GZ} (이미 있음, ${mb(packed.byteLength)}, 검사값 확인)`);
    await saveToCache(gzPath);
    return;
  }

  // 압축하기 전에 받아 둔 원본이 있으면 다시 받지 않는다. 같은 11MB 를 또 받을 까닭이
  // 없다. 압축본을 만들고 원본은 지운다 - 배포본에 둘 다 실리지 않게.
  if (existsSync(rawPath)) {
    const bytes = await readFile(rawPath);
    checkNnue(bytes, NNUE.name);
    await packNnue(bytes, gzPath);
    await rm(rawPath);
    console.log(`  - ${NNUE.name} (압축본으로 갈음)`);
    await saveToCache(gzPath);
    return;
  }

  if (await restoreFromCache(gzPath)) return;

  console.log(`  ↓ ${NNUE.name} 내려받는 중... (약 11MB)`);
  const bytes = await downloadNnueWithRetry();
  await packNnue(bytes, gzPath);
  await saveToCache(gzPath);
}

/*
 * 라이선스 전문을 배포본에 싣는다.
 *
 * GPL v3(엔진과 이 앱)·MIT·ISC(React·아이콘)·OFL 1.1(글꼴)이 모두 **배포물에 저작권
 * 표시와 라이선스 글이 따라붙을 것**을 요구한다. 그런데 번들러는 주석을 지워서 빌드된
 * 파일에는 한 줄도 남지 않는다. public/ 아래 것만 dist/ 로 그대로 복사되므로 여기로
 * 옮겨 둔다.
 *
 * 손으로 복사해 두면 반드시 어긋난다. 원본은 설치된 패키지 안의 파일이고, 여기서 만든
 * 사본은 .gitignore 로 제외한다 - 패키지를 올리면 사본도 따라 바뀐다.
 *
 * 무엇을 썼는지 적은 짧은 글(NOTICE.md)은 여기서 옮기지 않는다. 앱이 번들에 넣어 고지
 * 창으로 보여 준다(src/components/layout/NoticeDialog.tsx).
 */
async function copyNotices() {
  await mkdir(LICENSE_DIR, { recursive: true });
  const 할일 = [
    // GPL v3 전문. 엔진과 이 앱이 같은 라이선스라 한 벌이면 된다. 전부 ASCII 다.
    [join(PKG_DIR, "Copying.txt"), join(LICENSE_DIR, "GPL-3.0.txt")],
    // 엔진 저작자 목록. GPL 이 바라는 모양대로 엔진 파일 옆에 둔다.
    [join(PKG_DIR, "AUTHORS"), join(ENGINE_DIR, "AUTHORS")],
  ];
  for (const [from, to] of 할일) {
    if (!existsSync(from)) throw new Error(`고지 원본이 없습니다: ${from}`);
    await copyFile(from, to);
    const { size } = await stat(to);
    console.log(`  + ${to.slice(ROOT.length + 1).replaceAll("\\", "/")} (${mb(size)})`);
  }
  await writeThirdParty();
  // 예전에는 NOTICE.md 를 쪽으로 만들어 여기 뒀다. 받아 둔 폴더에 남아 있으면 지운다 -
  // public/ 은 통째로 배포본에 들어가므로, 남겨 두면 아무도 잇지 않는 옛 글이 같이 올라간다.
  await rm(join(LICENSE_DIR, "index.html"), { force: true });
}

/*
 * 번들에 함께 실리는 패키지들의 라이선스 전문을 한 파일로 모은다.
 *
 * 머리말을 영어로만 적는 까닭 - 서버가 `Content-Type: text/plain` 만 보내고 charset 을
 * 안 붙이면 브라우저가 UTF-8 로 읽지 않아 한글이 깨진다(실제로 겪었다). 어디에 올리든
 * 읽히게 ASCII 만 쓴다. 패키지의 글에 다른 글자가 섞여 있으면 여기서 멈춘다.
 */
const THIRD_PARTY = [
  ["React (react, react-dom, scheduler)", "react/LICENSE"],
  ["Lucide (lucide-react)", "lucide-react/LICENSE"],
  ["Pretendard (pretendard)", "pretendard/dist/LICENSE.txt"],
  ["Vercel Analytics (@vercel/analytics)", "@vercel/analytics/LICENSE"],
];

async function writeThirdParty() {
  const rule = "=".repeat(72);
  const parts = [
    "Third-party software bundled with Janggi AI, with the license of each.",
    "The engine (Fairy-Stockfish, GPL v3) is covered by GPL-3.0.txt and /engine/AUTHORS.",
  ];
  for (const [name, file] of THIRD_PARTY) {
    const from = join(ROOT, "node_modules", file);
    if (!existsSync(from)) throw new Error(`고지 원본이 없습니다: ${from}`);
    const text = (await readFile(from, "utf8")).replaceAll("\r\n", "\n").trim();
    parts.push([rule, name, rule, "", text].join("\n"));
  }
  const body = parts.join("\n\n") + "\n";
  const odd = body.match(/[^\x00-\x7F]/);
  if (odd) {
    throw new Error(
      `third-party.txt 에 ASCII 가 아닌 글자가 있습니다: "${odd[0]}". 글자가 깨질 수 있습니다.`
    );
  }
  const dest = join(LICENSE_DIR, "third-party.txt");
  await writeFile(dest, body, "utf8");
  console.log(`  + public/licenses/third-party.txt (${mb(Buffer.byteLength(body))})`);
}

async function main() {
  await mkdir(ENGINE_DIR, { recursive: true });
  console.log("엔진 자산 준비:");
  await copyRuntime();
  await writeCjsMarker();
  await fetchNnue();
  console.log("라이선스 고지:");
  await copyNotices();
  console.log("완료.");
}

main().catch((err) => {
  console.error("\n[fetch-engine] " + err.message);
  process.exit(1);
});
