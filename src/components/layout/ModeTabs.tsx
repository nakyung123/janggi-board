// 모드 탭
//
// 대국과 기보 둘이다.
//
// 예전에는 대국·분석·복기 셋이었다. 분석(판 편집·FEN·실시간 후보수·엔진 설정)은
// 엔진과 한 판 두러 온 사람에게는 쓸 일이 없는 화면이라 뺐다. 필요하다는 말이
// 나오면 그때 되살린다. 복기는 '방금 둔 판' 하나만 볼 수 있었는데, 이제 기보
// 탭이 지난 판 목록을 보여주고 거기서 고른 판을 복기한다.

export type Mode = "play" | "games";

interface Props {
  mode: Mode;
  onMode: (mode: Mode) => void;
}

const TABS: { id: Mode; label: string; desc: string }[] = [
  { id: "play", label: "대국", desc: "급수를 골라 엔진과 둔다" },
  { id: "games", label: "기보", desc: "지난 판을 골라 한 수씩 되짚는다" },
];

export function ModeTabs({ mode, onMode }: Props) {
  return (
    <nav className="mode-tabs" aria-label="모드">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={"mode-tab" + (mode === tab.id ? " active" : "")}
          aria-current={mode === tab.id ? "page" : undefined}
          title={tab.desc}
          onClick={() => onMode(tab.id)}
        >
          <b>{tab.label}</b>
          <span>{tab.desc}</span>
        </button>
      ))}
    </nav>
  );
}
