---
version: alpha
name: 장기 분석판
description: "스크롤 없는 한 화면 장기 도구. 나무 판이 화면의 주인공이고, 둘레는 판에서 뽑은 한지·먹 톤으로 물러나 있다. 색이 보이면 그건 초·한 어느 편인지를 말한다."

colors:
  primary: "#2a2119"         # 주 버튼. 브랜드 색을 따로 두지 않고 먹(ink)을 쓴다
  canvas: "#f4efe6"          # 페이지 바탕. 한지
  surface: "#fffdf9"         # 카드·입력칸
  surface-soft: "#efe8dd"    # 분절 버튼 홈, 눌러 둔 칸, 시계 칸
  hairline: "#e8dfd0"        # 칸 나눔선
  line: "#d9ccb6"            # 버튼 테두리 (글자가 버튼임을 알려 주므로 장식선)
  control-line: "#8c7a5e"    # 셀렉트·입력칸 테두리. 카드 위 4.08:1
  ink: "#2a2119"             # 먹. 본문, 주 버튼 바탕. 카드 위 15.5:1
  ink-hover: "#45372a"
  ink-sub: "#5a4a38"         # 보조 정보
  muted: "#6b5c48"           # 라벨·설명. 카드 6.36:1, canvas 5.64:1, surface-soft 5.31:1
  disabled: "#9a8c75"        # 누를 수 없는 버튼의 글자(대비 기준 밖, 2.7~3.2:1)
  on-ink: "#ffffff"
  cho: "#15653c"             # 초 진영. 카드 6.99:1
  han: "#b3261e"             # 한 진영. 카드 6.43:1
  han-strong: "#8f1d17"      # 되돌릴 수 없는 버튼의 호버, 대국자 카드의 '장군' 글자
  han-soft: "#fef2f2"        # 대국자 카드의 '장군' 바탕, 급한 시계 칸
  han-soft-line: "#f5cccc"
  warn: "#85610f"            # 헤더의 '판 편집 중'·'잘못된 판'. 카드 5.57:1, canvas 4.94:1
  accent: "#2563eb"          # 엔진이 말하는 값(포커스, 슬라이더)에만
  accent-strong: "#1d4ed8"   # 판 위 최선수 화살표. 가장 어두운 나무 위 3.86:1
  amber: "#b84300"           # 미리 보는 수, 평가 그래프 커서. 가장 어두운 나무 위 3.15:1
  alert: "#b91c1c"           # 장군 맞은 궁의 테, 잡을 수 있는 칸. 가장 어두운 나무 위 3.73:1
  grade-inaccuracy: "#8a5a00" # 복기 '부정확'. surface-soft 4.87:1
  grade-mistake: "#a64b00"   # 복기 '실수'. surface-soft 4.76:1. 악수(han)와 갈리게 주황

typography:
  display:     { fontFamily: Pretendard, fontSize: 24px, fontWeight: 700, lineHeight: 1.2, letterSpacing: -0.025em }
  title:       { fontFamily: Pretendard, fontSize: 20px, fontWeight: 600, lineHeight: 1.4, letterSpacing: -0.025em }
  app-name:    { fontFamily: Pretendard, fontSize: 20px, fontWeight: 700, lineHeight: 1.4, letterSpacing: -0.025em }
  body:        { fontFamily: Pretendard, fontSize: 16px, fontWeight: 400, lineHeight: 1.4, letterSpacing: -0.025em }
  body-strong: { fontFamily: Pretendard, fontSize: 16px, fontWeight: 600, lineHeight: 1.4, letterSpacing: -0.025em }
  button:      { fontFamily: Pretendard, fontSize: 16px, fontWeight: 500, lineHeight: 1.4, letterSpacing: -0.025em }
  numeric:     { fontFamily: Pretendard, fontSize: 16px, fontWeight: 600, lineHeight: 1.4, letterSpacing: 0 }
  numeric-lg:  { fontFamily: Pretendard, fontSize: 24px, fontWeight: 700, lineHeight: 1.2, letterSpacing: 0 }

rounded:
  inner: 6px
  control: 8px
  card: 16px
  full: 9999px

spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  2xl: 24px
  3xl: 32px
  panel-width: 400px
  label-column: 96px

components:
  panel:           { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", typography: "{typography.body}", rounded: "{rounded.card}", padding: 16px }
  panel-title:     { textColor: "{colors.ink}", typography: "{typography.title}" }
  button:          { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", typography: "{typography.button}", rounded: "{rounded.control}", height: 40px, padding: 0 16px }
  button-primary:  { backgroundColor: "{colors.primary}", textColor: "{colors.on-ink}", typography: "{typography.button}", rounded: "{rounded.control}", height: 40px, padding: 0 20px }
  button-danger:   { backgroundColor: "{colors.han}", textColor: "{colors.on-ink}", typography: "{typography.button}", rounded: "{rounded.control}", height: 40px, padding: 0 20px }
  button-disabled: { backgroundColor: "{colors.surface}", textColor: "{colors.disabled}", typography: "{typography.button}", rounded: "{rounded.control}", height: 40px }
  select:          { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", typography: "{typography.body}", rounded: "{rounded.control}", height: 40px, padding: 0 12px }
  segmented:       { backgroundColor: "{colors.surface-soft}", textColor: "{colors.muted}", typography: "{typography.button}", rounded: "{rounded.control}", padding: 4px }
  segmented-on:    { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", typography: "{typography.body-strong}", rounded: "{rounded.inner}", height: 32px }
  field-label:     { textColor: "{colors.muted}", typography: "{typography.body}", width: 96px }
  empty-state:     { textColor: "{colors.muted}", typography: "{typography.body}", padding: 16px 8px }
  player-bar:      { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", typography: "{typography.body}", rounded: "{rounded.control}", height: 38px, padding: 0 12px }
  player-clock:    { backgroundColor: "{colors.surface-soft}", textColor: "{colors.ink}", typography: "{typography.numeric}", rounded: "{rounded.inner}", height: 28px, padding: 0 8px }
  player-check:    { backgroundColor: "{colors.han-soft}", textColor: "{colors.han-strong}", typography: "{typography.body-strong}", rounded: "{rounded.inner}", height: 28px, padding: 0 8px }
  toast:           { backgroundColor: "{colors.primary}", textColor: "{colors.on-ink}", typography: "{typography.body}", rounded: "{rounded.control}", padding: 12px 16px }
  review-count:    { textColor: "{colors.ink}", typography: "{typography.numeric-lg}" }
---

# 장기 분석판 DESIGN.md

기준은 [DESIGN-BASE](https://github.com/nakyung123/design-base)(로컬 `c:\nakyung\design-base\DESIGN-BASE.md`)다. 이 앱은 그 파일의 §8.11 **게임·도구형(한 화면 앱)** 이라, 섹션 간격·1920 프레임·콘텐츠 폭 같은 스크롤 페이지용 값은 쓰지 않는다. 이 파일과 DESIGN-BASE가 다르면 이 파일을 따른다.

토큰의 실제 값은 `src/styles/base.css` 의 `:root` 에 있다. 이 파일을 고치면 거기도 같이 고친다.

## Overview

- **판이 주인공이다.** 페이지는 스크롤되지 않고, 남는 세로가 곧 판 크기다. 여백 하나를 늘리기 전에 판이 줄어드는지 먼저 잰다.
- **둘레는 판에서 뽑은 톤이다.** 한지 바탕, 먹 글자·주 버튼. 판과 둘레가 한 세계로 읽혀야 한다. 시안 넷(중립 회색·한지 × 지금 구조·개선 구조)을 나란히 놓고 한지 + 개선 구조를 골랐다(2026-09-29).
- **색은 뜻이 있을 때만.** 껍데기(버튼·탭·카드)는 한지·먹 톤이다. 초록·빨강은 진영, 파랑은 엔진이 알려 주는 값이다.
- **판과 패널은 한 덩어리다.** 둘이 화면 양 끝으로 벌어지지 않게 가운데에 모은다.
- **글자는 16px 아래로 내리지 않는다.** 화면이 작아도 읽어야 할 때 읽혀야 한다(기존 결정). 위계가 필요하면 아래를 내리지 않고 위(제목 20, 큰 숫자 24)를 올린다.

## Colors

- 껍데기는 한지(바탕·카드·한 톤 짙은 칸)와 먹(글자·주 버튼) 두 계열이다. 푸른 회색을 섞지 않는다. 그림자도 먹빛(`rgba(60,40,15,…)`).
- 텍스트는 세 단계다. `ink` 본문·값, `ink-sub` 보조 정보, `muted` 라벨·설명. 누를 수 없는 버튼은 `disabled` 글자색만 바꾸고 버튼을 반투명으로 흐리지 않는다(한지 위에서 탁한 얼룩이 된다). 먹 바탕 주 버튼만 통째로 흐린다.
- 셀렉트·입력칸은 테두리만으로 알아봐야 하므로 `control-line`(3:1 이상)을 쓴다. 버튼은 글자가 버튼임을 알려 주므로 옅은 `line`을 쓴다.
- 판 위 표시(화살표·장군 테·잡을 수 있는 칸·집어 든 기물의 테)는 가장 어두운 나무색 `#e2c081` 위에서도 3:1 이상이어야 한다. 집어 든 기물의 테는 편집 팔레트의 '고른 기물' 과 같은 `ink`.
- 직전 수는 색이 아니라 흰빛이다. 출발 자리는 칸 0.6, 도착 자리는 기물이 가운데를 덮으므로 칸 0.8 에 70% 까지 거의 불투명하게. 진영색 테·번짐 시안은 '잡을 수 있는 칸' 의 붉은 테나 경고로 읽혀 버렸다.
- 나무 판·기물·팔레트 기물 칸의 나무색은 판 그림의 일부라 이 토큰과 따로 둔다(`Board.tsx`, `PieceGlyph.tsx`, `board.css`).
- CSS에 색을 직접 쓰지 않는다. 전부 토큰에서 꺼낸다.

| 이 파일 | CSS 변수 |
| --- | --- |
| canvas · surface · surface-soft | `--bg` · `--panel` · `--panel-2` (`--line-soft` 도 같은 값) |
| hairline · line · control-line | `--line` · `--line-strong` · `--control-line` |
| ink · ink-sub · muted · disabled | `--text`(=`--ink`) · `--text-sub` · `--muted` · `--disabled` |
| grade-inaccuracy · grade-mistake | `--g-inaccuracy` · `--g-mistake` (`review.css`) |
| 나머지 | 같은 이름에 `--` |

## Typography

- 서체는 **Pretendard 하나**(가변 글꼴, 동적 서브셋). 외부 서버에서 받지 않고 npm 패키지를 번들에 넣어 앱과 같은 출처에서 준다(COEP `require-corp`, 인터넷 없이 동작). 대국·분석 탭을 띄우는 동안 받는 조각은 15개, 374KB였다(2026-09-29 측정).
- **한자는 예외로 기기의 한국어 고딕**(맑은 고딕 → 애플 SD 고딕 네오 → Noto Sans CJK KR)에서 받는다. Pretendard 에는 장기 한자 열 자 가운데 車·士 두 자만 있어서, 그대로 두면 한 기보 줄 안에서 한자 글꼴이 둘로 갈린다. `base.css` 의 `@font-face "Janggi Hanja"` 가 한자 범위(U+4E00–9FFF 등)만 `local()` 로 잡아 맨 앞에 선다. 내려받는 것은 없다.
- 명조는 쓰지 않는다. 예전에는 기보·대국자 카드의 한자가 명조라, 같은 줄에서 수 번호(고딕)와 수의 숫자(명조) 모양이 달랐다.
- 크기는 **16·20·24 세 가지**다. 16 본문·버튼·라벨, 20 앱 이름·패널 제목·초읽기 시계, 24 대국 결과·마지막 5초 시계·복기 성적 숫자·로딩 제목.
- 굵기는 역할로 나눈다. 400 본문, 500 버튼, 600 패널 제목·강조(`b`)·숫자, 700은 앱 이름과 24px 표시에만.
- 행간 1.4(큰 표시 1.2, 시계 숫자 1). 자간 -0.025em. 숫자·FEN·수 표기 칸은 자간 0과 고정폭 숫자(`tabular-nums`)로 자릿수가 바뀌어도 흔들리지 않게 한다.

## Layout

- **뼈대:** 헤더 한 줄 + 무대(판 칸 | 패널 칸). 헤더·무대는 같은 폭의 가운데 덩어리다. 앱 이름의 왼쪽 끝이 판의 왼쪽 끝과 맞는다.
- **판 칸에는 판과 대국자 카드(편집 중에는 팔레트) 말고 끼우지 않는다.** 판 크기가 남은 높이로 정해져서, 조건부로 뜨는 줄이 하나 끼면 판이 그만큼 줄었다 늘었다 한다. 예전의 장군·결과 배너가 뜨면 1440×900 에서 판이 659×732 → 608×676 이 됐다. 상태는 높이가 박힌 자리(대국자 카드, 헤더 한 줄)에서 말하고, 한 번 말하고 마는 알림은 자리를 차지하지 않는 `toast` 로 띄운다.
- **덩어리 폭 = 판이 들어갈 폭 + 사이 + 패널 400.** 판이 들어갈 폭(`--board-fit`)은 판 자리 높이 × 판의 가로세로 비(556:618)로 `App.tsx` 가 잰다. 그린 뒤의 판 폭(`--board-w`)으로 잡으면 판이 제 칸을 묶어 창을 키워도 커지지 않는다.
- **같은 창 크기에서는 덩어리 폭을 줄이지 않는다.** 편집 팔레트가 끼어 판이 낮아져도 판만 제 칸 안에서 줄고 헤더·패널은 움직이지 않는다.
- **판과 패널 사이는 고정 간격**이다. 1280 미만 24, 1280 이상 32. 남는 가로는 화면 양옆으로 간다.
- **오른쪽 칸:** 맨 위 판 조작 줄은 카드 없이 바탕 위 도구 줄, 그 아래 설정·기보는 카드. 카드 세 장이 같은 무게로 쌓이지 않게 판에 딸린 손잡이는 카드 한 겹을 벗긴다.
- **간격은 4·8·12·16·20·24·32만 쓴다.** 패널 안쪽 16(세로 900 이상이면 20), 패널 사이 12, 제목→내용 16, 폼 줄 사이 12, **묶음 사이 24**(상차림 블록 위아래, 주 행동 줄 위). 묶음은 선이 아니라 간격으로 가른다. 1~2px은 기물 줄처럼 촘촘한 묶음에만.
- **폼은 라벨 열 96 고정.** 라벨 옆 컨트롤(셀렉트·분절 버튼)은 줄 끝까지 차서 오른쪽 끝이 한 줄로 맞는다. 딸린 설명·직접 입력 줄은 컨트롤의 왼쪽 끝(96 + 12)에 맞춘다.
- **넓은 컨트롤은 라벨을 위에.** 상차림, FEN, 생각 시간(`.row.stacked`)처럼 라벨 옆에 들어가지 않는 것.
- **대국자 카드는 판 위아래.** 한국 장기 앱의 공통 배치라 옮기지 않는다.

## Elevation & Depth

| 단계 | 값 | 쓰임 |
| --- | --- | --- |
| 평면 | 없음 | 헤더, 판 칸 바탕, 판 조작 도구 줄 |
| 카드 | `0 1px 2px rgba(60,40,15,.06)`, 테두리는 투명 | 패널, 둘 차례인 대국자 카드 |
| 떠 있는 칸 | `0 1px 3px rgba(60,40,15,.1)` | 분절 버튼·모드 탭의 고른 칸 |
| 판 | `0 2px 4px rgba(60,40,15,.08), 0 16px 40px rgba(60,40,15,.12)` | 장기판 한 곳 |
| 알림 | `0 8px 24px rgba(60,40,15,.24)` | `toast`. 카드 위에 떠야 해서 카드보다 한참 짙다 |
| 대화상자 | `0 8px 12px rgba(16,24,40,.08), 0 24px 56px rgba(16,24,40,.18)` + 딤드 32% | 대국 결과, 새 대국·기권 확인. 판이 뒤로 보여야 해서 딤드를 옅게 둔다 |

카드는 테두리와 그림자를 둘 다 두지 않는다(경계가 두 겹이 된다). 테두리를 투명으로 남기는 건 윈도우 고대비 모드에서 칸이 선으로 보이게 하려는 것이다. 그림자는 "거의 안 보이게". 새 단계를 만들지 않는다.

## Shapes

- 카드 16, 컨트롤(버튼·셀렉트·분절 버튼 홈·대국자 카드·알림) 8, 컨트롤 안에 한 겹 더 든 칸(분절 버튼 칸·시계 칸·장군 표시·기보 칸) 6, 진행 막대·점은 풀라운드.
- 장기판의 CSS 모서리는 `1.619% / 1.456%` 다. SVG 나무판의 rx 9(556×618 기준)와 같은 비율이라 판이 커져도 그림자와 나무 모서리가 겹친다.
- 같은 줄에 나란히 서는 버튼·셀렉트·분절 버튼은 높이 40으로 같다.

## Components

- **아이콘:** Lucide(`lucide-react`, 선 아이콘, 24 격자). 버튼 안은 20 / 선 2(버튼 글자 500 과 맞춤), 빈 상태는 24 / 선 1.75. 뜻이 어디서나 같은 곳(처음·이전·다음·끝)에만 쓰고, 그림으로 옮기면 뜻이 흐려지는 곳(판 뒤집기·한수쉼)은 글자만 둔다. 아이콘만 있는 버튼은 `aria-label`.
- **버튼:** 한 패널에 채운 버튼(`button-primary`)은 하나. 나머지는 카드색 바탕 + `line` 테두리, 덜 중요한 것은 테두리 없는 고스트. 되돌릴 수 없는 확인 단계만 `button-danger`로 붉힌다. 목록 칸 버튼(기보 칸·복기 수·팔레트 기물·글 속 링크)은 40 높이를 따르지 않는다.
- **판 조작 줄:** 두 줄이 패널 폭을 꽉 채운다. 윗줄은 처음·끝(아이콘만, 40 정사각)과 무르기·다시(아이콘 + 글자, 남은 폭을 반씩), 아랫줄은 판 뒤집기·한수쉼을 반씩. 여섯 개가 400 한 줄에 안 들어가서 두 줄이다.
- **분절 버튼**(모드 탭, 초·한 고르기, 시계, 보기·편집, 생각 시간, 상차림): 홈 `surface-soft` 안쪽 4, 칸 32. 고른 칸만 카드색 바탕 + 떠 있는 칸 그림자 + 600. 잠긴 칸은 글자만 `disabled`, 고른 칸은 잠겨도 먹색으로 남는다.
- **상차림:** 네 가지(마상상마·상마마상·마상마상·상마상마)를 같은 폭으로 한 줄에. 대국·분석 두 탭 모두 지금 상차림을 짚는다(대국 탭은 시작 국면에서 되읽는다). 랜덤은 두지 않는다. 셀렉트로 바꾸지 않는다 - 셀렉트는 이미 고른 값을 다시 골라도 아무 일이 없어서 '같은 상차림으로 되돌리기' 가 사라진다.
- **빈 상태**(기보·형세·분석 꺼짐): 아이콘(`disabled` 색) + 무엇이 없는지(`ink-sub` 600) + 어떻게 하면 생기는지(`muted`). 가운데 정렬.
- **대국자 카드:** 높이 38, 진영 색은 테두리·시간 막대·진영 글자에만. 시계는 `player-clock`, 초읽기는 20 + `han`, 마지막 5초는 `numeric-lg` + `han`.
  - 맨 끝 '둘 차례' 자리가 장군·승패도 말한다. 장군은 `player-check`(칸 28이라 카드가 자라지 않는다), 이긴 쪽 "승" 은 진영 색, 진 쪽 "외통패·기권패·시간패·점수패" 와 "무승부" 는 `ink` 600. 시간패는 시계 칸이 이미 "시간패" 라 겹쳐 적지 않는다.
  - 분석 탭에서는 기권·시간패를 적지 않는다(대국에 붙는 결과라서). 외통·수몰·점수는 국면의 판정이라 적는다.
- **헤더:** 앱 이름(`app-name`) + 모드 탭. 둘 차례는 대국자 카드가 말하므로 헤더에 두지 않는다. 오른쪽에 `warn` 으로 편집 중에는 "판 편집 중", 편집을 마친 뒤에도 규칙에 맞지 않는 판이면 "잘못된 판". 무엇이 틀렸는지는 툴팁과 국면 카드의 경고 목록이 말한다. 폰(390)에서 앱 이름·탭 옆에 남는 자리가 71이라 말을 이보다 길게 하지 않는다.
- **알림**(`toast`): "기보를 불러왔습니다" 처럼 한 번 말하고 마는 것. 오른쪽 칸 아래, 카드 안 글자 칸과 같은 좌우 끝에 떴다가 4초 뒤 사라진다. 폰(900 이하)은 화면 아래 12 여백에 붙는다. 자리를 차지하지 않는다. 결과 팝업·대국자 카드가 이미 말하는 것(시간패)은 알림으로 또 띄우지 않는다.
- **화면 읽기 프로그램:** 장군·결과·잘못된 판은 헤더 안 보이지 않는 `role="status"` 한 줄이 문장으로 읽어 준다(`statusMessage`·`outcomeMessage`).
- **복기 성적표:** 등급별 개수는 `numeric-lg`(24/700) + 등급 색, 이름은 16 `muted`. 숫자가 이 패널의 알맹이다.
- **체크박스:** 20×20, `accent-color: ink`. 라벨 글자까지 눌리고 줄 높이 40.
- **가운데 창**(결과·확인): 폭 340, 가운데 정렬, 버튼은 가운데에 둘. 결과 창은 제목 `display`(24/700) + 끝난 까닭 한 줄 + [기보 보기(주)][닫기(고스트)], 초점은 기보 보기. 확인 창은 제목 `title`(20/600, 끝난 게 아니라 묻는 중이라 한 단계 낮다) + 한 줄 + [확인(되돌릴 수 없으면 `button-danger`)][취소], 초점은 **취소**. Esc·바깥 누름은 닫기·취소.
- **기물 집기:** 대국에서는 내 차례에 내 기물만 들린다(`canPick`). 들 수 없는 기물은 손 모양 커서도 없다. 고른 내 기물로 잡을 수 있는 상대 기물만 손가락 커서.

## Do's and Don'ts

- Do: 새 값이 필요하면 먼저 이 파일의 토큰 안에서 고른다.
- Do: 레이아웃을 바꾸면 판 크기를 잰다. 기준(2026-09-29): 1440×900 659×732, 1920×1080 821×912, 1280×720 522×580, 390×844 366×407. 이보다 작아지면 안 된다.
- Do: 창 크기를 바꿔 가며(1920 → 1440 → 1920) 판이 매번 제 크기로 돌아오는지 본다.
- Do: 폰 확인은 기보에 수가 있는 상태로 한다. 빈 기보에서는 기보 칸 버튼이 없어서 44 검사에 안 걸린다.
- Do: 상태를 알리는 표시를 더하면 그게 뜰 때와 질 때 판 크기·위치를 잰다. 장군·기권·시간패·잘못된 판·알림에서 판이 기준 크기 그대로인지 본다(폰은 헤더가 한 줄인지도).
- Don't: 판 위아래에 조건부로 뜨는 줄(배너)을 끼우지 않는다.
- Don't: 껍데기에 진영 색·파랑을 칠하지 않는다.
- Don't: 16px보다 작은 글자, 16·20·24 밖의 크기, Pretendard 밖의 글꼴을 쓰지 않는다(한자만 기기 고딕).
- Don't: 판과 패널 사이를 화면 폭에 따라 늘리지 않는다.
- Don't: 묶음을 선으로 가르지 않는다. 간격(12 안, 24 사이)으로 가른다.

## Responsive Behavior

- **900 초과:** 판 칸 | 패널 칸 2단, 가운데 덩어리. 판 크기는 남은 세로가 정한다.
- **900 이하:** 1단. 헤더 → 판 → 패널 순으로 세로로 쌓고, 이때만 페이지가 스크롤된다. 좌우 여백 12(판이 화면 폭을 채우므로 여백이 곧 판 크기).
- **세로 900 이상:** 앱 여백 12·24·16, 패널 안쪽 20. 그 아래는 8·16·8, 16.
- **세로 780 이하:** 헤더 위아래와 판 둘레 틈을 4로.
- **터치 기기(`pointer: coarse`):** 버튼·셀렉트·입력칸·체크박스 줄·기보 칸·복기 수 44 이상. 분절 버튼·모드 탭은 칸 36에 보이지 않는 판을 덧대(`::after`, 테두리 바깥 기준 위아래 4) 눌리는 높이 44. 이 규칙은 목록 칸의 `min-height: 0` 보다 뒤에 둬야 이긴다.

## Iteration Guide

1. 토큰(`base.css :root`)부터 바꾸고, 컴포넌트 CSS는 토큰만 참조하게 한다.
2. 바꿀 때마다 1440×900, 1920×1080, 390×844에서 캡처하고 판 크기를 잰다. 폰은 터치 흉내(CDP `Emulation.setTouchEmulationEnabled`)를 켜야 `pointer: coarse` 규칙이 보인다.
3. 방향이 갈리는 변경(톤·구조)은 코드를 고치기 전에 CSS 덧씌우기로 시안을 캡처해 나란히 놓고 고른다.
4. 결정은 `docs/DECISIONS.md`에 남긴다.

## Known Gaps

2026-09-29 기준, 이 파일과 아직 다르거나 정하지 못한 곳이다.

- 복기 성적표의 등급 다섯 개가 2열로 놓여 '악수' 하나가 셋째 줄에 혼자 남는다.
- 고스트 버튼이 줄 맨 앞에 오면(초기 배치·판 비우기) 안쪽 여백 16만큼 글자가 패널의 다른 줄보다 안으로 들어가 보인다.
- 한자 글꼴은 기기에 따라 다르다(윈도우 맑은 고딕, 맥 애플 SD 고딕 네오). Pretendard 한 벌로 맞추려면 한자를 한글 표기(졸·마·상…)로 바꾸는 수가 있다.
- 셀렉트의 펼침 화살표는 브라우저 기본 모양이라 Lucide 아이콘과 선이 다르다.
- 360 이하 폰에서는 헤더의 "판 편집 중"·"잘못된 판" 이 둘째 줄로 내려가 판이 38 내려간다. 앱 이름·탭 옆에 남는 자리가 40뿐이다(390 에서는 71 이라 한 줄).
- 알림이 뜬 4초 동안은 오른쪽 칸 아래 카드 내용(기보 목록, 국면 경고 목록)을 가린다.
