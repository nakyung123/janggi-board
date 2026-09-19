// 국면 도구
//
// Yixin-Board 를 쓰는 이유와 같은 부분이다. 판을 마음대로 고쳐놓고
// 그 국면을 그대로 엔진에 물릴 수 있어야 한다.

import { useEffect, useState } from "react";
import type { Position } from "../janggi/board";
import { toFen, validate } from "../janggi/board";
import type { Side } from "../janggi/pieces";
import { SIDE_LABEL, materialScore } from "../janggi/pieces";
import { SETUPS, detectSetup } from "../janggi/setups";
import type { Setup } from "../janggi/setups";

interface Props {
  position: Position;
  editMode: boolean;
  onEditMode: (on: boolean) => void;
  onFen: (fen: string) => void;
  onTurn: (turn: Side) => void;
  onSetup: (side: Side, setup: Setup) => void;
  onClear: () => void;
  onReset: () => void;
  onFlip: () => void;
}

export function PositionTools(props: Props) {
  const {
    position,
    editMode,
    onEditMode,
    onFen,
    onTurn,
    onSetup,
    onClear,
    onReset,
    onFlip,
  } = props;

  const fen = toFen(position);
  const [draft, setDraft] = useState(fen);
  const [fenError, setFenError] = useState<string | null>(null);

  // 판이 바뀌면 입력칸도 따라간다(사용자가 직접 고치는 중이 아니라면).
  useEffect(() => setDraft(fen), [fen]);

  const problems = validate(position);
  const pieces = Object.values(position.board);
  const scores: Record<Side, number> = {
    cho: materialScore(pieces, "cho"),
    han: materialScore(pieces, "han"),
  };

  const apply = () => {
    try {
      onFen(draft.trim());
      setFenError(null);
    } catch (err) {
      setFenError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="panel tools">
      <div className="panel-title">국면</div>

      <div className="row">
        <div className="seg wide">
          <button
            type="button"
            className={!editMode ? "active" : ""}
            onClick={() => onEditMode(false)}
          >
            대국
          </button>
          <button
            type="button"
            className={editMode ? "active" : ""}
            onClick={() => onEditMode(true)}
          >
            판 편집
          </button>
        </div>
        <button type="button" className="ghost" onClick={onFlip}>
          판 뒤집기
        </button>
      </div>

      <div className="row">
        <span className="label">둘 차례</span>
        <div className="seg">
          {(["cho", "han"] as Side[]).map((s) => (
            <button
              key={s}
              type="button"
              className={position.turn === s ? "active " + s : s}
              onClick={() => onTurn(s)}
            >
              {SIDE_LABEL[s]}
            </button>
          ))}
        </div>
        <span className="score-tag">
          점수 <b className="cho">{scores.cho}</b> :{" "}
          <b className="han">{scores.han}</b>
        </span>
      </div>

      <div className="setup-block">
        <span className="label">상차림</span>
        {(["cho", "han"] as Side[]).map((side) => {
          const current = detectSetup(position.board, side);
          return (
            <div key={side} className="row setup-row">
              <span className={"palette-side " + side}>{SIDE_LABEL[side]}</span>
              <div className="seg">
                {SETUPS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={current?.id === s.id ? "active" : ""}
                    title={`${s.alias} — ${s.desc}`}
                    onClick={() => onSetup(side, s)}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="row fen-row">
        <input
          className="fen-input"
          value={draft}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
        />
        <button type="button" onClick={apply}>
          적용
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => void navigator.clipboard.writeText(fen)}
        >
          복사
        </button>
      </div>
      {fenError && <p className="error">{fenError}</p>}

      <div className="row">
        <button type="button" className="ghost" onClick={onReset}>
          초기 배치
        </button>
        <button type="button" className="ghost" onClick={onClear}>
          판 비우기
        </button>
      </div>

      {problems.length > 0 && (
        <ul className="warnings">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
