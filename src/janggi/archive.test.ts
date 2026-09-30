// 지난 판
//
// 목록은 한 판이 여러 번 들어오고(끝날 때, 복기할 때), 사람이 고칠 수 있는
// 저장소에서 읽힌다. 같은 판이 두 줄로 서거나, 깨진 한 판 때문에 목록이 통째로
// 사라지면 기보 탭이 쓸모없어진다.

import { describe, expect, it } from "vitest";
import { START_FEN } from "./board";
import {
  ARCHIVE_LIMIT,
  isArchivedGame,
  newGameId,
  pageItems,
  readArchive,
  resultTag,
  upsertGame,
  whenLabel,
} from "./archive";
import type { ArchivedGame } from "./archive";
import type { ReviewedMove } from "./review";

const 판 = (patch: Partial<ArchivedGame> = {}): ArchivedGame => ({
  id: "a",
  endedAt: 1_000,
  mySide: "cho",
  levelId: "l16",
  levelName: "16급",
  variant: "janggi",
  result: { kind: "resign", winner: "han" },
  history: [
    { fen: START_FEN, move: null, notation: "시작", mover: null, score: null },
    { fen: START_FEN, move: "a4a5", notation: "71졸61", mover: "cho", score: null },
  ],
  reviewed: null,
  ...patch,
});

describe("목록에 넣기", () => {
  it("새 판이 맨 앞에 선다", () => {
    const list = upsertGame([판({ id: "old", endedAt: 1 })], 판({ id: "new", endedAt: 2 }));
    expect(list.map((g) => g.id)).toEqual(["new", "old"]);
  });

  it("같은 판은 두 줄이 되지 않고 바뀐다", () => {
    // 끝날 때 한 번, 복기를 돌린 뒤 또 한 번 들어온다.
    const first = upsertGame([], 판({ id: "x" }));
    const again = upsertGame(first, 판({ id: "x", reviewed: [] }));
    expect(again).toHaveLength(1);
    expect(again[0].reviewed).toEqual([]);
  });

  it("한도를 넘으면 오래된 판부터 버린다", () => {
    let list: ArchivedGame[] = [];
    for (let i = 0; i < ARCHIVE_LIMIT + 5; i++) {
      list = upsertGame(list, 판({ id: "g" + i, endedAt: i }));
    }
    expect(list).toHaveLength(ARCHIVE_LIMIT);
    expect(list[0].id).toBe(`g${ARCHIVE_LIMIT + 4}`);
    expect(list.some((g) => g.id === "g0")).toBe(false);
  });

  it("판 이름표는 겹치지 않는다", () => {
    let n = 0;
    const rand = () => (n++ % 7) / 7;
    expect(newGameId(5, rand)).not.toBe(newGameId(5, rand));
  });
});

describe("목록에 적을 승부", () => {
  it("내 쪽에서 본다", () => {
    expect(resultTag(판({ mySide: "cho", result: { kind: "resign", winner: "han" } })))
      .toEqual({ text: "기권패", tone: "lose" });
    expect(resultTag(판({ mySide: "han", result: { kind: "resign", winner: "han" } })))
      .toEqual({ text: "기권승", tone: "win" });
  });

  it("끝나는 길마다 말이 다르다", () => {
    const 진 = (kind: ArchivedGame["result"]["kind"]) =>
      resultTag(판({ result: { kind, winner: "han" } })).text;
    expect(진("checkmate")).toBe("외통패");
    expect(진("flag")).toBe("시간패");
    expect(진("points")).toBe("점수패");
    expect(진("stalemate")).toBe("패");
    expect(진("record")).toBe("패");
    expect(진("bikjang")).toBe("빅장패");
    expect(진("passes")).toBe("점수패");
  });

  it("빅장·양쪽 한수쉼으로 끝난 판도 다시 읽힌다", () => {
    // 끝나는 길을 늘리면서 받아 줄 종류 목록을 빠뜨리면, 새로고침할 때 사라진다
    const 빅장 = 판({ id: "b", result: { kind: "bikjang", winner: null } });
    const 쉼 = 판({ id: "p", result: { kind: "passes", winner: "cho" } });
    expect(readArchive([빅장, 쉼]).map((g) => g.id).sort()).toEqual(["b", "p"]);
  });

  it("비긴 판, 그만둔 판", () => {
    expect(resultTag(판({ result: { kind: "points", winner: null } })).text).toBe("무승부");
    expect(resultTag(판({ result: { kind: "abandoned", winner: null } })))
      .toEqual({ text: "중단", tone: "none" });
  });
});

describe("끝난 때", () => {
  const 지금 = new Date(2026, 8, 29, 16, 0).getTime();
  const 전 = (분: number) => 지금 - 분 * 60_000;

  it("가까우면 얼마 전인지", () => {
    expect(whenLabel(전(0), 지금)).toBe("방금 전");
    expect(whenLabel(전(12), 지금)).toBe("12분 전");
    expect(whenLabel(전(3 * 60), 지금)).toBe("3시간 전");
  });

  it("하루가 넘으면 날짜로", () => {
    expect(whenLabel(new Date(2026, 8, 28, 9, 0).getTime(), 지금)).toBe("어제");
    expect(whenLabel(new Date(2026, 7, 28, 9, 0).getTime(), 지금)).toBe("8월 28일");
    expect(whenLabel(new Date(2025, 7, 28, 9, 0).getTime(), 지금)).toBe("2025년 8월 28일");
  });
});

describe("읽어 온 목록", () => {
  it("멀쩡한 판은 그대로", () => {
    expect(isArchivedGame(판())).toBe(true);
    expect(readArchive([판()])).toHaveLength(1);
  });

  it("깨진 한 판 때문에 목록을 버리지 않는다", () => {
    const 깨진 = { ...판({ id: "bad" }), result: { kind: "없는 결과", winner: "cho" } };
    const list = readArchive([판({ id: "ok" }), 깨진, "문자열", null]);
    expect(list.map((g) => g.id)).toEqual(["ok"]);
  });

  it("한 수도 없는 판은 받지 않는다", () => {
    expect(isArchivedGame(판({ history: 판().history.slice(0, 1) }))).toBe(false);
  });

  it("중간에 멈춘 복기는 복기 전으로 읽는다", () => {
    // 수는 하나인데 복기 결과가 없다(빈 목록) - 멈춘 복기가 저장된 판
    expect(readArchive([판({ reviewed: [] })])[0].reviewed).toBeNull();
  });

  it("한자로 적힌 예전 기보 표기는 한글로 읽는다 - 수 목록도 복기 설명도", () => {
    const old = 판({
      history: [
        { fen: START_FEN, move: null, notation: "시작", mover: null, score: null },
        { fen: START_FEN, move: "a4a5", notation: "71卒61", mover: "cho", score: null },
      ],
      reviewed: [
        {
          index: 1, mover: "cho", played: "a4a5", playedNotation: "71卒61",
          best: "b1c3", bestNotation: "02馬83", bestLine: ["02馬83", "12馬33"],
          scoreBefore: 0, scoreAfter: 0, loss: 0.5, grade: "inaccuracy",
          comment: "최선은 02馬83이었습니다.",
        } as unknown as ReviewedMove,
      ],
    });
    const [g] = readArchive([old]);
    expect(g.history[1].notation).toBe("71졸61");
    const r = g.reviewed![0];
    expect([r.playedNotation, r.bestNotation, ...r.bestLine]).toEqual(["71졸61", "02마83", "02마83", "12마33"]);
    // 한 덩어리 설명(comment)이던 예전 복기는 그 문장을 한마디 자리에 둔다
    expect(r.note).toEqual({ verdict: "최선은 02마83이었습니다.", best: null, bestDoes: null, after: null });
    expect("comment" in r).toBe(false);
  });

  it("지금 모양의 복기 설명도 줄마다 한글 표기로 읽는다", () => {
    const [g] = readArchive([
      판({
        reviewed: [
          {
            index: 1, mover: "cho", played: "a4a5", playedNotation: "71졸61",
            best: "b1c3", bestNotation: "02마83", bestLine: [],
            scoreBefore: 0, scoreAfter: 0, loss: 2, grade: "mistake",
            note: { verdict: null, best: "02馬83", bestDoes: null, after: "한이 43兵53으로 졸을 가져갑니다." },
          },
        ],
      }),
    ]);
    expect(g.reviewed![0].note).toEqual({
      verdict: null, best: "02마83", bestDoes: null, after: "한이 43병53으로 졸을 가져갑니다.",
    });
  });

  it("목록이 아니면 빈 목록", () => {
    expect(readArchive({ 판: 1 })).toEqual([]);
    expect(readArchive(null)).toEqual([]);
  });
});

describe("쪽 번호", () => {
  /** 사람이 읽는 모양으로: 1 부터, 줄임표는 … */
  const 줄 = (current: number, total: number) =>
    pageItems(current, total).map((x) => (x === "gap" ? "…" : x + 1)).join(" ");

  it("일곱 쪽까지는 다 보인다", () => {
    expect(줄(0, 1)).toBe("1");
    expect(줄(3, 7)).toBe("1 2 3 4 5 6 7");
  });

  it("앞쪽에서는 앞 다섯을 붙여 보인다", () => {
    expect(줄(0, 9)).toBe("1 2 3 4 5 … 9");
    // 줄임표가 2쪽 하나만 가리게 두지 않는다
    expect(줄(3, 9)).toBe("1 2 3 4 5 … 9");
  });

  it("가운데에서는 앞뒤 하나씩", () => {
    expect(줄(4, 9)).toBe("1 … 4 5 6 … 9");
    expect(줄(6, 12)).toBe("1 … 6 7 8 … 12");
  });

  it("뒤쪽에서는 뒤 다섯을 붙여 보인다", () => {
    expect(줄(5, 9)).toBe("1 … 5 6 7 8 9");
    expect(줄(8, 9)).toBe("1 … 5 6 7 8 9");
  });

  it("칸 수가 늘 일곱이라 넘겨도 줄 폭이 흔들리지 않는다", () => {
    for (let c = 0; c < 25; c++) expect(pageItems(c, 25)).toHaveLength(7);
  });
});
