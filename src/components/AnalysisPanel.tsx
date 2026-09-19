// 실시간 분석 패널
//
// 엔진이 탐색하는 동안 후보 수순 여러 개를 계속 갱신해서 보여준다.
// 줄에 마우스를 올리면 그 수가 판에 화살표로 표시되고, 누르면 실제로 둔다.

import type { AnalysisSnapshot } from "../engine/types";
import type { Board } from "../janggi/board";
import { describeLine, formatScore, splitMove } from "../janggi/notation";

interface Props {
  snapshot: AnalysisSnapshot | null;
  board: Board;
  enabled: boolean;
  onHoverLine: (move: string | null) => void;
  onPlayLine: (move: string) => void;
}

const fmtNodes = (n: number) =>
  n >= 1e9
    ? (n / 1e9).toFixed(2) + "G"
    : n >= 1e6
      ? (n / 1e6).toFixed(1) + "M"
      : n >= 1e3
        ? (n / 1e3).toFixed(0) + "k"
        : String(n);

export function AnalysisPanel({
  snapshot,
  board,
  enabled,
  onHoverLine,
  onPlayLine,
}: Props) {
  if (!enabled) {
    return (
      <div className="panel analysis">
        <div className="panel-title">분석</div>
        <p className="muted pad">분석이 꺼져 있습니다.</p>
      </div>
    );
  }

  const lines = snapshot?.lines ?? [];

  return (
    <div className="panel analysis">
      <div className="panel-title">
        분석
        {snapshot && (
          <span className="panel-meta">
            깊이 {snapshot.depth}
            {snapshot.nodes > 0 && ` · ${fmtNodes(snapshot.nodes)} 노드`}
            {snapshot.nps > 0 && ` · ${fmtNodes(snapshot.nps)}/s`}
            {snapshot.running ? (
              <span className="dot-live" title="탐색 중" />
            ) : null}
          </span>
        )}
      </div>

      {lines.length === 0 ? (
        <p className="muted pad">국면을 읽는 중…</p>
      ) : (
        <ol className="pv-list">
          {lines.map((line) => {
            const first = line.pv[0];
            const notated = describeLine(line.pv.slice(0, 10), board);
            const good = line.mate !== null ? line.mate > 0 : line.score > 0;
            return (
              <li
                key={line.multipv}
                className="pv-row"
                onMouseEnter={() => onHoverLine(first)}
                onMouseLeave={() => onHoverLine(null)}
                onClick={() => first && onPlayLine(first)}
              >
                <span className={"pv-score " + (good ? "cho" : "han")}>
                  {formatScore(line.score, line.mate)}
                </span>
                <span className="pv-depth">{line.depth}</span>
                <span className="pv-moves">{notated.join("  ")}</span>
              </li>
            );
          })}
        </ol>
      )}

      <p className="pv-legend muted">
        점수는 초(楚) 기준입니다. 양수면 초가 유리합니다. 줄을 누르면 그 수를
        둡니다.
      </p>
    </div>
  );
}

/** 분석 줄의 첫 수를 판 위 화살표 좌표로 바꾼다. */
export function arrowOf(move: string | null) {
  if (!move) return null;
  const { from, to } = splitMove(move);
  if (!from || !to || from === to) return null;
  return { from, to };
}
