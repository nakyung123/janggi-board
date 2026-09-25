// 대국 설정
//
// 한 판 두는 데 필요한 것만 둔다. 어느 쪽을 잡을지, 상대가 몇 급인지,
// 상차림을 어떻게 할지. 스레드·해시 같은 것은 분석 모드에 있다.

import { LEVELS, levelById } from "../../engine/levels";
import { CLOCK_PRESETS } from "../../janggi/clock";
import type { Side } from "../../janggi/pieces";
import { SIDE_LABEL } from "../../janggi/pieces";
import { SETUPS } from "../../janggi/setups";
import type { Setup } from "../../janggi/setups";
import type { GameStatus } from "../../janggi/status";
import { 을를, 이가 } from "../../janggi/korean";

/** 내가 잡는 쪽. watch 는 엔진끼리 두는 것을 구경하는 것. */
export type MySide = Side | "watch";

interface Props {
  mySide: MySide;
  levelId: string;
  /** 대국이 이미 시작됐는지 (수를 한 번이라도 뒀는지) */
  started: boolean;
  status: GameStatus;
  /** 기권했으면 기권한 쪽 */
  resigned: Side | null;
  /** 시간패한 쪽 */
  flagged: Side | null;
  clockId: string;
  onClock: (id: string) => void;
  /** 엔진이 지금 생각하고 있는지 */
  thinking: boolean;
  analysisOn: boolean;
  onMySide: (side: MySide) => void;
  onLevel: (id: string) => void;
  onSetup: (side: Side, setup: Setup) => void;
  onNewGame: () => void;
  onResign: () => void;
  onAnalysisOn: (on: boolean) => void;
}

export function PlayPanel(props: Props) {
  const {
    mySide, levelId, started, status, resigned, flagged, thinking, analysisOn,
    clockId, onClock, onMySide, onLevel, onSetup, onNewGame, onResign, onAnalysisOn,
  } = props;

  const level = levelById(levelId);

  return (
    <div className="panel play">
      <div className="panel-title">
        대국
        {thinking && <span className="panel-meta">상대가 생각 중…</span>}
      </div>

      <div className="row">
        <span className="label">내가 잡을 쪽</span>
        <div className="seg">
          {(
            [
              ["cho", "초 楚"],
              ["han", "한 漢"],
              ["watch", "구경"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={
                (mySide === id ? "active " : "") + (id === "watch" ? "" : id)
              }
              onClick={() => onMySide(id)}
              title={
                id === "watch"
                  ? "엔진끼리 두는 것을 구경합니다"
                  : `${을를(SIDE_LABEL[id])} 잡고 둡니다`
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="row">
        <span className="label">상대 급수</span>
        <select
          value={level.id}
          onChange={(e) => onLevel(e.target.value)}
          aria-label="상대 급수"
        >
          {LEVELS.map((l) => (
            <option key={l.id} value={l.id} title={l.desc}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      <div className="row">
        <span className="label">시계</span>
        <select value={clockId} onChange={(e) => onClock(e.target.value)}>
          {CLOCK_PRESETS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="setup-block">
        <span className="label">상차림</span>
        {(["cho", "han"] as Side[]).map((side) => (
          <div key={side} className="row setup-row">
            <span className={"palette-side " + side}>{SIDE_LABEL[side]}</span>
            <div className="seg">
              {SETUPS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={started}
                  title={
                    started
                      ? "대국을 시작하면 바꿀 수 없습니다"
                      : `${s.alias} — ${s.desc}`
                  }
                  onClick={() => onSetup(side, s)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="row">
        <button type="button" className="primary" onClick={onNewGame}>
          새 대국
        </button>
        <button
          type="button"
          className="ghost"
          disabled={
            !started ||
            status.kind === "checkmate" ||
            resigned !== null ||
            flagged !== null
          }
          onClick={onResign}
        >
          기권
        </button>
      </div>

      <label className="row toggle">
        <input
          type="checkbox"
          checked={analysisOn}
          onChange={(e) => onAnalysisOn(e.target.checked)}
        />
        <span>두는 동안 훈수 보기</span>
      </label>

      {(status.kind === "checkmate" || resigned || flagged) && (
        <p className="play-result">
          {flagged
            ? `시간패 — ${이가(SIDE_LABEL[flagged === "cho" ? "han" : "cho"])} 이겼습니다.`
            : resigned
              ? `기권 — ${이가(SIDE_LABEL[resigned === "cho" ? "han" : "cho"])} 이겼습니다.`
              : status.kind === "checkmate"
                ? `외통 — ${이가(SIDE_LABEL[status.winner])} 이겼습니다.`
                : ""}
          {!resigned &&
            !flagged &&
            status.kind === "checkmate" &&
            mySide !== "watch" &&
            (status.winner === mySide ? " 축하합니다." : ` ${level.name} 상대였습니다.`)}
          {" 복기 탭에서 어디가 갈림길이었는지 볼 수 있습니다."}
        </p>
      )}
    </div>
  );
}
