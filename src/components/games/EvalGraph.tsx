// 평가치 그래프
//
// 복기가 국면마다 적어 둔 평가치를 이어 그린다. 기보 탭에서 연 판에만 뜬다.
// 가운데 가로선이 0(팽팽함)이고, 위로 솟으면 초가, 아래로 처지면 한이 좋다.
// 어디서 판이 기울었는지 한눈에 보라고 만든 것이라 눈금은 최소로만 둔다.
//
// 예전에는 실시간 분석이 돌 때마다 점수가 쌓였다. 분석 탭과 훈수를 빼면서
// 대국 중에는 점수를 매기지 않으므로, 복기를 돌려야 그래프가 생긴다.

import { ChartLine } from "lucide-react";
import type { HistoryEntry } from "../../janggi/history";

interface Props {
  history: HistoryEntry[];
  cursor: number;
  onJump: (index: number) => void;
}

const W = 100;
const H = 34;
/** 이 점수를 넘어가면 그래프 끝에 붙인다. 장기에서 5점이면 이미 승부가 기운 정도다. */
const CLAMP = 5;

/** 평가치를 그래프 높이로. 큰 값일수록 완만해지도록 눌러서, 초반 미세한 차이도 보이게 한다. */
function toY(score: number): number {
  const clamped = Math.max(-CLAMP, Math.min(CLAMP, score));
  const eased = Math.sign(clamped) * Math.sqrt(Math.abs(clamped) / CLAMP);
  return H / 2 - (eased * H) / 2;
}

export function EvalGraph({ history, cursor, onJump }: Props) {
  const scored = history.map((h, i) => ({ ...h, i }));
  const known = scored.filter((h) => h.score !== null && h.score !== undefined);

  if (known.length < 2) {
    return (
      <div className="panel graph">
        <div className="panel-title">형세</div>
        <div className="empty">
          <ChartLine size={24} strokeWidth={1.75} aria-hidden />
          <p className="empty-title">아직 그릴 흐름이 없습니다</p>
          <p>복기를 돌리면 국면마다 평가치가 매겨져 흐름이 그려집니다.</p>
        </div>
      </div>
    );
  }

  const stepX = W / Math.max(1, history.length - 1);
  const pointOf = (i: number, score: number) => ({
    x: i * stepX,
    y: toY(score),
  });

  const points = known.map((h) => pointOf(h.i, h.score as number));
  const line = points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");

  // 0선 위/아래를 각각 옅게 채워 어느 쪽이 좋은지 색으로도 읽히게 한다.
  const area = `0,${H / 2} ${line} ${points[points.length - 1].x.toFixed(2)},${H / 2}`;

  const current = scored[cursor];
  const currentPoint =
    current?.score !== null && current?.score !== undefined
      ? pointOf(cursor, current.score)
      : null;

  const last = known[known.length - 1].score as number;

  return (
    <div className="panel graph">
      <div className="panel-title">
        형세
        <span className="panel-meta">
          {last > 0 ? "초 우세" : last < 0 ? "한 우세" : "팽팽"}{" "}
          {last > 0 ? "+" : ""}
          {last.toFixed(2)}
        </span>
      </div>

      <svg
        className="eval-graph"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`평가치 흐름. 현재 ${last.toFixed(2)}, 초 기준`}
        onClick={(e) => {
          // 가로 위치로 몇 수째인지 골라 그 국면으로 간다.
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          onJump(
            Math.max(0, Math.min(history.length - 1, Math.round(ratio * (history.length - 1))))
          );
        }}
      >
        <polygon className="eval-area" points={area} />
        <line className="eval-zero" x1="0" y1={H / 2} x2={W} y2={H / 2} />
        <polyline className="eval-line" points={line} />
        {currentPoint && (
          <>
            <line
              className="eval-cursor"
              x1={currentPoint.x}
              y1="0"
              x2={currentPoint.x}
              y2={H}
            />
            <circle className="eval-dot" cx={currentPoint.x} cy={currentPoint.y} r="1.8" />
          </>
        )}
      </svg>

      <p className="muted small">
        위로 솟으면 초, 아래로 처지면 한이 좋습니다. 눌러서 그 수로 이동합니다.
      </p>
    </div>
  );
}
