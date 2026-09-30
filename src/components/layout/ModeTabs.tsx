// 모드 탭 — 대국 · 기보
//
//   대국: 급수를 골라 엔진과 한 판 둔다
//   기보: 지난 판 목록에서 한 판을 골라 한 수씩 되짚고 복기한다
//
// 헤더 줄 안에 드는 분절 버튼이다. 탭 설명은 화면 읽기용 글자로만 둔다 - 보이게 두면
// 헤더가 높아지고 그만큼 판이 작아진다. 마우스를 올려도 설명(툴팁)이 뜨지 않는다.

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
          onClick={() => onMode(tab.id)}
        >
          <b>{tab.label}</b>
          <span>{tab.desc}</span>
        </button>
      ))}
    </nav>
  );
}
