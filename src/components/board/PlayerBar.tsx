// 대국자 카드
//
// 판 위아래에 한 장씩 붙는다. 한국 장기 앱들이 쓰는 배치 그대로다.
//   누가 어느 쪽을 잡았는지 · 기물 점수 · 잡아낸 기물 · 남은 시간
// 둘 차례인 쪽만 밝게 띄워서, 판을 보다가 고개를 들면 바로 알 수 있게 한다.

import type { SideClock } from "../../janggi/clock";
import { clockView } from "../../janggi/clock";
import type { PieceChar, Side } from "../../janggi/pieces";
import { SIDE_LABEL, charOf } from "../../janggi/pieces";
import type { PieceType } from "../../janggi/pieces";
import { PieceGlyph } from "./PieceGlyph";

interface Props {
  side: Side;
  /** "나" 또는 "6급" 처럼 이 자리에 앉은 사람 */
  name: string;
  /** 사람인지 엔진인지 */
  kind: "human" | "engine";
  /** 기물 점수 (한은 덤 1.5 포함) */
  score: number;
  /** 이 진영이 잡아낸 상대 기물 */
  captured: PieceType[];
  /** 둘 차례인지 */
  active: boolean;
  /** 엔진이 지금 생각 중인지 */
  thinking?: boolean;
  /** 시계를 안 쓰면 null */
  clock: SideClock | null;
}

export function PlayerBar(props: Props) {
  const { side, name, kind, score, captured, active, thinking, clock } = props;
  const view = clock ? clockView(clock) : null;
  const opponent: Side = side === "cho" ? "han" : "cho";

  return (
    <div className={"player-bar " + side + (active ? " active" : "")}>
      <span className={"player-mark " + side}>
        {side === "cho" ? "초 楚" : "한 漢"}
      </span>

      <span className="player-name">
        {name}
        <span className="player-kind muted small">
          {kind === "engine" ? "엔진" : "사람"}
        </span>
      </span>

      {/* 잡아낸 기물. 상대 기물이라 색도 상대 색으로 새긴다. */}
      <span className="player-captured" title="잡아낸 기물">
        {captured.map((type, i) => (
          <svg key={type + i} viewBox="-11 -11 22 22" className="captured-piece">
            <PieceGlyph piece={charOf(type, opponent) as PieceChar} radius={10} />
          </svg>
        ))}
      </span>

      <span className="player-score" title="기물 점수">
        {score.toFixed(1)}
        <em>점</em>
      </span>

      {view && (
        <span
          className={
            "player-clock" +
            (view.inByoyomi ? " byoyomi" : "") +
            (view.urgent && active ? " urgent" : "") +
            (view.flagged ? " flagged" : "")
          }
        >
          <b>{view.text}</b>
          {view.inByoyomi && !view.flagged && (
            <span className="byoyomi-dots" title={`초읽기 ${view.periods}회 남음`}>
              {"●".repeat(Math.max(0, view.periods))}
            </span>
          )}
        </span>
      )}

      {thinking && active && <span className="player-thinking" aria-label="생각 중" />}
      {!thinking && active && <span className="player-turn muted small">둘 차례</span>}
      <span className="sr-only">{SIDE_LABEL[side]}</span>
    </div>
  );
}
