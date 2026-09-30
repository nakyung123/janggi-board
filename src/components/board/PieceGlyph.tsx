// 기물 하나를 그린다 — 큰 판, 기보 목록의 작은 판, 대국자 카드의 잡은 기물이 함께 쓴다.
//
// 초는 초서체, 한은 정자체로 서로 다른 도형을 쓴다(글자 도형은 janggi/glyphs.ts).
//
// 실물 장기알은 상아빛 팔각 나무토막이고, 옆면 두께가 보인다. 그래서 세 겹으로
// 그린다.
//
//   1. 옆면  — 같은 팔각형을 아래로 조금 밀어 어둡게. 이게 두께로 보인다.
//   2. 테  — 위에서 빛을 받는 빗면. 왼쪽 위가 밝고 오른쪽 아래가 어둡다.
//   3. 윗면  — 글자를 새기는 평평한 면.
//
// 그림자(filter)와 빛깔(gradient)은 SVG 안에 미리 정의해 둬야 해서 PieceDefs 로
// 뺐다. 기물을 그리는 <svg> 마다 한 번씩 넣어준다.

import type { PieceChar } from "../../janggi/pieces";
import { sideOf } from "../../janggi/pieces";
import { GLYPHS, glyphTransform } from "../../janggi/glyphs";

export const GLYPH_COLOR = { cho: "#15653c", han: "#c1121f" } as const;

/** 팔각 윤곽. 위아래가 평평하도록 22.5도 돌린 정팔각형이다. */
export function octagon(r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 8) * (2 * i + 1);
    pts.push(`${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

/** 기물을 그리는 svg 라면 어디든 한 번 넣어야 하는 정의들. */
export function PieceDefs() {
  return (
    <>
      {/* 빗면 — 왼쪽 위에서 빛을 받는다 */}
      <linearGradient id="pieceRim" x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0%" stopColor="#fffefa" />
        <stop offset="30%" stopColor="#f7eedb" />
        <stop offset="72%" stopColor="#e4d4b1" />
        <stop offset="100%" stopColor="#cbb68c" />
      </linearGradient>
      {/* 글자를 새기는 윗면 */}
      <linearGradient id="pieceFace" x1="0.2" y1="0" x2="0.8" y2="1">
        <stop offset="0%" stopColor="#fffefb" />
        <stop offset="62%" stopColor="#faf3e4" />
        <stop offset="100%" stopColor="#efe3ca" />
      </linearGradient>
      {/* 바닥에 지는 그림자. 이게 있어야 판 위에 '얹힌' 것처럼 보인다. */}
      <filter id="pieceShadow" x="-35%" y="-35%" width="180%" height="180%">
        <feDropShadow dx="0" dy="1.6" stdDeviation="1.7" floodColor="#3b2a10" floodOpacity="0.42" />
      </filter>
    </>
  );
}

interface GlyphProps {
  piece: PieceChar;
  /** 글자를 앉힐 기물의 반지름 */
  radius: number;
  color?: string;
}

export function PieceGlyph({ piece, radius, color }: GlyphProps) {
  const glyph = GLYPHS[piece];
  return (
    <g
      className="piece-glyph"
      fill={color ?? GLYPH_COLOR[sideOf(piece)]}
      transform={glyphTransform(glyph, radius)}
      pointerEvents="none"
    >
      <g transform={glyph.transform}>
        {glyph.paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </g>
  );
}

interface BodyProps {
  piece: PieceChar;
  radius: number;
  /** 두께를 뺀 납작한 기물. 카드에 잡은 기물을 늘어놓을 때 쓴다. */
  flat?: boolean;
}

/**
 * 팔각 몸통 + 글자. 원점이 기물 한가운데다.
 *
 * flat 은 카드에 잡은 기물을 늘어놓을 때처럼 아주 작게 그릴 때 쓴다. 그 크기에선
 * 빗면도 그림자도 보이지 않으므로, PieceDefs(그라디언트) 없이도 그려지게 한다.
 */
export function PieceBody({ piece, radius, flat }: BodyProps) {
  if (flat) {
    return (
      <>
        <polygon className="piece-rim flat" points={octagon(radius)} />
        <PieceGlyph piece={piece} radius={radius} />
      </>
    );
  }
  return (
    <>
      <polygon
        className="piece-side"
        points={octagon(radius)}
        transform={`translate(0 ${(radius * 0.1).toFixed(2)})`}
      />
      <polygon className="piece-rim" points={octagon(radius)} />
      <polygon className="piece-face" points={octagon(radius * 0.79)} />
      <PieceGlyph piece={piece} radius={radius} />
    </>
  );
}
