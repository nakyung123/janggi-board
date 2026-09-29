// 엔진 설정 (분석 모드 전용)
//
// 스레드와 해시를 올리면 같은 시간에 더 깊이 본다. 브라우저에서는 코어 수만큼
// 스레드를 쓰는 게 보통 가장 빠르지만, 화면이 버벅이면 하나 줄이는 편이 낫다.
//
// 여기는 '분석을 얼마나 깊게 할까' 만 다룬다. 상대를 몇 급으로 할지, 어떤
// 규칙으로 둘지는 대국 탭에 있다. 규칙은 승부가 어떻게 갈리는지를 정하는
// 대국 설정이지 엔진 손잡이가 아니다. 두 가지가 한 화면에 섞여 있으면
// 무엇을 만지는 건지 헷갈린다.

import type { EngineOptions, SearchLimits } from "../../engine/types";

interface Props {
  options: EngineOptions;
  limits: SearchLimits;
  analysisOn: boolean;
  onOptions: (patch: Partial<EngineOptions>) => void;
  onLimits: (patch: Partial<SearchLimits>) => void;
  onAnalysisOn: (on: boolean) => void;
}

const maxThreads = Math.max(1, Math.min(navigator.hardwareConcurrency || 2, 16));

export function EngineControls(props: Props) {
  const {
    options,
    limits,
    analysisOn,
    onOptions,
    onLimits,
    onAnalysisOn,
  } = props;

  return (
    <div className="panel controls">
      <div className="panel-title">엔진</div>

      <label className="row toggle">
        <input
          type="checkbox"
          checked={analysisOn}
          onChange={(e) => onAnalysisOn(e.target.checked)}
        />
        <span>실시간 분석</span>
      </label>

      <div className="row">
        <span className="label">
          후보수 <b>{options.multiPV}</b>
        </span>
        <input
          type="range"
          min={1}
          max={8}
          value={options.multiPV}
          onChange={(e) => onOptions({ multiPV: Number(e.target.value) })}
        />
      </div>

      <div className="row">
        <span className="label">
          스레드 <b>{options.threads}</b>
        </span>
        <input
          type="range"
          min={1}
          max={maxThreads}
          value={options.threads}
          onChange={(e) => onOptions({ threads: Number(e.target.value) })}
        />
      </div>

      <div className="row">
        <span className="label">
          해시 <b>{options.hashMb}MB</b>
        </span>
        <input
          type="range"
          min={16}
          max={1024}
          step={16}
          value={options.hashMb}
          onChange={(e) => onOptions({ hashMb: Number(e.target.value) })}
        />
      </div>

      <div className="row stacked">
        <span className="label">생각 시간</span>
        <div className="seg">
          {([500, 1000, 3000, 10000] as const).map((ms) => (
            <button
              key={ms}
              type="button"
              className={
                !limits.infinite && limits.movetimeMs === ms ? "active" : ""
              }
              onClick={() =>
                onLimits({ movetimeMs: ms, depth: undefined, infinite: false })
              }
            >
              {ms / 1000}초
            </button>
          ))}
          <button
            type="button"
            className={limits.infinite ? "active" : ""}
            onClick={() =>
              onLimits({ infinite: true, movetimeMs: undefined, depth: undefined })
            }
          >
            무제한
          </button>
        </div>
      </div>

      <p className="muted small">
        이 기기에서 쓸 수 있는 코어는 {maxThreads}개입니다. 무제한으로 두면
        코어를 계속 붙잡고 있으니, 오래 켜둘 때는 시간을 정해두세요.
      </p>
    </div>
  );
}
