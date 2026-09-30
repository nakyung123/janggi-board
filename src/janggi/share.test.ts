import { describe, expect, it } from "vitest";
import { nextEntry, startHistory } from "./history";
import { splitMove } from "./notation";
import { buildRecord, gameOfRecord } from "./record";
import type { GameRecord } from "./record";
import { decodeShare, encodeShare, sharePayloadOf, shareUrl } from "./share";

const START = "rnba1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR w - - 0 1";
const MOVES = ["c4c5", "c7c6", "e4e5", "e7e6", "b1c3", "b10c8"];

/** 대국 탭에서 둔 것처럼 수마다 표기를 만들고 평가치를 붙인 기보. */
function recordOf(moves: string[]): GameRecord {
  const history = startHistory(START);
  for (const m of moves) {
    const { from, to } = splitMove(m);
    history.push(nextEntry(history[history.length - 1].fen, from, to));
  }
  return buildRecord({
    startFen: START,
    moves: history.slice(1).map((h) => ({ move: h.move!, notation: h.notation, score: 0.5 })),
    variant: "janggimodern",
    players: {
      cho: { kind: "human", label: "나" },
      han: { kind: "engine", level: "12", label: "12급" },
    },
    result: "han",
  });
}

describe("공유 링크", () => {
  it("링크로 만들었다 되읽으면 수순·규칙·두 사람·승부가 같다", async () => {
    const record = recordOf(MOVES);
    const back = await decodeShare(await encodeShare(record));
    expect(back.startFen).toBe(START);
    expect(back.moves.map((m) => m.move)).toEqual(MOVES);
    expect(back.variant).toBe("janggimodern");
    expect(back.players).toEqual(record.players);
    expect(back.result).toBe("han");
  });

  it("기보 표기는 싣지 않고 받은 쪽이 수순에서 다시 만든다 - 평가치는 건네지 않는다", async () => {
    const record = recordOf(MOVES);
    const game = gameOfRecord(await decodeShare(await encodeShare(record)));
    expect(game.history.slice(1).map((h) => h.notation)).toEqual(record.moves.map((m) => m.notation));
    expect(game.history.every((h) => h.score === null)).toBe(true);
  });

  it("잘린 링크는 까닭을 말하고 거절한다", async () => {
    const payload = await encodeShare(recordOf(MOVES));
    await expect(decodeShare(payload.slice(0, payload.length / 2))).rejects.toThrow(/깨졌습니다/);
  });

  it("모르는 형식 번호는 거절한다", async () => {
    const payload = await encodeShare(recordOf(MOVES));
    await expect(decodeShare("2" + payload.slice(1))).rejects.toThrow(/모르는 링크 형식/);
    await expect(decodeShare("abc")).rejects.toThrow(/모르는 링크 형식/);
  });

  it("주소를 만들 때 원래 # 뒤는 버리고, 받은 주소에서 그 조각을 되찾는다", () => {
    const url = shareUrl("https://example.com/janggi/?x=1#g=old", "1.abc");
    expect(url).toBe("https://example.com/janggi/?x=1#g=1.abc");
    expect(sharePayloadOf(new URL(url).hash)).toBe("1.abc");
    expect(sharePayloadOf("")).toBeNull();
    expect(sharePayloadOf("#g=")).toBeNull();
    expect(sharePayloadOf("#other=1")).toBeNull();
  });

  it("200수 판도 주소가 1,200자를 넘지 않는다", async () => {
    // 줄이기 어렵게 수를 뒤섞는다(같은 수가 되풀이되면 더 짧아진다).
    const files = "abcdefghi";
    let seed = 7;
    const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) % n);
    const sq = () => files[rand(9)] + (rand(10) + 1);
    const moves = Array.from({ length: 200 }, () => ({ move: sq() + sq(), notation: "" }));
    const record = { ...recordOf([]), moves };
    const url = shareUrl("https://example.com/", await encodeShare(record));
    expect(url.length).toBeLessThan(1200);
  });
});
