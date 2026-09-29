// 대국 설정
//
// 한 판 두는 데 필요한 것만 둔다. 어느 쪽을 잡을지, 상대가 몇 급인지,
// 상차림을 어떻게 할지. 스레드·해시 같은 엔진 설정은 화면에 두지 않는다.

import { LEVELS, levelById, levelWaitLabel } from "../../engine/levels";
import type { EngineOptions } from "../../engine/types";
import { CLOCK_PRESETS, describeClock } from "../../janggi/clock";
import type { Side } from "../../janggi/pieces";
import { SIDE_LABEL } from "../../janggi/pieces";
import { SETUPS } from "../../janggi/setups";
import type { Setup } from "../../janggi/setups";
import type { GameStatus } from "../../janggi/status";
import { outcomeOf } from "../../janggi/status";
import { 을를 } from "../../janggi/korean";

/*
 * 예전에는 '구경'(엔진끼리 두는 것을 지켜보기)이 세 번째 선택지로 있었다.
 * 내가 잡을 쪽을 고르는 자리에 '아무 쪽도 안 잡는다' 가 끼어 있어서, 고르는
 * 줄 전체가 무슨 질문인지 흐려졌다. 엔진끼리 두는 것을 보고 싶으면 분석
 * 모드에서 최선수를 따라 두면 되므로 잃는 것도 없다.
 */

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
  mySide: Side;
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
  variant: EngineOptions["variant"];
  onVariant: (v: EngineOptions["variant"]) => void;
  /** 엔진이 지금 생각하고 있는지 */
  thinking: boolean;
  onMySide: (side: Side) => void;
  onLevel: (id: string) => void;
  /** 이 판을 시작한 상차림. 시작 국면이 넷 중 어느 것도 아니면 null. */
  setups: Record<Side, Setup | null>;
  onSetup: (side: Side, setup: Setup) => void;
  onNewGame: () => void;
  onResign: () => void;
}

export function PlayPanel(props: Props) {
  const {
    mySide, levelId, started, status, resigned, flagged, thinking,
    clockId, onClock, variant, onVariant,
    onMySide, onLevel, setups, onSetup, onNewGame, onResign,
  } = props;

  const level = levelById(levelId);
  /** 끝났는지, 끝났다면 어떻게. 기권 버튼이 이 하나를 본다. */
  const outcome = outcomeOf(status, resigned, flagged);

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
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={(mySide === id ? "active " : "") + id}
              onClick={() => onMySide(id)}
              title={`${을를(SIDE_LABEL[id])} 잡고 둡니다`}
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
          {LEVELS.map((l) => {
            const wait = levelWaitLabel(l);
            return (
              <option key={l.id} value={l.id} title={l.desc}>
                {l.name}
                {wait && ` - 한 수 ${wait}`}
              </option>
            );
          })}
        </select>
      </div>
      {/*
        고른 급수가 어떤 상대인지 적는다. 예전에는 option 의 title 에만 있어서
        마우스를 올려야 보였다 — 폰에서는 볼 방법이 아예 없었다.
      */}
      <p className="muted small level-desc">{level.desc}</p>

      {/*
        시계는 두 가지라 셀렉트 대신 분절 버튼이다. 펼쳐 봐야 둘뿐인 것을
        접어 둘 까닭이 없다. 5분의 초읽기(30초 3회)는 툴팁이 말한다.
      */}
      <div className="row">
        <span className="label">시계</span>
        <div className="seg">
          {CLOCK_PRESETS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={clockId === c.id ? "active" : ""}
              aria-pressed={clockId === c.id}
              title={describeClock(c)}
              onClick={() => onClock(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

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
      {/*
        고른 상차림을 짚어 준다. 예전에는 대국 탭에만 이 표시가 없어서, 무엇을
        골랐는지 판을 들여다봐야 알았고 버튼 두 줄이 통째로 꺼진 것처럼 보였다.
        대국이 시작되면 잠기지만 고른 칸은 그대로 남는다.

        '랜덤' 은 뺐다. 누르는 순간 넷 중 하나로 정해져 버려서 고른 칸 표시와
        겹쳤고(랜덤을 눌렀는데 다른 칸이 켜진다), 한 줄에 다섯을 넣느라 칸이
        좁아졌다.
      */}
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
                  className={setups[side]?.id === s.id ? "active" : ""}
                  aria-pressed={setups[side]?.id === s.id}
                  disabled={started}
                  title={
                    started
                      ? "대국을 시작하면 바꿀 수 없습니다"
                      : `${s.alias} - ${s.desc}`
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

      {/* 두던 판이 있으면 App 이 확인 창(ConfirmDialog)으로 한 번 더 묻는다. */}
      <div className="row">
        <button type="button" className="primary" onClick={onNewGame}>
          새 대국
        </button>
        <button
          type="button"
          className="ghost"
          // 끝난 판에는 기권할 것이 없다. 예전에는 외통·기권·시간패만 보고
          // 있어서, 수몰이나 200수 점수로 끝난 판에서는 버튼이 살아 있었다.
          disabled={!started || outcome !== null}
          onClick={onResign}
        >
          기권
        </button>
      </div>

      {/*
        대국이 끝났을 때 결과는 화면 가운데 팝업(GameOverDialog)이 말한다.
        여기에도 결과 카드가 있었는데, 판 위 배너까지 셋이 같은 말을 하고
        있었다. 이 칸은 '이 판을 어떻게 둘까'를 정하는 곳이지 결과를 알리는
        곳이 아니다. outcome 은 기권 버튼을 잠그는 데만 남는다.
      */}
    </div>
  );
}
