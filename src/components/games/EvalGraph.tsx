// 형세 — 지금 보는 국면에서 누가 얼마나 앞서는지
//
// 기보 탭에서 연 판에만 뜬다. 승률("초 69% · 한 31%")과 그 아래 두 색 막대 한 줄.
// 승률은 엔진 점수를 옮긴 어림값이다(janggi/review.ts 의 winChance).
//
// 예전에는 아래에 판 전체의 흐름을 잇는 선 그래프가 있었다. 뺐다 - 수가 많아지면
// 100 폭 안에 점이 빽빽하게 들어차 선이 지저분해지고, 한 수 차이가 1px 도 안 돼서
// '어디서 기울었나' 를 짚으라는 원래 목적이 되레 흐려졌다. 그래프가 겸하던 '그 수로
// 건너뛰기' 는 판 조작 줄의 수 슬라이더가 받았다(BoardControls.tsx) - 수가 몇이든
// 모양이 변하지 않고, 복기를 돌리기 전에도 쓸 수 있다.
//
// 평가치는 복기가 적는다(대국 중에는 엔진이 제 수만 찾고 점수를 매기지 않는다). 그래서
// 복기를 돌리기 전에는 그릴 것이 없어 칸을 띄우지 않는다. 파일로 불러온 기보는 저장할 때의
// 평가치를 그대로 가져온다.

import type { HistoryEntry } from "../../janggi/history";
import { winPercent } from "../../janggi/review";

interface Props {
  history: HistoryEntry[];
  cursor: number;
}

export function EvalGraph({ history, cursor }: Props) {
  const here = history[cursor]?.score;
  if (here === null || here === undefined) return null;

  const cho = winPercent(here);

  return (
    <div className="panel graph">
      <div className="panel-title">
        형세
        <span className="panel-meta win-meta">
          <b className="cho">초 {cho}%</b>
          <span aria-hidden="true"> · </span>
          <b className="han">한 {100 - cho}%</b>
        </span>
      </div>

      <div
        className="win-bar"
        role="img"
        aria-label={`초 ${cho}%, 한 ${100 - cho}%`}
      >
        <i style={{ width: `${cho}%` }} />
      </div>

      <p className="muted small">
        왼쪽이 초 몫입니다. 엔진 점수를 옮긴 어림값입니다.
      </p>
    </div>
  );
}
