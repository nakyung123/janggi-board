# 제3자 저작물 고지

이 프로젝트는 아래 저작물을 사용한다. 각 저작물의 라이선스 조건이 그대로 적용된다.

---

## 1. 엔진 — Fairy-Stockfish

- **라이선스**: GNU General Public License v3
- **출처**: https://github.com/fairy-stockfish/Fairy-Stockfish
- **WebAssembly 빌드**: npm 패키지 [`fairy-stockfish-nnue.wasm`](https://github.com/gbtami/fairy-stockfish.wasm)
- **저장소 포함 여부**: **포함하지 않음.** `npm run fetch-engine` 이 `public/engine/` 으로
  내려받으며, `.gitignore` 로 제외되어 있다.

엔진 파일을 함께 배포하는 순간(예: 빌드 결과물을 웹에 올리는 경우) GPL v3 의무가
발생한다. 배포 시에는 GPL v3 전문을 포함하고, 엔진의 대응 소스를 받을 수 있는
위치를 안내해야 한다. 이 프로젝트는 엔진을 고치지 않고 위 상위 배포판을 그대로
쓰므로, 상위 저장소를 가리키는 것으로 족하다.

---

## 2. 장기 신경망 — janggi-9991472750de.nnue

- **제작**: belzedar_, 2025-07-31
- **출처**: https://fairy-stockfish.github.io/nnue/
- **저장소 포함 여부**: **포함하지 않음.** `npm run fetch-engine` 이 내려받는다.

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
