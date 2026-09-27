// 대국 설정
//
// 한 판 두는 데 필요한 것만 둔다. 어느 쪽을 잡을지, 상대가 몇 급인지,
// 상차림을 어떻게 할지. 스레드·해시 같은 것은 분석 모드에 있다.

import { useEffect, useState } from "react";
import { LEVELS, levelById, thinkSeconds, 어림시간 } from "../../engine/levels";
import type { EngineOptions } from "../../engine/types";
import { CLOCK_PRESETS, CUSTOM_CLOCK_ID, describeClock } from "../../janggi/clock";
import type { ClockSettings } from "../../janggi/clock";
import type { Side } from "../../janggi/pieces";
import { SIDE_LABEL } from "../../janggi/pieces";
import { SETUPS, randomSetup } from "../../janggi/setups";
import type { Setup } from "../../janggi/setups";
import type { GameStatus } from "../../janggi/status";
import { 을를, 이가 } from "../../janggi/korean";

/** 내가 잡는 쪽. watch 는 엔진끼리 두는 것을 구경하는 것. */
export type MySide = Side | "watch";

/**
 * 규칙.
 *
 * 엔진 설정이 아니라 대국 설정이라 여기에 둔다. 스레드·해시는 '얼마나 깊게
 * 볼까' 지만 규칙은 '이 판을 어떻게 둘까' 라서 성격이 다르다. 판이 시작되면
 * 상차림과 같이 잠근다 — 두던 중에 승부 조건이 바뀌면 안 된다.
 */
const VARIANTS: { id: EngineOptions["variant"]; label: string; desc: string }[] = [
  { id: "janggi", label: "표준", desc: "빅장 있음 · 200수 뒤 점수제 판정" },
  { id: "janggimodern", label: "현대(카카오)", desc: "빅장 없음 · 수 반복 금지 · 200수 뒤 점수제" },
  { id: "janggitraditional", label: "전통", desc: "빅장 무승부 · 점수제 없음" },
];

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
  /** 직접 입력으로 맞춰 둔 시계 값 */
  customClock: ClockSettings;
  onCustomClock: (patch: Partial<ClockSettings>) => void;
  variant: EngineOptions["variant"];
  onVariant: (v: EngineOptions["variant"]) => void;
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
    clockId, onClock, customClock, onCustomClock, variant, onVariant,
    onMySide, onLevel, onSetup, onNewGame, onResign, onAnalysisOn,
  } = props;

  const level = levelById(levelId);

  /*
   * '새 대국' 은 되돌릴 수 없다. 두던 기보가 그대로 사라지고, 복기할 수 있었던
   * 판도 같이 날아간다. 그래서 두던 판이 있을 때만 한 번 더 묻는다.
   *
   * 확인 창(modal)을 띄우지 않고 버튼이 그 자리에서 바뀐다. 창은 흐름을 끊고,
   * 습관이 붙으면 읽지 않고 누르게 된다.
   */
  const [confirmNew, setConfirmNew] = useState(false);

  // 판이 바뀌면(새 대국을 눌렀거나 무르기로 처음에 왔거나) 묻던 것을 접는다.
  useEffect(() => {
    if (!started) setConfirmNew(false);
  }, [started]);

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
              {l.name} — {어림시간(thinkSeconds(l))}
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
          <option value={CUSTOM_CLOCK_ID}>
            직접 입력 — {describeClock(customClock)}
          </option>
        </select>
      </div>

      {clockId === CUSTOM_CLOCK_ID && (
        <div className="row clock-custom">
          <label>
            제한시간
            <input
              type="number"
              min={0}
              max={180}
              value={Math.round(customClock.mainSeconds / 60)}
              onChange={(e) =>
                onCustomClock({ mainSeconds: Number(e.target.value) * 60 })
              }
            />
            분
          </label>
          {/* 초읽기는 길이와 회수가 한 덩어리다. 따로 떨어지면 "5회" 가 무엇의
              회수인지 알 수 없어서 묶어 둔다. */}
          <span className="clock-byoyomi">
            <label>
              초읽기
              <input
                type="number"
                min={0}
                max={300}
                value={customClock.byoyomiSeconds}
                onChange={(e) =>
                  onCustomClock({ byoyomiSeconds: Number(e.target.value) })
                }
              />
              초
            </label>
            <label>
              <input
                type="number"
                min={0}
                max={20}
                value={customClock.byoyomiCount}
                onChange={(e) =>
                  onCustomClock({ byoyomiCount: Number(e.target.value) })
                }
              />
              회
            </label>
          </span>
        </div>
      )}

      <div className="row">
        <span className="label">규칙</span>
        <select
          value={variant}
          disabled={started}
          title={
            started
              ? "대국을 시작하면 바꿀 수 없습니다"
              : "승부가 어떻게 갈리는지를 정합니다"
          }
          onChange={(e) => onVariant(e.target.value as EngineOptions["variant"])}
        >
          {VARIANTS.map((v) => (
            <option key={v.id} value={v.id} title={v.desc}>
              {v.label}
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
              <button
                type="button"
                disabled={started}
                title={
                  started
                    ? "대국을 시작하면 바꿀 수 없습니다"
                    : "넷 중 하나를 무작위로 고릅니다"
                }
                onClick={() => onSetup(side, randomSetup())}
              >
                랜덤
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="row">
        {confirmNew ? (
          <>
            <button
              type="button"
              className="primary danger"
              onClick={() => {
                setConfirmNew(false);
                onNewGame();
              }}
            >
              기보를 지우고 시작
            </button>
            <button type="button" className="ghost" onClick={() => setConfirmNew(false)}>
              취소
            </button>
          </>
        ) : (
          <button
            type="button"
            className="primary"
            onClick={() => (started ? setConfirmNew(true) : onNewGame())}
          >
            새 대국
          </button>
        )}
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
