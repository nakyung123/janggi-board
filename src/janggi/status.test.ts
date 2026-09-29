// 대국 상태 판정
//
// 장기에는 한수쉼이 있어서 "둘 수가 하나도 없음" 이 외통이 아니다. 엔진은
// 외통에서도 한수쉼 하나는 내놓는다. 그래서 판정 기준이 "장군인데 한수쉼
// 말고는 둘 게 없음" 인데, 이 조건은 한 글자만 틀려도 대국이 안 끝나거나
// 멀쩡한 국면에서 승부가 나 버린다.

import { describe, expect, it } from "vitest";
import { START_FEN, parseFen } from "./board";
import {
  MOVE_LIMIT,
  capturedPieces,
  gameStatus,
  isGameOver,
  outcomeMessage,
  outcomeOf,
  scoreBoard,
  statusMessage,
} from "./status";
import type { GameStatus } from "./status";
import { HAN_DEOM } from "./pieces";

const 국면 = (fen = START_FEN) => parseFen(fen);

/** 판정에 필요한 세 가지를 한 번에 만든다. */
const 입력 = (opts: {
  fen?: string;
  legal: string[];
  checkers?: string[];
  ready?: boolean;
  plies?: number;
  pointsRule?: boolean;
}) => ({
  position: 국면(opts.fen),
  legal: new Set(opts.legal),
  checkers: opts.checkers ?? [],
  ready: opts.ready ?? true,
  plies: opts.plies,
  pointsRule: opts.pointsRule,
});

describe("대국 중", () => {
  it("둘 수가 있으면 대국 중", () => {
    expect(gameStatus(입력({ legal: ["a4a5", "e2e1"] })).kind).toBe("playing");
  });

  it("장군을 맞았어도 피할 수 있으면 장군일 뿐이다", () => {
    const s = gameStatus(입력({ legal: ["e2d2"], checkers: ["e9"] }));
    expect(s.kind).toBe("check");
    expect(isGameOver(s)).toBe(false);
  });

  it("엔진 응답 전에는 판정을 미룬다", () => {
    // 이게 없으면 판을 켜자마자 '수가 없다' 를 외통으로 읽는다
    expect(gameStatus(입력({ legal: [], ready: false })).kind).toBe("playing");
  });
});

describe("외통", () => {
  it("장군인데 한수쉼 말고 둘 게 없으면 외통", () => {
    const s = gameStatus(입력({ legal: ["e2e2"], checkers: ["e9"] }));
    expect(s.kind).toBe("checkmate");
    expect(s).toMatchObject({ loser: "cho", winner: "han" });
    expect(isGameOver(s)).toBe(true);
  });

  it("한수쉼만 남았어도 장군이 아니면 외통이 아니다", () => {
    // 한수쉼은 정상적인 수다. 이걸 외통으로 읽으면 멀쩡한 판이 끝난다.
    expect(gameStatus(입력({ legal: ["e2e2"] })).kind).toBe("playing");
  });

  it("둘 수가 정말 하나도 없으면 수몰", () => {
    const s = gameStatus(입력({ legal: [] }));
    expect(s.kind).toBe("stalemate");
  });

  it("차례인 쪽이 지는 쪽이다", () => {
    const 한차례 = START_FEN.replace(" w ", " b ");
    const s = gameStatus(입력({ fen: 한차례, legal: ["e9e9"], checkers: ["e2"] }));
    expect(s).toMatchObject({ loser: "han", winner: "cho" });
  });
});

describe("성립하지 않는 판", () => {
  it("궁이 없으면 다른 판정보다 먼저 걸린다", () => {
    const s = gameStatus(입력({ fen: "4k4/9/9/9/9/9/9/9/9/9 w - - 0 1", legal: [] }));
    expect(s.kind).toBe("invalid");
  });
});

describe("배너 문구", () => {
  it("상태마다 다른 말이 나온다", () => {
    expect(statusMessage(gameStatus(입력({ legal: ["e2e2"], checkers: ["e9"] })))).toBe(
      "외통 - 한 승"
    );
    expect(statusMessage(gameStatus(입력({ legal: ["e2d2"], checkers: ["e9"] })))).toBe(
      "초 장군"
    );
  });

  it("대국 중에는 배너가 없다", () => {
    expect(statusMessage(gameStatus(입력({ legal: ["a4a5"] })))).toBeNull();
  });
});

describe("기물 점수", () => {
  it("시작 국면에서는 한이 덤만큼 앞선다", () => {
    const s = scoreBoard(국면());
    expect(s.han - s.cho).toBeCloseTo(HAN_DEOM, 5);
    expect(s.leader).toBe("han");
  });

  it("궁은 점수에 들어가지 않는다", () => {
    // 양쪽 궁만 남은 판이면 한의 덤만 남는다
    const s = scoreBoard(국면("4k4/9/9/9/9/9/9/9/4K4/9 w - - 0 1"));
    expect(s.cho).toBe(0);
    expect(s.han).toBe(HAN_DEOM);
  });

  it("차 한 짝을 잃으면 그만큼 벌어진다", () => {
    const 차없음 = START_FEN.replace("RNBA1ABNR", "1NBA1ABNR");
    const before = scoreBoard(국면());
    const after = scoreBoard(국면(차없음));
    expect(before.cho - after.cho).toBe(13);
  });
});

describe("잡힌 기물", () => {
  it("시작 국면에서는 아무것도 안 잡혔다", () => {
    expect(capturedPieces(국면(), "cho")).toEqual([]);
    expect(capturedPieces(국면(), "han")).toEqual([]);
  });

  it("사라진 기물을 찾아낸다", () => {
    const 차없음 = START_FEN.replace("RNBA1ABNR", "1NBA1ABNR");
    expect(capturedPieces(국면(차없음), "cho")).toEqual(["r"]);
  });
});

// 수 제한
//
// 카카오장기에서 온 사람은 200수째에 판이 끝나기를 기대한다. 여기가 어긋나면
// "끝나야 할 판이 안 끝난다" 고 느낀다. 반대로 전통 규칙에는 점수제가 없으므로
// 수 제한으로 갈리면 안 된다. 그리고 그 수가 외통이면 점수가 아니라 외통이다.
describe("수 제한 점수 판정", () => {
  const 보통수 = { legal: ["a4a5", "e2e1"] };

  it("제한 아래에서는 그냥 대국 중이다", () => {
    const s = gameStatus(입력({ ...보통수, plies: MOVE_LIMIT - 1, pointsRule: true }));
    expect(s.kind).toBe("playing");
  });

  it("제한에 닿으면 점수로 갈린다", () => {
    const s = gameStatus(입력({ ...보통수, plies: MOVE_LIMIT, pointsRule: true }));
    expect(s.kind).toBe("points");
    expect(isGameOver(s)).toBe(true);
  });

  it("시작 국면에서는 덤 때문에 한이 앞선다", () => {
    const s = gameStatus(입력({ ...보통수, plies: MOVE_LIMIT, pointsRule: true }));
    if (s.kind !== "points") throw new Error("점수 판정이 아니다");
    // 기물은 같고 한만 1.5 덤을 받는다
    expect(s.han).toBeCloseTo(s.cho + HAN_DEOM, 5);
    expect(s.winner).toBe("han");
  });

  it("전통 규칙에는 점수제가 없어서 수 제한으로 갈리지 않는다", () => {
    const s = gameStatus(입력({ ...보통수, plies: MOVE_LIMIT + 50, pointsRule: false }));
    expect(s.kind).toBe("playing");
  });

  it("제한을 넘겨도 외통이 먼저다", () => {
    // 200수째에 외통이면 점수가 아니라 외통으로 끝나야 한다
    const s = gameStatus(
      입력({ legal: ["e2e2"], checkers: ["e9"], plies: MOVE_LIMIT + 10, pointsRule: true })
    );
    expect(s.kind).toBe("checkmate");
  });

  it("수를 안 넘겨주면 예전처럼 동작한다", () => {
    // pointsRule 만 켜고 plies 를 빼먹어도 대국이 멋대로 끝나면 안 된다
    expect(gameStatus(입력({ ...보통수, pointsRule: true })).kind).toBe("playing");
  });

  it("판정 문구에 점수가 함께 나온다", () => {
    const s = gameStatus(입력({ ...보통수, plies: MOVE_LIMIT, pointsRule: true }));
    const msg = statusMessage(s) ?? "";
    expect(msg).toContain(String(MOVE_LIMIT));
    expect(msg).toContain("점수");
  });
});

describe("대국이 어떻게 끝났나", () => {
  const 진행중: GameStatus = { kind: "playing" };

  it("끝나지 않았으면 null", () => {
    expect(outcomeOf(진행중, null, null)).toBeNull();
    expect(outcomeOf({ kind: "check", side: "cho", by: ["a1"] }, null, null)).toBeNull();
  });

  it("다섯 갈래를 모두 알아본다", () => {
    // 이 다섯을 각자 훑다가 매번 몇 개씩 빠졌다. 하나라도 빠지면 판이
    // 끝났는데 화면이 아무 말도 하지 않는다.
    expect(outcomeOf({ kind: "checkmate", loser: "han", winner: "cho" }, null, null))
      .toEqual({ kind: "checkmate", winner: "cho" });
    expect(outcomeOf({ kind: "stalemate", loser: "han", winner: "cho" }, null, null))
      .toEqual({ kind: "stalemate", winner: "cho" });
    expect(outcomeOf({ kind: "points", winner: "han", cho: 70, han: 72 }, null, null))
      .toEqual({ kind: "points", winner: "han" });
    expect(outcomeOf(진행중, "cho", null)).toEqual({ kind: "resign", winner: "han" });
    expect(outcomeOf(진행중, null, "han")).toEqual({ kind: "flag", winner: "cho" });
  });

  it("기권한 쪽이 지고, 시간을 다 쓴 쪽이 진다", () => {
    // 부호를 뒤집으면 진 사람이 이긴 것으로 적힌다.
    expect(outcomeOf(진행중, "han", null)?.winner).toBe("cho");
    expect(outcomeOf(진행중, null, "cho")?.winner).toBe("han");
  });

  it("기권·시간패가 국면 판정보다 앞선다", () => {
    // 둘은 대국에 붙는 결과라 기보를 되짚는 중에도 그대로여야 한다.
    const 외통: GameStatus = { kind: "checkmate", loser: "han", winner: "cho" };
    expect(outcomeOf(외통, "cho", null)?.kind).toBe("resign");
  });

  it("점수가 같으면 비긴 것으로 둔다", () => {
    const o = outcomeOf({ kind: "points", winner: null, cho: 72, han: 72 }, null, null);
    expect(o?.winner).toBeNull();
    expect(outcomeMessage(o!)).toContain("비겼");
  });

  it("문구에 어떻게 끝났는지가 들어간다", () => {
    expect(outcomeMessage({ kind: "flag", winner: "cho" })).toContain("시간패");
    expect(outcomeMessage({ kind: "resign", winner: "cho" })).toContain("기권");
    expect(outcomeMessage({ kind: "points", winner: "cho" })).toContain(String(MOVE_LIMIT));
  });
});
