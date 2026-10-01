// 판 만지기 — 집고, 끌고, 한수쉼
//
// 판에서 손으로 하는 일 전부. 엔진이 알려 준 합법수(legal)를 '이 기물은 어디로 갈 수
// 있나' 로 바꾸고, 누르거나 끄는 동작을 수로 옮긴다.
//
// 수를 실제로 두는 것(pushMove)은 하지 않는다. 받아서 부를 뿐이다 - 수를 두면 기보·시계·
// 소리·저장이 함께 움직이고 그것은 App 의 일이다. 여기는 **무엇을 둘 수 있는가**만 안다.

import { useMemo } from "react";
import { playPickSound } from "../audio/sound";
import type { Position, Square } from "../janggi/board";
import { splitMove } from "../janggi/notation";
import { sideOf } from "../janggi/pieces";

interface Options {
  /** 엔진이 알려 준 이 국면의 합법수(a4a5 꼴). */
  legal: ReadonlySet<string>;
  position: Position;
  /** 집어 든 기물의 자리 */
  selected: Square | null;
  setSelected: (square: Square | null) => void;
  /**
   * 판을 만질 수 있는지. 대국 탭에서 내 차례에만, 판이 끝나기 전까지.
   * 기보 탭은 읽기만 한다.
   */
  canTouch: boolean;
  /** 한 수를 둔다. animate 가 false 면 날리지 않는다(끈 기물은 이미 손으로 옮겼다). */
  pushMove: (from: Square, to: Square, animate?: boolean) => void;
}

export interface BoardTouch {
  /** 집어 든 기물이 갈 수 있는 자리들. 판이 점으로 찍는다. */
  targets: Square[];
  canPick: (square: Square) => boolean;
  onSquareClick: (square: Square) => void;
  onMove: (from: Square, to: Square) => void;
  /**
   * 한수쉼을 둘 자리(궁의 자리). 엔진이 한수쉼을 합법수로 알려 준 때만 있다.
   * 합법수를 받기 전(수를 둔 직후)이나 장군을 받고 있을 때는 없다 - 그동안은 버튼도
   * 잠근다. 잠그지 않으면 눌러도 아무 일이 없다.
   */
  passSquare: Square | null;
  pass: () => void;
}

export function useBoardTouch(options: Options): BoardTouch {
  const { legal, position, selected, setSelected, canTouch, pushMove } = options;

  /** 기물 자리 → 그 기물이 갈 수 있는 자리들. 엔진이 알려 준 합법수에서 만든다. */
  const legalFrom = useMemo(() => {
    const map = new Map<Square, Square[]>();
    for (const move of legal) {
      const { from, to } = splitMove(move);
      if (!from) continue;
      const list = map.get(from) ?? [];
      list.push(to);
      map.set(from, list);
    }
    return map;
  }, [legal]);

  const targets = selected ? (legalFrom.get(selected) ?? []) : [];

  /** 집어 들 수 있는 기물. 둘 차례인 쪽의 기물이고 갈 곳이 있어야 한다. */
  const canPick = (square: Square): boolean => {
    const piece = position.board[square];
    return (
      canTouch &&
      piece !== undefined &&
      sideOf(piece) === position.turn &&
      legalFrom.has(square)
    );
  };

  const passSquare = useMemo(() => {
    const king = Object.entries(position.board).find(
      ([, p]) => p.toLowerCase() === "k" && sideOf(p) === position.turn
    );
    return king && legal.has(king[0] + king[0]) ? king[0] : null;
  }, [position, legal]);

  return {
    targets,
    canPick,
    passSquare,

    /** 눌러서 두기: 기물을 집고, 갈 곳을 누르면 둔다. 집은 기물을 다시 누르면 놓는다. */
    onSquareClick: (square) => {
      if (!canTouch) return;
      if (selected && targets.includes(square)) {
        pushMove(selected, square);
        return;
      }
      if (canPick(square)) {
        const picking = selected !== square;
        setSelected(picking ? square : null);
        // 집을 때도 소리를 낸다. 알을 판에서 살짝 드는 소리라 착수음보다 얕다.
        if (picking) playPickSound();
      } else {
        setSelected(null);
      }
    },

    /** 끌어서 두기. 기물은 손을 따라 이미 도착했으므로 날리지 않는다. */
    onMove: (from, to) => {
      if (!canTouch) return;
      if (legalFrom.get(from)?.includes(to)) pushMove(from, to, false);
      else setSelected(null);
    },

    pass: () => {
      if (passSquare) pushMove(passSquare, passSquare);
    },
  };
}
