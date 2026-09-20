// 국면 도구
//
// Yixin-Board 를 쓰는 이유와 같은 부분이다. 판을 마음대로 고쳐놓고
// 그 국면을 그대로 엔진에 물릴 수 있어야 한다.

import { useEffect, useRef, useState } from "react";
import type { Position } from "../../janggi/board";
import { toFen, validate } from "../../janggi/board";
import type { Side } from "../../janggi/pieces";
import { SIDE_LABEL } from "../../janggi/pieces";
import { SETUPS, detectSetup } from "../../janggi/setups";
import type { Setup } from "../../janggi/setups";
import { scoreBoard } from "../../janggi/status";
import { 이가 } from "../../janggi/korean";

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
  onSave: () => void;
  onLoad: (file: File) => void;
  canSave: boolean;
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
    onSave,
    onLoad,
    canSave,
  } = props;

  const fen = toFen(position);
  const [draft, setDraft] = useState(fen);
  const [fenError, setFenError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 판이 바뀌면 입력칸도 따라간다.
  useEffect(() => setDraft(fen), [fen]);

  const problems = validate(position);
  const score = scoreBoard(position);

  const apply = () => {
    try {
      onFen(draft.trim());
      setFenError(null);
    } catch (err) {
      setFenError(err instanceof Error ? err.message : String(err));
    }
  };

  const copy = () => {
    void navigator.clipboard.writeText(fen).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
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
        <button type="button" className="ghost" onClick={onFlip} title="F 키">
          판 뒤집기
        </button>
      </div>

      {editMode && (
        <p className="edit-hint">
          고치는 대로 엔진이 다시 분석합니다. <b>대국</b>을 누르면 편집을
          마칩니다. 판을 그대로 두고 나가면 두던 기보가 그대로 남습니다.
        </p>
      )}

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
      </div>

      {/* 점수제 판정용 기물 점수. 어느 쪽이 얼마나 앞서는지까지 적어준다. */}
      <div className="row score-row">
        <span className="label">기물 점수</span>
        <span className="score-bar">
          <b className="cho">{score.cho}</b>
          <span className="muted"> : </span>
          <b className="han">{score.han}</b>
          <span className="score-lead">
            {score.leader === null
              ? "동점"
              : `${이가(SIDE_LABEL[score.leader])} ${score.diff.toFixed(1)}점 앞섬`}
          </span>
        </span>
      </div>
      <p className="muted small score-note">
        한(漢)은 후수라 1.5점 덤을 미리 받습니다. 대국이 점수로 갈릴 때 이 숫자가
        승부를 정합니다.
      </p>

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

      {/* FEN 은 한 줄에 다 안 들어가서 여러 줄로 보여준다. */}
      <label className="fen-block">
        <span className="label">FEN</span>
        <textarea
          className="fen-input"
          value={draft}
          spellCheck={false}
          rows={2}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              apply();
            }
          }}
        />
      </label>
      <div className="row">
        <button type="button" onClick={apply}>
          적용
        </button>
        <button type="button" className="ghost" onClick={copy}>
          {copied ? "복사됨" : "복사"}
        </button>
        <span className="muted small">Enter 로도 적용됩니다</span>
      </div>
      {fenError && <p className="error">{fenError}</p>}

      <div className="row">
        <button type="button" className="ghost" onClick={onReset}>
          초기 배치
        </button>
        <button type="button" className="ghost" onClick={onClear}>
          판 비우기
        </button>
        <button
          type="button"
          className="ghost"
          onClick={onSave}
          disabled={!canSave}
          title={canSave ? "기보를 파일로 저장합니다" : "저장할 수가 없습니다"}
        >
          기보 저장
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => fileRef.current?.click()}
        >
          기보 불러오기
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onLoad(file);
            e.target.value = ""; // 같은 파일을 다시 골라도 동작하게
          }}
        />
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
