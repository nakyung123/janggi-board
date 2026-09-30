// 헤더 한 줄 — 앱 이름 · 모드 탭 ········ 판 상태 · 업데이트 내역
//
// 높이가 늘 모드 탭과 같은 40(터치 44)이다. 이 앱은 남는 세로가 곧 판 크기라,
// 헤더에 무엇이 뜨고 져도 줄 높이는 바뀌지 않아야 한다.
//
// 둘 차례·생각 중은 여기서 말하지 않는다. 대국자 카드가 이미 말한다. 헤더에는 판이
// 규칙에 맞지 않을 때(불러온 기보가 이상할 때)만 짧게 "잘못된 판" 을 건다. 360 폰에서
// 앱 이름·탭과 오른쪽 끝 사이에 남는 자리가 105 라 그보다 긴 말은 두 줄로 떨어진다.
//
// 소리 버튼은 뺐다. 켜고 끄고 싶다는 말이 실제로 나오면 그때 두면 된다 - 아직 아무도
// 쓰지 않는 앱에서 헤더 한 칸은 비싸다.

import { ModeTabs } from "./ModeTabs";
import type { Mode } from "./ModeTabs";

interface Props {
  mode: Mode;
  onMode: (mode: Mode) => void;
  /** 판이 규칙에 맞지 않는 까닭들. 있으면 "잘못된 판" 을 건다. 까닭은 화면 읽기 줄(spoken)이 말한다. */
  problems: string[] | null;
  /** 화면 읽기 프로그램에 한 줄로 알릴 판 상태(장군·결과·잘못된 판) */
  spoken: string;
}

export function AppHeader({ mode, onMode, problems, spoken }: Props) {
  return (
    <header className="top">
      <h1>장기 AI</h1>
      <ModeTabs mode={mode} onMode={onMode} />

      <div className="top-end">
        {problems && (
          <span className="turn-tag">잘못된 판</span>
        )}
        {/*
          새 탭으로 연다. 같은 탭에서 옮기면 돌아올 때 엔진을 다시 붙여야 한다
          (13MB 를 다시 받지는 않지만 wasm 초기화는 다시 걸린다). 새 탭이면 두던
          판이 그대로 살아 있다. 지금 버전은 그 쪽 맨 위에 적혀 있다.
        */}
        <a
          className="ver"
          href="/updates/"
          target="_blank"
          rel="noopener noreferrer"
        >
          업데이트 내역
        </a>
      </div>

      <p className="sr-only" role="status">
        {spoken}
      </p>
    </header>
  );
}
