// 상차림 (마·상 배치)
//
// 장기는 대국 전에 양쪽이 각자 마와 상의 자리를 고른다.
// 뒷줄에서 자리를 바꿀 수 있는 곳은 한쪽 날개마다 두 자리뿐이다.
//   바깥자리 = 차 옆 (초 기준 b, h)
//   안자리   = 사 옆 (초 기준 c, g)
// 각 날개마다 상을 안/바깥 중 어디에 둘지 고르므로 조합은 정확히 4가지다.
//
// 이름은 뒷줄에 마·상이 놓인 순서를 그대로 읽는다 — 마상상마, 상마마상,
// 마상마상, 상마상마. 장기 앱들이 공통으로 쓰는 표기다. 원앙마·양귀마 같은
// 전통 이름은 그 차림이 어떻게 생겼는지를 말해주지 않아서(장기를 아는 사람만
// 안다) 이름 자리에서 내리고 설명으로 돌렸다.
//
// 읽는 방향은 '자기 왼쪽부터' 다. 초는 아래에 앉으니 a→i, 한은 위에 앉으니
// i→a 로 읽는다. 그래서 같은 차림이면 양쪽이 같은 이름으로 불린다.
//
// 참고: '면상(面象)'은 여기의 다섯 번째 차림이 아니라, 귀마 차림에서 출발해
// 상을 궁 앞 면자리로 올려 세우는 '포진'이다. 그래서 프리셋에는 넣지 않았다.

import type { Board, Square } from "./board";
import { RANKS } from "./board";
import type { Side } from "./pieces";

type Wing = "in" | "out";

export interface Setup {
  id: string;
  /** 뒷줄에 놓이는 순서를 자기 왼쪽부터 읽은 이름 (예: 마상상마) */
  name: string;
  /** 전통 이름 (예: 원앙마) */
  alias: string;
  desc: string;
  left: Wing;
  right: Wing;
}

export const SETUPS: Setup[] = [
  {
    id: "wonang",
    name: "마상상마",
    alias: "원앙마",
    desc: "양쪽 상이 모두 안자리(안상). 마가 바깥에 서서 서로 받쳐주는 수비형.",
    left: "in",
    right: "in",
  },
  {
    id: "yanggwima",
    name: "상마마상",
    alias: "양귀마",
    desc: "양쪽 상이 모두 바깥자리(바깥상). 마 둘이 궁성 귀에 붙는 공격형.",
    left: "out",
    right: "out",
  },
  {
    id: "right-gwima",
    name: "마상마상",
    alias: "오른귀마",
    desc: "오른쪽만 상이 바깥(오른상). 상마상마의 좌우 대칭형.",
    left: "in",
    right: "out",
  },
  {
    id: "left-gwima",
    name: "상마상마",
    alias: "왼귀마",
    desc: "왼쪽만 상이 바깥(왼상). 정석 변화가 가장 풍부한 입문용 차림.",
    left: "out",
    right: "in",
  },
];

/**
 * 각 진영이 자기 시점에서 부르는 '왼쪽/오른쪽'은 서로 반대다.
 * 초는 아래쪽에 앉으므로 a파일이 왼쪽, 한은 위쪽에 앉으므로 i파일이 왼쪽이다.
 */
function slots(side: Side): {
  leftOut: Square;
  leftIn: Square;
  rightIn: Square;
  rightOut: Square;
} {
  const rank = side === "cho" ? 1 : RANKS;
  return side === "cho"
    ? { leftOut: `b${rank}`, leftIn: `c${rank}`, rightIn: `g${rank}`, rightOut: `h${rank}` }
    : { leftOut: `h${rank}`, leftIn: `g${rank}`, rightIn: `c${rank}`, rightOut: `b${rank}` };
}

/** 한 진영의 마·상 자리만 상차림대로 다시 놓는다. 나머지 기물은 건드리지 않는다. */
export function applySetup(board: Board, side: Side, setup: Setup): Board {
  const next = { ...board };
  const s = slots(side);
  const horse = side === "cho" ? "N" : "n";
  const elephant = side === "cho" ? "B" : "b";

  next[s.leftOut] = setup.left === "out" ? elephant : horse;
  next[s.leftIn] = setup.left === "out" ? horse : elephant;
  next[s.rightOut] = setup.right === "out" ? elephant : horse;
  next[s.rightIn] = setup.right === "out" ? horse : elephant;

  return next;
}

/** 현재 판이 어떤 상차림인지 되읽는다. 편집으로 흐트러졌으면 null. */
export function detectSetup(board: Board, side: Side): Setup | null {
  const s = slots(side);
  const elephant = side === "cho" ? "B" : "b";
  const horse = side === "cho" ? "N" : "n";

  const wing = (outSq: Square, inSq: Square): Wing | null => {
    if (board[outSq] === elephant && board[inSq] === horse) return "out";
    if (board[outSq] === horse && board[inSq] === elephant) return "in";
    return null;
  };

  const left = wing(s.leftOut, s.leftIn);
  const right = wing(s.rightOut, s.rightIn);
  if (!left || !right) return null;
  return SETUPS.find((x) => x.left === left && x.right === right) ?? null;
}
