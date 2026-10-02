// 장기 기보 표기법
//
// 엔진은 체스식 좌표(a1~i10)를 쓰지만, 장기 기보는 숫자 두 자리를 쓴다.
//   세로줄: 왼쪽부터 1~9
//   가로줄: 위에서부터 1~9, 마지막 열째 줄은 0
//   좌표는 '가로줄 먼저, 세로줄 나중' 순서로 읽는다.
// 그래서 초의 궁 자리는 95, 한의 궁 자리는 25가 된다.
// 기보 한 수는 "출발좌표 기물명 도착좌표" 로 적는다. 예) 03마84
//
// 기물명은 한글이다(차·포·마·상·사·졸·병·궁). 한자(車·馬…)로 적으면 앱 글꼴(Pretendard)에
// 없는 글자라 기기마다 다른 글꼴로 그려진다. 한자는 판 위 기물에만 새긴다(글꼴이 아니라 그림).

import type { Board } from "./board";
import { fileIdxOf, rankOf } from "./board";
import { pieceInfo, sideOf } from "./pieces";
import { 을를 } from "./korean";

/** 엔진 좌표(a1~i10) → 장기 좌표 두 자리 문자열 */
export function toJanggiCoord(square: string): string {
  const file = fileIdxOf(square) + 1; // a=1 … i=9
  const rank = 11 - rankOf(square); // 엔진의 10단이 장기의 1번 가로줄
  return `${rank % 10}${file}`; // 열째 줄은 0으로 적는다
}

/** 엔진 좌표 수를 출발/도착으로 쪼갠다. i10 처럼 세 글자 좌표가 섞여 있다. */
export function splitMove(move: string): { from: string; to: string } {
  const m = move.match(/^([a-i](?:10|[1-9]))([a-i](?:10|[1-9]))/);
  if (!m) return { from: "", to: "" };
  return { from: m[1], to: m[2] };
}

/**
 * 엔진 좌표로 적힌 수인지. 앞뒤에 아무것도 더 붙지 않아야 한다.
 *
 * splitMove 와 달리 **전체가** 맞아야 참이다. 밖에서 들어온 값(기보 파일, 브라우저에
 * 남아 있던 값)을 엔진에 넘기기 전에 거른다 - 수 문자열이 그대로 UCI 명령 줄에 들어가서,
 * 줄바꿈이 섞여 있으면 명령이 한 줄 더 생긴다(engine/types.ts 의 positionCommand).
 */
export function isMoveString(move: string): boolean {
  return /^[a-i](?:10|[1-9])[a-i](?:10|[1-9])$/.test(move);
}

/**
 * 판에 화살표로 그릴 수 있는 수. 한수쉼(제자리)이나 읽을 수 없는 수는 null.
 * 직전 수 표시, 기보에 마우스를 올린 수, 복기의 뒀어야 할 수가 쓴다.
 */
export function arrowOf(move: string | null): { from: string; to: string } | null {
  if (!move) return null;
  const { from, to } = splitMove(move);
  if (!from || !to || from === to) return null;
  return { from, to };
}

export interface MoveNotation {
  /** 기보용 짧은 표기. 예) 03마84 */
  short: string;
  /** 읽기용 긴 표기. 예) 03 마 → 84 */
  long: string;
  from: string;
  to: string;
  /** 잡은 기물의 한글 이름 */
  captured: string | null;
  /**
   * 좌표를 모르는 사람도 읽을 수 있게 풀어 쓴 말. 예) "차를 앞으로 1칸 옮겼습니다."
   *
   * 기보 표기(59차69)는 좌표를 읽을 줄 알아야 뜻이 생긴다. 장기를 처음 보는 사람에게는
   * 네 자리 숫자일 뿐이라, 복기가 무슨 수를 말하는지부터 막힌다.
   */
  plain: string;
}

/**
 * 한 수를 진영 기준으로 풀어 쓴다.
 *
 * '위/아래' 가 아니라 '앞/뒤' 로 적는다. 판은 뒤집을 수 있어서 위아래가 보는 사람마다
 * 다르지만, 앞뒤는 둔 쪽이 정해지면 하나로 정해진다. 초는 가로줄 번호가 작아지는 쪽이
 * (한 진영 쪽이) 앞이고, 한은 반대다.
 */
function plainMove(
  from: string,
  to: string,
  side: "cho" | "han",
  piece: string,
  captured: string | null
): string {
  // 엔진 좌표의 rank 는 아래(초 뒷줄)가 1, 위(한 뒷줄)가 10이다.
  const dRank = rankOf(to) - rankOf(from);
  const dFile = fileIdxOf(to) - fileIdxOf(from);
  const 앞 = side === "cho" ? dRank : -dRank;
  const 오른 = side === "cho" ? dFile : -dFile;

  const 걸음: string[] = [];
  if (앞 !== 0) 걸음.push(`${앞 > 0 ? "앞으로" : "뒤로"} ${Math.abs(앞)}칸`);
  if (오른 !== 0) 걸음.push(`${오른 > 0 ? "오른쪽으로" : "왼쪽으로"} ${Math.abs(오른)}칸`);

  const 움직임 = 걸음.join(" ");
  // 을를 은 낱말까지 함께 돌려준다("사" → "사를"). 낱말을 앞에 또 붙이면 "사사를" 이 된다.
  if (captured) return `${을를(piece)} ${움직임} 옮겨 ${을를(captured)} 잡았습니다.`;
  return `${을를(piece)} ${움직임} 옮겼습니다.`;
}

/** 두기 직전의 판을 기준으로 한 수를 기보로 옮긴다. */
export function describeMove(move: string, before: Board): MoveNotation {
  const { from, to } = splitMove(move);
  const piece = before[from];

  if (!piece) {
    return { short: move, long: move, from, to, captured: null, plain: move };
  }

  if (from === to) {
    return {
      short: "한수쉼",
      long: "한수쉼",
      from,
      to,
      captured: null,
      plain: "한수쉼 - 궁을 제자리에 두었습니다.",
    };
  }

  const info = pieceInfo(piece);
  const target = before[to];
  const captured =
    target && sideOf(target) !== sideOf(piece) ? pieceInfo(target).name : null;

  const a = toJanggiCoord(from);
  const b = toJanggiCoord(to);

  return {
    short: `${a}${info.name}${b}`,
    long: `${a} ${info.name} → ${b}${captured ? ` (${captured} 잡음)` : ""}`,
    from,
    to,
    captured,
    plain: plainMove(from, to, sideOf(piece), info.name, captured),
  };
}

const HANGUL_OF: Record<string, string> = {
  車: "차", 包: "포", 馬: "마", 象: "상", 士: "사", 卒: "졸", 兵: "병", 楚: "궁", 漢: "궁",
};

/**
 * 한자로 적힌 예전 기보 표기(73卒63)를 지금 표기(73졸63)로.
 *
 * 브라우저에 남은 지난 판·두던 판에는 예전 표기가 그대로 들어 있다(2026-09-30 까지 둔 판).
 * 읽을 때 한 번 거친다(예전 복기는 표기를 고치지 않고 복기 전으로 읽는다 - archive.ts). 한자는 기보 표기에만 들어가므로 글자만 바꾸면 되고,
 * 표기는 숫자로 끝나서 뒤에 붙은 조사(이었/였)도 그대로 맞다.
 */
export function hangulNotation(text: string): string {
  return text.replace(/[車包馬象士卒兵楚漢]/g, (c) => HANGUL_OF[c]);
}
