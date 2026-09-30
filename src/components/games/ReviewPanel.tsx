// 복기 패널 — 연 판을 엔진으로 되짚어 "어디다 두는 게 좋았는지" 를 보여준다
//
//   복기 전     깊이를 고르고 시작한다
//   도는 중     진행률과 중단 버튼
//   복기 뒤     지금 수의 설명 카드, 이전·다음 아쉬운 수, 수 목록, 양쪽 성적표 한 줄씩
//
// 판에 떠 있는 수를 카드 하나가 설명한다. 이전·다음·그래프·수 목록 어디로 옮겨 가든 카드가
// 따라간다. 설명은 줄마다 이름을 붙인다 - 승률이 어떻게 바뀌었나, AI라면 무엇을
// 뒀나, 그 뒤에 무엇이 벌어지나. 한 덩어리 문장이던 때는 무엇이 최선이고 무엇이
// 벌어지는지 가려 읽기 어려웠다. 손해는 점수(−1.88) 대신 승률 변화로 말한다.
//
// 수 목록(MoveList)은 복기 전·중·뒤 어느 때나 이 칸 안에 선다. 수를 고르면 판이 그
// 국면으로 가고, 뒀어야 할 수가 판에 화살표로 뜬다. 복기를 돌리는 일은 hooks/useReview.ts,
// 무엇을 어떻게 재는지는 janggi/review.ts 에 있다.

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  REVIEW_DEPTHS,
  reviewDepthById,
  reviewSeconds,
  어림시간,
} from "../../engine/levels";
import type { MoveGrade, ReviewProgress, ReviewedMove } from "../../janggi/review";
import { GRADE_LABEL, GRADE_MARK, isSlip, summarize, winPercent } from "../../janggi/review";
import { SIDE_LABEL } from "../../janggi/pieces";
import type { Side } from "../../janggi/pieces";

interface Props {
  moveCount: number;
  /** 성적표 줄에 붙일 이름. 예: { cho: "나", han: "6급" } */
  names: Record<Side, string>;
  depthId: string;
  onDepth: (id: string) => void;
  running: boolean;
  progress: ReviewProgress | null;
  reviewed: ReviewedMove[] | null;
  /** 지금 판에 떠 있는 수 (history 인덱스) */
  cursor: number;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
  onJump: (historyIndex: number) => void;
  /** 수 목록. 카드·진행률 아래에 선다. */
  moves: ReactNode;
}

/**
 * 성적표에 세어 보여줄 등급. 최선수는 일치율(%)이 말하고, 좋은 수는 짚을 까닭이 없다.
 * 총 수를 적지 않아서, 다섯 등급을 다 세지 않아도 합이 어긋나 보이지 않는다.
 */
const SLIPS: MoveGrade[] = ["inaccuracy", "mistake", "blunder"];

const ICON = { size: 20, strokeWidth: 2, "aria-hidden": true } as const;

export function ReviewPanel(props: Props) {
  const {
    moveCount, names, depthId, onDepth, running, progress, reviewed,
    cursor, error, onStart, onStop, onJump, moves,
  } = props;

  const depth = reviewDepthById(depthId);

  // 아직 복기를 돌리지 않았을 때
  if (!reviewed && !running) {
    return (
      <div className="panel review">
        <div className="panel-title">복기</div>
        <p className="muted pad">
          {moveCount}수를 한 수씩 엔진에게 물어봅니다. 실제로 둔 수와 엔진이
          고른 수를 견줘서, 어디서 얼마나 손해를 봤는지 짚어줍니다.
        </p>

        <div className="row">
          <span className="label">깊이</span>
          <div className="seg">
            {REVIEW_DEPTHS.map((d) => (
              <button
                key={d.id}
                type="button"
                className={d.id === depthId ? "active" : ""}
                onClick={() => onDepth(d.id)}
              >
                {d.name}
              </button>
            ))}
          </div>
        </div>
        <p className="muted small">
          {moveCount}수에 {어림시간(reviewSeconds(depth, moveCount))} ·{" "}
          {depth.desc}
        </p>

        <div className="row">
          <button type="button" className="primary" onClick={onStart}>
            복기 시작
          </button>
        </div>
        {error && <p className="error">{error}</p>}

        <div className="review-moves">{moves}</div>
      </div>
    );
  }

  // 돌아가는 중
  if (running) {
    const pct = progress ? (progress.done / progress.total) * 100 : 0;
    return (
      <div className="panel review">
        <div className="panel-title">
          복기
          <span className="panel-meta">
            {progress ? `${progress.done} / ${progress.total} 국면` : "준비 중"}
          </span>
        </div>
        <div className="review-bar">
          <div style={{ width: `${pct}%` }} />
        </div>
        {/* 멈춘 복기는 남기지 않는다(App.startReview) - 그 판은 복기 전(또는 지난 복기) 그대로다. */}
        <p className="muted small">
          엔진이 국면마다 {depth.nodes.toLocaleString()}노드씩 봅니다.
          중간에 그만두면 이번 복기는 남지 않습니다.
        </p>
        <div className="row">
          <button type="button" className="ghost stop" onClick={onStop}>
            ■ 중단
          </button>
        </div>

        <div className="review-moves">{moves}</div>
      </div>
    );
  }

  const all = reviewed ?? [];
  const current = all.find((r) => r.index === cursor) ?? null;
  const slips = all.filter(isSlip).map((r) => r.index);
  const prevSlip = slips.filter((i) => i < cursor).pop();
  const nextSlip = slips.find((i) => i > cursor);

  return (
    <div className="panel review">
      <div className="panel-title">복기</div>

      {/* 지금 수의 설명 — 이 패널에서 가장 중요한 부분 */}
      {current ? (
        <MoveCard
          r={current}
          nth={all.filter((r) => r.mover === current.mover && r.index <= current.index).length}
        />
      ) : (
        <p className="muted review-hint">
          수를 고르면 그 수를 엔진이 어떻게 보는지 여기에 뜹니다.
        </p>
      )}

      {slips.length > 0 ? (
        <div className="review-nav">
          <button
            type="button"
            disabled={prevSlip === undefined}
            onClick={() => prevSlip !== undefined && onJump(prevSlip)}
          >
            <ChevronLeft {...ICON} />
            이전 아쉬운 수
          </button>
          <button
            type="button"
            disabled={nextSlip === undefined}
            onClick={() => nextSlip !== undefined && onJump(nextSlip)}
          >
            다음 아쉬운 수
            <ChevronRight {...ICON} />
          </button>
        </div>
      ) : (
        <p className="muted review-hint">부정확 이상으로 짚을 수가 없습니다.</p>
      )}

      <div className="review-moves">{moves}</div>

      {/* 양쪽 성적표. 한 쪽에 한 줄, 같은 등급이 위아래로 맞아 견주기 쉽다. */}
      <table className="review-table">
        <thead>
          <tr>
            <td />
            <th scope="col">일치율</th>
            {SLIPS.map((g) => (
              <th key={g} scope="col" className={"g-" + g}>
                {GRADE_MARK[g]} {GRADE_LABEL[g]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(["cho", "han"] as Side[]).map((side) => {
            const s = summarize(all, side);
            return (
              <tr key={side}>
                <th scope="row">
                  <span className={side}>{SIDE_LABEL[side]}</span> {names[side]}
                </th>
                <td>{Math.round(s.accuracy * 100)}%</td>
                {SLIPS.map((g) => (
                  <td key={g} className={"g-" + g + (s.counts[g] === 0 ? " zero" : "")}>
                    {s.counts[g]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small review-table-note">
        일치율은 엔진이 고른 수(★)와 같은 수를 둔 비율입니다.
      </p>

      <div className="row">
        <button type="button" className="ghost" onClick={onStart}>
          다시 복기
        </button>
        <span className="muted small">깊이 {depth.name}</span>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/**
 * 한 수의 설명 카드.
 *
 *   한의 6번째 수 14사24                 ?! 부정확
 *   승률        한 38% → 29%
 *   AI의 수     32포35 · 마를 잡는 자리
 *   그 뒤       초가 43졸33으로 마를 가져갑니다.
 *
 * 몇 번째 수인지는 둔 쪽의 수를 센다. 수 목록의 줄 번호(초·한 한 쌍이 한 줄)와 같은 수다.
 */
function MoveCard({ r, nth }: { r: ReviewedMove; nth: number }) {
  const cho = [winPercent(r.scoreBefore), winPercent(r.scoreAfter)];
  const [before, after] = r.mover === "cho" ? cho : cho.map((p) => 100 - p);
  const { verdict, best, bestDoes, after: then } = r.note;

  return (
    <div className={"review-move g-" + r.grade}>
      <div className="review-move-head">
        <span className="review-move-title">
          {SIDE_LABEL[r.mover]}의 {nth}번째 수 <b className={r.mover}>{r.playedNotation}</b>
        </span>
        <span className="review-grade">
          {r.grade !== "good" && GRADE_MARK[r.grade] + " "}
          {GRADE_LABEL[r.grade]}
        </span>
      </div>

      {verdict && <p className="review-verdict">{verdict}</p>}

      <dl className="review-facts">
        <dt>승률</dt>
        <dd>
          {SIDE_LABEL[r.mover]} {before}% → <b>{after}%</b>
        </dd>
        {best && (
          <>
            <dt>AI의 수</dt>
            <dd>
              <b className={r.mover}>{best}</b>
              {bestDoes && ` · ${bestDoes}`}
            </dd>
          </>
        )}
        {then && (
          <>
            <dt>그 뒤</dt>
            <dd>{then}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
