// 기보 파일 — 밖에서 들어온 것을 어디까지 받아주는가
//
// 이 파일이 다루는 값은 전부 **남이 만들었을 수 있는 것**이다. 기보 파일은 주고받으라고
// 만든 것이라, 받는 쪽에서 거르지 않으면 그대로 화면과 엔진에 흘러든다. 그래서 여기서는
// "멀쩡한 기보가 왕복하는가" 보다 "이상한 기보를 거절하는가" 를 더 많이 본다.

import { describe, expect, it } from "vitest";
import {
  MAX_RECORD_BYTES,
  buildRecord,
  parseRecord,
  readRecordFile,
  recordFileName,
} from "./record";

const START = "rnba1abnr/4k4/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4K4/RNBA1ABNR w - - 0 1";

/** 멀쩡한 기보 하나. 각 테스트에서 한 군데만 바꿔 넣는다. */
function 기보(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format: "janggi-board/2",
    savedAt: "2026-10-01T00:00:00.000Z",
    startFen: START,
    moves: [{ move: "c4c5", notation: "73졸63" }],
    variant: "janggi",
    players: {
      cho: { kind: "human", label: "나" },
      han: { kind: "engine", level: "k6", label: "6급" },
    },
    result: "cho",
    ...over,
  });
}

describe("멀쩡한 기보", () => {
  it("그대로 읽는다", () => {
    const r = parseRecord(기보());
    expect(r.startFen).toBe(START);
    expect(r.moves).toHaveLength(1);
    expect(r.players.han.label).toBe("6급");
    expect(r.result).toBe("cho");
  });

  it("저장했다 읽으면 같은 기보다", () => {
    const made = buildRecord({
      startFen: START,
      moves: [{ move: "c4c5", notation: "73졸63", score: 12 }],
      variant: "janggi",
      players: {
        cho: { kind: "human", label: "나" },
        han: { kind: "engine", level: "k6", label: "6급" },
      },
      result: "han",
    });
    const back = parseRecord(JSON.stringify(made));
    expect(back.moves).toEqual(made.moves);
    expect(back.result).toBe("han");
  });

  it("파일 이름에 날짜와 수를 넣는다", () => {
    const made = buildRecord({
      startFen: START,
      moves: [{ move: "c4c5", notation: "73졸63" }],
      variant: "janggi",
      players: {
        cho: { kind: "human", label: "나" },
        han: { kind: "engine", label: "6급" },
      },
      result: "unfinished",
    });
    expect(recordFileName(made)).toMatch(/^장기기보-\d{8}-\d{4}-1수\.json$/);
  });
});

describe("엔진에 명령을 끼워 넣으려는 기보", () => {
  // UCI 는 줄 단위 프로토콜이라 줄바꿈이 섞이면 명령이 한 줄 더 생긴다.
  // 막는 자리가 셋인데(engine/types.ts·여기·janggi/history.ts) 여기가 사람에게
  // 까닭을 말해 주는 유일한 자리다.
  const 줄바꿈 = String.fromCharCode(10);

  it("국면에 줄바꿈이 섞여 있으면 거절한다", () => {
    expect(() => parseRecord(기보({ startFen: START + 줄바꿈 + "go infinite" }))).toThrow(
      /시작 국면/
    );
  });

  it("수에 줄바꿈이 섞여 있으면 몇 번째 수인지 알려준다", () => {
    const moves = [{ move: "c4c5" }, { move: "a7a6" + 줄바꿈 + "quit" }];
    expect(() => parseRecord(기보({ moves }))).toThrow(/2번째 수/);
  });

  it("수처럼 생기지 않은 글자도 거절한다", () => {
    expect(() => parseRecord(기보({ moves: [{ move: "z9z9" }] }))).toThrow(/1번째 수/);
  });
});

describe("너무 큰 기보", () => {
  it("한도를 넘는 파일은 읽기도 전에 거절한다", async () => {
    // File.text() 는 통째로 메모리에 올린다. 크기를 먼저 보지 않으면
    // 받아들일지 판단하기도 전에 탭이 멈춘다.
    const big = new File(["x".repeat(MAX_RECORD_BYTES + 1)], "big.json");
    await expect(readRecordFile(big)).rejects.toThrow(/너무 큽니다/);
  });

  it("한도 안의 파일은 읽는다", async () => {
    const ok = new File([기보()], "ok.json");
    await expect(readRecordFile(ok)).resolves.toMatchObject({ startFen: START });
  });

  it("수가 1000을 넘으면 거절한다", () => {
    const moves = Array.from({ length: 1001 }, () => ({ move: "c4c5" }));
    expect(() => parseRecord(기보({ moves }))).toThrow(/수가 너무 많습니다/);
  });
});

describe("화면에 찍히는 글자", () => {
  // React 가 글자를 이스케이프해 주므로 스크립트가 끼어들지는 못한다.
  // 막아 주지 않는 것은 **길이**다. 이름 하나가 10만 자면 목록이 무너진다.
  const 긴글 = "가".repeat(5000);

  it("이름이 너무 길면 기보는 받되 이름만 '사람' 으로 돌린다", () => {
    const players = {
      cho: { kind: "human", label: 긴글 },
      han: { kind: "engine", level: 긴글, label: "6급" },
    };
    const r = parseRecord(기보({ players }));
    expect(r.players.cho.label).toBe("사람");
    expect(r.players.han.level).toBeUndefined();
  });

  it("메모와 규칙 이름이 너무 길면 버린다", () => {
    const r = parseRecord(기보({ note: 긴글, variant: 긴글 }));
    expect(r.note).toBeUndefined();
    expect(r.variant).toBe("janggi");
  });

  it("기보 표기가 너무 길면 거절한다", () => {
    // 표기는 수순에서 다시 만들지만, 둘 수 없는 수의 오류 글에는 파일의 표기가 들어간다.
    expect(() => parseRecord(기보({ moves: [{ move: "c4c5", notation: 긴글 }] }))).toThrow(
      /1번째 수의 표기/
    );
  });
});

describe("기보가 아닌 것", () => {
  it("JSON 이 아니면 그렇게 말한다", () => {
    expect(() => parseRecord("{깨짐")).toThrow(/JSON/);
  });

  it("모르는 형식이면 무슨 형식이었는지 알려준다", () => {
    expect(() => parseRecord(기보({ format: "pgn/1" }))).toThrow(/pgn\/1/);
  });

  it("형식 표시가 아예 없으면 '표시 없음'", () => {
    expect(() => parseRecord(JSON.stringify({}))).toThrow(/표시 없음/);
  });

  it("수순 목록이 없으면 그렇게 말한다", () => {
    expect(() => parseRecord(기보({ moves: "없음" }))).toThrow(/수순 목록/);
  });

  it("급수와 결과가 없던 첫 형식도 읽는다", () => {
    const r = parseRecord(기보({ format: "janggi-board/1", players: undefined }));
    expect(r.players.cho.label).toBe("사람");
    expect(r.result).toBe("cho");
  });
});
