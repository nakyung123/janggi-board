// 형세 — 지금 국면에서 누가 얼마나 앞서는지(%)와 판 전체의 흐름
//
// 기보 탭에서 연 판에만 뜬다. 위에 지금 보는 국면의 승률("초 69% · 한 31%")과 두 색
// 막대, 아래에 국면마다의 승률을 이은 선. 가운데 가로선이 50%(팽팽함)이고, 위로 솟으면
// 초가, 아래로 처지면 한이 앞선다. 어디서 판이 기울었는지 한눈에 보라고 만든 것이라
// 눈금은 두지 않는다. 승률은 엔진 점수를 옮긴 어림값이다(janggi/review.ts 의 winChance).
//
// 선은 점과 점을 부드럽게 잇되(smoothPath) 0%·100% 밖으로 튀지 않는다. 지금 보는 수는 선
// 위의 점 하나로 짚는다. 그림은 칸 폭에 맞춰 가로로 늘여 그리므로, 점은 SVG 가 아니라 위에
// 얹은 HTML 원이다 - SVG 원은 늘인 만큼 납작해진다.
//
// 평가치는 복기가 적는다(대국 중에는 엔진이 제 수만 찾고 점수를 매기지 않는다). 그래서
// 복기를 돌리기 전에는 그릴 것이 없어 칸을 띄우지 않는다. 파일로 불러온 기보는 저장할 때의
// 평가치를 그대로 가져온다.

import { useId } from "react";
import type { HistoryEntry } from "../../janggi/history";
import { winChance, winPercent } from "../../janggi/review";

interface Props {
  history: HistoryEntry[];
  cursor: number;
  onJump: (index: number) => void;
}

const W = 100;
const H = 34;

export function EvalGraph({ history, cursor, onJump }: Props) {
  // 초 쪽·한 쪽 채움을 가운데 선에서 자르는 clipPath 이름. useId 의 기호는 url(#…) 에 못 쓴다.
  const clip = "eval" + useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const known = history.flatMap((h, i) =>
    h.score === null || h.score === undefined ? [] : [{ i, p: winChance(h.score) }]
  );
  if (known.length < 2) return null;

  const stepX = W / Math.max(1, history.length - 1);
  const xOf = (i: number) => i * stepX;
  const yOf = (p: number) => H * (1 - p);

  const points = known.map((k) => ({ x: xOf(k.i), y: yOf(k.p) }));
  const line = smoothPath(points);
  // 50% 선과 흐름 선 사이를 채운다. 선 위는 초 색, 아래는 한 색이라 누가 앞선 구간인지 색으로도 읽힌다.
  const first = points[0];
  const last = points[points.length - 1];
  const area = `${line} L${last.x.toFixed(2)},${H / 2} L${first.x.toFixed(2)},${H / 2} Z`;

  const here = history[cursor]?.score;
  const cho = here === null || here === undefined ? null : winPercent(here);

  return (
    <div className="panel graph">
      <div className="panel-title">
        형세
        {cho !== null && (
          <span className="panel-meta win-meta">
            <b className="cho">초 {cho}%</b>
            <span aria-hidden="true"> · </span>
            <b className="han">한 {100 - cho}%</b>
          </span>
        )}
      </div>

      {cho !== null && (
        <div className="win-bar" aria-hidden="true">
          <i style={{ width: `${cho}%` }} />
        </div>
      )}

      <div className="eval-plot">
        <svg
          className="eval-graph"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={cho !== null ? `승률 흐름. 지금 초 ${cho}%, 한 ${100 - cho}%` : "승률 흐름"}
          onClick={(e) => {
            // 가로 위치로 몇 수째인지 골라 그 국면으로 간다.
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            onJump(
              Math.max(0, Math.min(history.length - 1, Math.round(ratio * (history.length - 1))))
            );
          }}
        >
          <defs>
            <clipPath id={clip + "-cho"}>
              <rect x="0" y="0" width={W} height={H / 2} />
            </clipPath>
            <clipPath id={clip + "-han"}>
              <rect x="0" y={H / 2} width={W} height={H / 2} />
            </clipPath>
          </defs>
          <path className="eval-area cho" d={area} clipPath={`url(#${clip}-cho)`} />
          <path className="eval-area han" d={area} clipPath={`url(#${clip}-han)`} />
          <line className="eval-zero" x1="0" y1={H / 2} x2={W} y2={H / 2} />
          <path className="eval-line" d={line} />
        </svg>
        {cho !== null && (
          <span
            className="eval-dot"
            aria-hidden="true"
            style={{
              left: `${(xOf(cursor) / W) * 100}%`,
              top: `${(yOf(winChance(here!)) / H) * 100}%`,
            }}
          />
        )}
      </div>

      <p className="muted small">
        위로 솟으면 초, 아래로 처지면 한이 앞섭니다. 승률은 엔진 점수를 옮긴 어림값이고, 누르면 그
        수로 갑니다.
      </p>
    </div>
  );
}

/**
 * 점들을 부드럽게 잇는 SVG 경로(단조 3차 보간, Fritsch–Butland).
 *
 * 점마다 기울기를 앞뒤 두 기울기의 가중 조화평균으로 잡는다. 앞뒤가 반대로 꺾이는 점(꼭짓점)은
 * 기울기 0 이라, 선이 점 사이에서 이웃한 두 점의 값을 넘어서지 않는다 - 승률 100% 위로
 * 솟거나, 오르기만 한 구간에 없던 굴곡이 생기지 않는다. 그냥 곡선(캣멀롬)은 꼭짓점 근처에서
 * 튀어나간다.
 */
function smoothPath(points: { x: number; y: number }[]): string {
  const f = (v: number) => v.toFixed(2);
  const n = points.length;
  if (n === 0) return "";
  const head = `M${f(points[0].x)},${f(points[0].y)}`;
  if (n === 1) return head;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1].x - points[i].x);
    slope.push((points[i + 1].y - points[i].y) / dx[i]);
  }
  const tangent: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    const a = slope[i - 1];
    const b = slope[i];
    if (a * b <= 0) {
      tangent.push(0);
    } else {
      const wa = 2 * dx[i] + dx[i - 1];
      const wb = dx[i] + 2 * dx[i - 1];
      tangent.push((wa + wb) / (wa / a + wb / b));
    }
  }
  tangent.push(slope[n - 2]);

  let d = head;
  for (let i = 0; i < n - 1; i++) {
    const p = points[i];
    const q = points[i + 1];
    const h = dx[i] / 3;
    d +=
      ` C${f(p.x + h)},${f(p.y + tangent[i] * h)}` +
      ` ${f(q.x - h)},${f(q.y - tangent[i + 1] * h)}` +
      ` ${f(q.x)},${f(q.y)}`;
  }
  return d;
}
