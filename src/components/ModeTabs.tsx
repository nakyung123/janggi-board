// 모드 탭
//
// 지금까지는 패널 다섯 개가 오른쪽에 전부 세로로 쌓여 있었다. 그래서 그냥
// 한 판 두고 싶은 사람도 스레드·해시 슬라이더를 봐야 했다. 하는 일이 셋으로
// 뚜렷이 갈리므로 화면도 셋으로 나눈다.

export type Mode = "play" | "analyze" | "review";

interface Props {
  mode: Mode;
  onMode: (mode: Mode) => void;
  /** 복기할 기보가 없으면 복기 탭을 눌러도 할 게 없다 */
  canReview: boolean;
}

const TABS: { id: Mode; label: string; desc: string }[] = [
  { id: "play", label: "대국", desc: "급수를 골라 엔진과 둔다" },
  { id: "analyze", label: "분석", desc: "판을 고쳐놓고 그 국면을 분석한다" },
  { id: "review", label: "복기", desc: "둔 기보를 한 수씩 되짚는다" },
];

export function ModeTabs({ mode, onMode, canReview }: Props) {
  return (
    <nav className="mode-tabs" aria-label="모드">
      {TABS.map((tab) => {
        const disabled = tab.id === "review" && !canReview;
        return (
          <button
            key={tab.id}
            type="button"
            className={"mode-tab" + (mode === tab.id ? " active" : "")}
            disabled={disabled}
            aria-current={mode === tab.id ? "page" : undefined}
            title={disabled ? "둔 수가 있어야 복기할 수 있습니다" : tab.desc}
            onClick={() => onMode(tab.id)}
          >
            <b>{tab.label}</b>
            <span>{tab.desc}</span>
          </button>
        );
      })}
    </nav>
  );
}
