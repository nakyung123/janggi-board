// 헤더 한 줄 — 앱 이름 · 모드 탭 ········ 판 상태 · 소리 버튼
//
// 높이가 늘 모드 탭과 같은 40(터치 44)이다. 이 앱은 남는 세로가 곧 판 크기라,
// 헤더에 무엇이 뜨고 져도 줄 높이는 바뀌지 않아야 한다.
//
// 둘 차례·생각 중은 여기서 말하지 않는다. 대국자 카드가 이미 말한다. 헤더에는 판이
// 규칙에 맞지 않을 때(불러온 기보가 이상할 때)만 짧게 "잘못된 판" 을 건다. 360 폰에서
// 앱 이름·탭과 소리 버튼 사이에 남는 자리가 105 라 그보다 긴 말은 두 줄로 떨어진다.

import { Volume2, VolumeX } from "lucide-react";
import { ModeTabs } from "./ModeTabs";
import type { Mode } from "./ModeTabs";

interface Props {
  mode: Mode;
  onMode: (mode: Mode) => void;
  /** 판이 규칙에 맞지 않는 까닭들. 있으면 "잘못된 판" 을 걸고 툴팁에 까닭을 적는다. */
  problems: string[] | null;
  /** 화면 읽기 프로그램에 한 줄로 알릴 판 상태(장군·결과·잘못된 판) */
  spoken: string;
  soundOn: boolean;
  onToggleSound: () => void;
}

const ICON = { size: 20, strokeWidth: 2, "aria-hidden": true } as const;

export function AppHeader({ mode, onMode, problems, spoken, soundOn, onToggleSound }: Props) {
  const soundLabel = soundOn ? "소리 끄기" : "소리 켜기";
  return (
    <header className="top">
      <h1>장기 AI</h1>
      <ModeTabs mode={mode} onMode={onMode} />

      <div className="top-end">
        {problems && (
          <span className="turn-tag" title={problems.join(" ")}>
            잘못된 판
          </span>
        )}
        {/* 착수음·집는 소리·초읽기 소리를 한 번에 켜고 끈다. 고른 값은 브라우저에 남는다. */}
        <button
          type="button"
          className="ghost icon"
          onClick={onToggleSound}
          aria-label={soundLabel}
          title={soundLabel}
        >
          {soundOn ? <Volume2 {...ICON} /> : <VolumeX {...ICON} />}
        </button>
      </div>

      <p className="sr-only" role="status">
        {spoken}
      </p>
    </header>
  );
}
