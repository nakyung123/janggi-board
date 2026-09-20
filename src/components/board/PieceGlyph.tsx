// 기물 글자 하나를 그린다.
//
// 장기판과 편집 팔레트가 같은 글자를 써야 해서 따로 뺐다.
// 초는 초서체, 한은 정자체로 서로 다른 도형을 쓴다.

import type { PieceChar } from "../../janggi/pieces";
import { sideOf } from "../../janggi/pieces";
import { GLYPHS, glyphTransform } from "../../janggi/glyphs";

export const GLYPH_COLOR = { cho: "#15653c", han: "#b91c1c" } as const;

interface Props {
  piece: PieceChar;
  /** 글자를 앉힐 기물의 반지름 */
  radius: number;
  color?: string;
}

export function PieceGlyph({ piece, radius, color }: Props) {
  const glyph = GLYPHS[piece];
  return (
    <g
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
