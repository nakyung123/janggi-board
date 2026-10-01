# 제3자 저작물 고지

이 프로젝트(**장기 AI**)는 **GPL v3 이상**을 따른다(저장소 루트의 `LICENSE`).
다만 `src/janggi/glyphs.ts` 는 예외로 **CC BY-SA 3.0** 을 따른다(아래 3번).

아래 저작물을 함께 사용하며, 각 저작물의 라이선스 조건이 그대로 적용된다.

이 글은 빌드할 때 `public/licenses/index.html` 쪽으로 만들어져 배포본에 함께 실린다
(`scripts/fetch-engine.mjs`). GPL v3 전문은 `/licenses/GPL-3.0.txt`, 엔진 저작자
목록은 `/engine/AUTHORS` 에 같이 올라간다. 앱에서는 업데이트 내역 창 아래의
'오픈소스 고지' 로 연다.

---

## 1. 엔진 — Fairy-Stockfish

- **라이선스**: GNU General Public License v3
- **출처**: https://github.com/fairy-stockfish/Fairy-Stockfish
- **WebAssembly 빌드**: npm 패키지 [`fairy-stockfish-nnue.wasm`](https://github.com/gbtami/fairy-stockfish.wasm)
- **저장소 포함 여부**: **포함하지 않음.** `npm run fetch-engine` 이 `public/engine/` 으로
  내려받으며, `.gitignore` 로 제외되어 있다.

엔진 파일을 함께 배포하는 순간(빌드 결과물을 웹에 올리면 방문자마다 `stockfish.wasm` 이
전달된다) GPL v3 의무가 발생한다. 지키는 방법은 이렇다.

- **전문**: `public/licenses/GPL-3.0.txt` 로 함께 올린다(엔진 패키지의 `Copying.txt`).
- **저작자 고지**: `public/engine/AUTHORS` 를 엔진 파일 옆에 같이 둔다.
- **대응 소스**: 엔진을 **고치지 않고** 위 상위 배포판을 그대로 쓰므로, 상위 저장소를
  가리키는 것으로 족하다.
- **이 앱의 소스**: 이 프로젝트도 GPL v3 라서, 배포본을 받은 사람이 소스를 받을 수 있어야
  한다. 저장소를 공개로 두는 것이 가장 간단하다.

---

## 2. 장기 신경망 — janggi-9991472750de.nnue

- **제작**: belzedar_, 2025-07-31
- **출처**: https://fairy-stockfish.github.io/nnue/
- **라이선스**: **명시되어 있지 않다.** 배포처는 "2026년 이후 날짜의 망은 CC0" 라고만
  밝히는데(원문: *All networks with a date in 2026 or later are published under CC0
  license*), 이 망은 2025-07-31 이라 그 범위 밖이다. 같은 페이지가 "이 망을 내장한
  릴리스도 있다" 고 적고 있어, 상위 프로젝트가 GPL v3 저작물의 일부로 이미 배포하고
  있다. 공식 배포처가 공개한 파일이라 실무상 위험은 낮다고 보고 쓰되, **허락이 명시된
  상태는 아니다.** 장기 망은 현재 이것 하나뿐이다.
- **저장소 포함 여부**: **포함하지 않음.** `npm run fetch-engine` 이 내려받는다.
- **앞으로**: 상위 프로젝트에 라이선스 명시를 요청하고, 2026년 이후 날짜의 장기 망이
  나오면 그쪽(CC0)으로 갈아탄다.

---

## 3. 기물 글자 — src/janggi/glyphs.ts

`src/janggi/glyphs.ts` 에 담긴 글자 도형은 아래 저작물의 2차적 저작물이며,
**프로젝트 본체와 별개로 CC BY-SA 3.0 을 따른다.**

- **원저작물**: [File:Janggi.svg](https://commons.wikimedia.org/wiki/File:Janggi.svg)
- **저작자**: Yeo123 (한국어 위키백과)
- **원본 라이선스**: GFDL 1.2+ / CC BY-SA 3.0 이중 라이선스
- **택한 라이선스**: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)
- **경유**: [pychess-variants](https://github.com/gbtami/pychess-variants) 의
  janggi 기물 세트 `hanjablue`

### 변경한 내용

CC BY-SA 3.0 은 변경 사실을 밝힐 것을 요구한다. 원본에서 다음을 바꿨다.

1. 기물의 팔각형 몸통과 테두리 도형을 걷어내고, 글자 도형만 남겼다.
2. 원본에 박혀 있던 색(`#0d00b4`, `#dd1f26`)을 떼어내 프로그램이 색을 지정하도록
   바꿨다.
3. 글자마다 경계 상자를 재서 함께 담았다. 기물 크기에 맞춰 글자를 앉히는 데 쓴다.
4. SVG 파일 14개를 TypeScript 모듈 하나로 합쳤다.

이 파일을 가져다 쓰는 사람은 위 저작자 표기를 유지하고, 파생물을 동일 조건으로
공유해야 한다.

---

## 4. 글꼴 — Pretendard

- **저작자**: Kil Hyung-jin (길형진), Reserved Font Name Pretendard
- **라이선스**: [SIL Open Font License 1.1](https://openfontlicense.org)
- **출처**: https://github.com/orioncactus/pretendard
- **사용 방식**: npm 패키지 [`pretendard`](https://www.npmjs.com/package/pretendard)
  의 가변 글꼴 동적 서브셋(`dist/web/variable/pretendardvariable-dynamic-subset.css`)
  을 번들에 넣는다. 글꼴 파일은 고치지 않았다.
- **저장소 포함 여부**: **포함하지 않음.** `npm install` 로 받으며, 빌드 결과물에는
  글꼴 파일이 들어간다.

OFL 1.1 은 글꼴을 프로그램과 함께 배포하는 것을 허용한다. 글꼴 파일 자체를 따로
팔 수는 없고, 고쳐서 배포할 때는 "Pretendard" 라는 이름을 쓸 수 없다. 라이선스
전문은 패키지의 `dist/LICENSE.txt` 에 있다.

---

## 5. 아이콘 — Lucide

- **라이선스**: ISC. 단, 이 앱이 쓰는 화살표 넷(chevron-left·chevron-right·
  chevrons-left·chevrons-right)은 Feather 에서 온 아이콘이라 MIT 를 따른다.
- **출처**: https://lucide.dev · https://github.com/lucide-icons/lucide
- **사용 방식**: npm 패키지 [`lucide-react`](https://www.npmjs.com/package/lucide-react)
  에서 쓰는 아이콘만 가져온다(판 조작 줄의 처음·이전·다음·끝, 기보 탭의 '목록'
  버튼, 빈 상태 셋 - 기보 목록·형세·수 목록). 아이콘 모양은 고치지 않았다.
- **저장소 포함 여부**: **포함하지 않음.** `npm install` 로 받으며, 빌드 결과물에는
  쓴 아이콘만 들어간다.

ISC·MIT 둘 다 저작권 고지와 허락 문구를 함께 두는 조건으로 사용·수정·배포를
허용한다. 두 전문 모두 패키지의 `LICENSE` 에 있다.
