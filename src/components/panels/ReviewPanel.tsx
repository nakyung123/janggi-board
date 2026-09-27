// 복기
//
// 기보를 한 수씩 되짚어 "어디다 두는 게 좋았는지" 를 보여준다.
// 수를 고르면 판이 그 국면으로 가고, 최선수가 판에 화살표로 뜬다.

import { useState } from "react";
import { REVIEW_DEPTHS, reviewDepthById } from "../../engine/levels";
import type { ReviewProgress, ReviewedMove } from "../../janggi/review";
import { GRADE_LABEL, GRADE_MARK, summarize } from "../../janggi/review";
import type { MoveGrade } from "../../janggi/review";
import { SIDE_LABEL } from "../../janggi/pieces";
import type { Side } from "../../janggi/pieces";

interface Props {
  moveCount: number;
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
}

/** 요약 줄에 세어서 보여줄 등급. '좋은 수' 는 굳이 세지 않는다. */
const COUNTED: MoveGrade[] = ["best", "inaccuracy", "mistake", "blunder"];

export function ReviewPanel(props: Props) {
  const {
    moveCount, depthId, onDepth, running, progress, reviewed,
    cursor, error, onStart, onStop, onJump,
  } = props;

  const [onlyProblems, setOnlyProblems] = useState(false);
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
                title={d.desc}
                onClick={() => onDepth(d.id)}
              >
                {d.name}
              </button>
            ))}
          </div>
        </div>
        <p className="muted small">
          {depth.desc} · 한 국면에 {depth.nodes.toLocaleString()}노드
        </p>

        <div className="row">
          <button type="button" className="primary" onClick={onStart}>
            복기 시작
          </button>
        </div>
        {error && <p className="error">{error}</p>}
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
        <p className="muted small">
          엔진이 국면마다 {depth.nodes.toLocaleString()}노드씩 봅니다.
          중간에 그만둬도 거기까지는 남습니다.
        </p>
        <div className="row">
          <button type="button" className="ghost stop" onClick={onStop}>
            ■ 중단
          </button>
        </div>
      </div>
    );
  }

  const all = reviewed ?? [];
  const shown = onlyProblems
    ? all.filter((r) => r.grade === "mistake" || r.grade === "blunder")
    : all;
  const current = all.find((r) => r.index === cursor) ?? null;

  return (
    <div className="panel review">
      <div className="panel-title">
        복기
        <span className="panel-meta">{all.length}수</span>
      </div>

      {/* 양쪽 성적표 */}
      <div className="review-summary">
        {(["cho", "han"] as Side[]).map((side) => {
          const s = summarize(all, side);
          return (
            <div key={side} className="review-side">
              <div className={"review-side-name " + side}>
                {SIDE_LABEL[side]} <span className="muted">{s.moves}수</span>
              </div>
              <ul className="review-counts">
                {COUNTED.map((g) => (
                  <li key={g} className={"g-" + g}>
                    <b>{s.counts[g]}</b>
                    <span>{GRADE_LABEL[g]}</span>
                  </li>
                ))}
              </ul>
              <p className="muted small">
                <b title="엔진이 고른 수와 같은 수를 둔 비율">
                  일치율 {Math.round(s.accuracy * 100)}%
                </b>
                {" · 한 수당 평균 "}
                {s.avgLoss.toFixed(2)}점 손해
                {s.worst && (
                  <>
                    {" · 가장 아쉬운 수 "}
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => onJump(s.worst!.index)}
                    >
                      {s.worst.index}수 {s.worst.playedNotation}
                    </button>
                  </>
                )}
              </p>
            </div>
          );
        })}
      </div>

      {/* 고른 수의 설명 — 이 패널에서 가장 중요한 부분 */}
      {current ? (
        <div className={"review-detail g-" + current.grade}>
          <div className="review-detail-head">
            <span className="review-grade">
              {GRADE_MARK[current.grade]} {GRADE_LABEL[current.grade]}
            </span>
            <span className="review-played">
              {current.index}수 · {SIDE_LABEL[current.mover]}{" "}
              <b>{current.playedNotation}</b>
            </span>
            {current.loss > 0 && (
              <span className="review-loss">−{current.loss.toFixed(2)}</span>
            )}
          </div>

          <p className="review-comment">{current.comment}</p>

          {current.bestNotation && current.best !== current.played && (
            <div className="review-best">
              <span className="label">이렇게 뒀다면</span>
              <span className="review-line">{current.bestLine.join("  ")}</span>
            </div>
          )}
        </div>
      ) : (
        <p className="muted pad">
          아래에서 수를 고르면 그 자리에서 무엇이 좋았는지 설명이 뜹니다.
        </p>
      )}

      <label className="row toggle">
        <input
          type="checkbox"
          checked={onlyProblems}
          onChange={(e) => setOnlyProblems(e.target.checked)}
        />
        <span>실수·악수만 보기</span>
      </label>

      <ul className="review-list">
        {shown.length === 0 ? (
          <li className="muted pad">실수랄 만한 수가 없습니다.</li>
        ) : (
          shown.map((r) => (
            <li key={r.index}>
              <button
                type="button"
                className={
                  "review-item g-" + r.grade + (cursor === r.index ? " active" : "")
                }
                onClick={() => onJump(r.index)}
              >
                <span className="review-item-no">{r.index}</span>
                <span className={"review-item-move " + r.mover}>
                  {r.playedNotation}
                </span>
                <span className="review-item-grade">{GRADE_MARK[r.grade]}</span>
                <span className="review-item-loss">
                  {r.loss >= 0.05 ? "−" + r.loss.toFixed(1) : ""}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>

      <div className="row">
        <button type="button" className="ghost" onClick={onStart}>
          다시 복기
        </button>
        <span className="muted small">
          깊이 {depth.name} · 국면당 {depth.nodes.toLocaleString()}노드
        </span>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
