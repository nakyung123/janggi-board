// 공유 링크 — 한 판을 주소 한 줄에 담고, 받은 주소에서 다시 읽는다
//
// 링크는 기보 파일(record.ts)을 줄여 주소의 # 뒤에 담은 것이다. # 뒤는 서버로 가지
// 않고 받은 쪽 브라우저만 읽어서 서버 없이 된다. 받은 쪽은 파일 불러오기와 같은 길
// (readRecord → gameOfRecord → 엔진의 규칙 검사)을 지난다.
//
// 담는 것은 시작 국면, 수순(엔진 좌표), 규칙, 두 사람, 승부뿐이다. 기보 표기는 수순에서
// 다시 만들 수 있고, 평가치·복기는 받은 쪽이 복기를 돌려 얻는다. 이것을 JSON 으로 적어
// deflate 로 줄이고 base64url 로 적는다.
//
//   https://…/#g=1.<base64url>
//
// 앞의 "1." 은 형식 번호다. 담는 모양을 바꾸면 올린다 - 이미 건넨 링크는 옛 번호로 남아 있다.

import { RECORD_FORMAT, readRecord } from "./record";
import type { GameRecord, RecordPlayer, RecordResult } from "./record";

/** 주소 # 뒤의 이름. #g=… */
const KEY = "g";
const VERSION = "1";

const BROKEN = "링크가 깨졌습니다. 주소를 끝까지 복사했는지 확인해 주세요.";

/** 링크에 싣는 모양. 이름을 한 글자로 줄인다 - 주소 길이가 곧 이 글자 수다. */
interface Packed {
  /** 시작 국면(FEN) */
  f: string;
  /** 수순. 엔진 좌표를 빈칸으로 잇는다(예: "c4c5 c7c6") */
  m: string;
  /** 규칙(variant) */
  v: string;
  p: Record<"cho" | "han", RecordPlayer>;
  r: RecordResult;
}

/** 기보를 링크 한 조각으로. 주소 전체는 shareUrl 이 만든다. */
export async function encodeShare(record: GameRecord): Promise<string> {
  const packed: Packed = {
    f: record.startFen,
    m: record.moves.map((m) => m.move).join(" "),
    v: record.variant,
    p: record.players,
    r: record.result,
  };
  const json = new TextEncoder().encode(JSON.stringify(packed));
  const bytes = await pipe(json, new CompressionStream("deflate-raw"));
  return VERSION + "." + toBase64Url(bytes);
}

/**
 * 링크 조각을 기보로. 못 읽으면 까닭을 담은 Error 를 던진다.
 *
 * 받은 링크는 누가 어떻게 고쳤을지 모르는 값이라, 풀어낸 뒤 파일과 같은 검사(readRecord)를
 * 지나게 한다. 수가 규칙에 맞는지는 여기서 모른다 - 엔진이 가린다(App).
 */
export async function decodeShare(payload: string): Promise<GameRecord> {
  const dot = payload.indexOf(".");
  if (dot < 0 || payload.slice(0, dot) !== VERSION) {
    throw new Error("모르는 링크 형식입니다. 이 앱이 만든 링크인지 확인해 주세요.");
  }
  let packed: Partial<Packed> | null;
  try {
    const bytes = await pipe(fromBase64Url(payload.slice(dot + 1)), new DecompressionStream("deflate-raw"));
    packed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error(BROKEN);
  }
  if (!packed || typeof packed !== "object" || typeof packed.m !== "string") {
    throw new Error(BROKEN);
  }
  return readRecord({
    format: RECORD_FORMAT,
    savedAt: "",
    startFen: packed.f,
    moves: packed.m
      .split(" ")
      .filter(Boolean)
      .map((move) => ({ move, notation: "" })),
    variant: packed.v,
    players: packed.p,
    result: packed.r,
  });
}

/** 지금 보고 있는 주소에 링크 조각을 붙인 공유 주소. 원래 붙어 있던 # 뒤는 버린다. */
export function shareUrl(pageUrl: string, payload: string): string {
  return pageUrl.split("#")[0] + "#" + KEY + "=" + payload;
}

/** 주소의 # 부분(location.hash)에서 링크 조각을 꺼낸다. 공유 링크가 아니면 null. */
export function sharePayloadOf(hash: string): string | null {
  const prefix = "#" + KEY + "=";
  return hash.startsWith(prefix) && hash.length > prefix.length ? hash.slice(prefix.length) : null;
}

// --- 바이트 다루기 ------------------------------------------------------------

/** 바이트를 압축·풀기 스트림에 한 번 통과시킨다. */
async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream
): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** 주소에 그대로 쓸 수 있는 base64(+ → -, / → _, 끝의 = 없음). */
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
