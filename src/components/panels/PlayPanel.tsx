// 대국 설정
//
// 한 판 두는 데 필요한 것만 둔다. 어느 쪽을 잡을지, 상대가 몇 급인지,
// 상차림을 어떻게 할지. 스레드·해시 같은 것은 분석 모드에 있다.

import { LEVELS, levelById, thinkSeconds } from "../../engine/levels";
import { CLOCK_PRESETS, clockPresetById } from "../../janggi/clock";
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
  /** 착수 소리 */
  soundOn: boolean;
  onSoundOn: (on: boolean) => void;
  onMySide: (side: MySide) => void;
  onLevel: (id: string) => void;
  onSetup: (side: Side, setup: Setup) => void;
  onNewGame: () => void;
  onResign: () => void;
  onAnalysisOn: (on: boolean) => void;
}

/** "약 12초" 처럼 읽기 좋게. 1초 아래는 굳이 소수점을 보여주지 않는다. */
function 어림초(sec: number): string {
  if (sec < 1) return "1초 안";
  if (sec < 10) return `약 ${sec.toFixed(1)}초`;
  return `약 ${Math.round(sec)}초`;
}

export function PlayPanel(props: Props) {
  const {
    mySide, levelId, started, status, resigned, flagged, thinking, analysisOn,
    clockId, onClock, onMySide, onLevel, onSetup, onNewGame, onResign, onAnalysisOn,
    soundOn, onSoundOn,
  } = props;
  const clock = clockPresetById(clockId);

  const level = levelById(levelId);
  const engineSideLabel =
    mySide === "watch" ? "양쪽 다" : SIDE_LABEL[mySide === "cho" ? "han" : "cho"];

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
      <p className="muted small">
        초(楚)가 선수입니다. 한(漢)은 후수라 1.5점 덤을 받습니다.
        지금은 엔진이 <b>{을를(engineSideLabel)}</b> 잡습니다.
      </p>

      {/* 급수 — 이 앱의 핵심 손잡이라 가장 크게 둔다 */}
      <div className="level-block">
        <div className="row">
          <span className="label">상대 급수</span>
          <span className="level-now">{level.name}</span>
        </div>
        <input
          className="level-slider"
          type="range"
          min={0}
          max={LEVELS.length - 1}
          step={1}
          value={Math.max(0, LEVELS.findIndex((l) => l.id === level.id))}
          onChange={(e) => onLevel(LEVELS[Number(e.target.value)].id)}
          aria-label="상대 급수"
        />
        <div className="level-ends muted small">
          <span>{LEVELS[0].name}</span>
          <span>{LEVELS[LEVELS.length - 1].name}</span>
        </div>
        <p className="level-desc">{level.desc}</p>
        <p className="muted small">
          한 수에 {level.nodes.toLocaleString()}노드까지 봅니다
          {" — 보통 PC 에서 " + 어림초(thinkSeconds(level))}. 시간이 아니라
          탐색량으로 끊기 때문에 느린 기기에서도 같은 실력입니다.
        </p>
        <p className="muted small">
          ※ 이름은 장기 급수에서 빌려 왔을 뿐 <b>공인 급수가 아닙니다.</b>{" "}
          이 앱 안에서만 쓰는 눈금입니다.
        </p>
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
      <p className="muted small">
        {clock.enabled
          ? `첫 수가 놓이면 시계가 돕니다. 제한시간을 다 쓰면 ${clock.byoyomiSeconds}초 초읽기 ` +
            `${clock.byoyomiCount}회로 넘어가고, 회 안에 두면 회수가 줄지 않습니다.`
          : "시간에 쫓기지 않고 천천히 둡니다. 기보를 되짚는 동안에도 멈춰 있습니다."}
      </p>

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
        <span>
          두는 동안 훈수 보기
          <span className="muted small"> — 엔진의 추천수가 그대로 보입니다</span>
        </span>
      </label>

      <label className="row toggle">
        <input
          type="checkbox"
          checked={soundOn}
          onChange={(e) => onSoundOn(e.target.checked)}
        />
        <span>
          착수 소리
          <span className="muted small"> — 기물을 놓을 때 소리가 납니다</span>
        </span>
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
