// 장군·멍군·빅장 외침 — 판 가운데에 잠깐 떴다 사라지는 한마디
//
// 장군을 부르면 "장군!", 장군을 받은 쪽이 피하면서 되받아 장군을 부르면 "멍군!",
// 두 궁이 마주 보게 되면 "빅장!". 카카오장기처럼 판 위에 크게 띄운다. 무엇을 언제
// 외칠지는 App 이 정하고, 여기는 그리기만 한다.
//
// 판 위에 얹는 것이라 판 SVG 안에 그린다. 그래야 판 크기를 따라 글자도 같이
// 커지고 줄어든다(큰 화면에서는 크게, 폰에서는 작게). 판을 누르는 것을 막지
// 않고, 자리를 차지하지 않는다 - 판 위아래에 배너를 끼우지 않는다는 규칙 그대로다.
//
// 궁의 붉은 테두리와 대국자 카드의 '장군'·'빅장' 칸은 풀릴 때까지 남는다. 이건
// 그 순간을 알리는 것이라 1초 남짓이면 된다. 떴다 사라지는 것은 CSS 가 하고,
// 요소를 걷는 것은 부르는 쪽(App)이 한다.
//
// 글자 크기(판 단위 60)는 글자 크기 규칙(16·20·24) 밖이다. 판 그림의 일부라서
// 판과 함께 늘고 준다. DESIGN.md 에 이 표시만 예외로 적었다.

interface Props {
  text: string;
  /** 판 가운데(판 SVG 좌표) */
  x: number;
  y: number;
}

const W = 250;
const H = 108;

export function CheckCallout({ text, x, y }: Props) {
  return (
    <g className="callout" aria-hidden="true" transform={`translate(${x} ${y})`}>
      <g className="callout-body">
        <rect x={-W / 2} y={-H / 2} width={W} height={H} rx={18} className="callout-box" />
        <text className="callout-text" textAnchor="middle" dominantBaseline="central" y={2}>
          {text}
        </text>
      </g>
    </g>
  );
}
