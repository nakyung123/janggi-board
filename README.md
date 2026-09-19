# 장기 분석판

Yixin-Board 를 장기로 옮긴 도구. 판을 마음대로 고쳐놓고, 그 국면을 세계 최강
장기 엔진에게 그대로 물려서 실시간으로 분석한다.

엔진은 **Fairy-Stockfish** 를 브라우저(WebAssembly)에서 돌리고, 장기 전용
NNUE 신경망(`janggi-9991472750de.nnue`, 기존 평가함수 대비 +1128 Elo)을 얹었다.
프로 기사보다 강하다.

## 시작하기

```bash
npm install
npm run dev      # http://localhost:5173
```

`npm run dev` 는 실행 전에 `scripts/fetch-engine.mjs` 를 돌려서 엔진 파일을
`public/engine/` 에 채운다. 처음 한 번만 약 13MB(엔진 1.6MB + 신경망 11.3MB)를
받고, 그 뒤로는 있는 파일을 쓴다. 이 파일들은 용량 때문에 저장소에 넣지 않는다.

> **신경망 받기가 실패하면** — 신경망은 남의 구글 드라이브 링크에서 받는다.
> 링크가 깨졌다면 <https://fairy-stockfish.github.io/nnue/> 에서
> `janggi-9991472750de.nnue` 를 직접 받아 `public/engine/` 에 넣으면 된다.
> 파일 이름은 그대로 두어야 한다.

```bash
npm run build     # 프로덕션 빌드
npm run preview   # 빌드 결과를 헤더까지 갖춰서 확인
npm run verify-engine   # 엔진만 따로 점검 (브라우저 없이)
```

## 반드시 알아야 할 제약: COOP/COEP

엔진은 멀티스레드 탐색에 `SharedArrayBuffer` 를 쓰고, 브라우저는 아래 두 헤더가
있어야만 그걸 허용한다.

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

`vite.config.ts`(개발·미리보기)와 `vercel.json`(배포)에 이미 넣어뒀다. 파일을
그냥 열거나(`file://`) 헤더 없는 정적 서버에 올리면 **엔진이 시작되지 않는다.**
같은 이유로 외부 웹폰트를 쓰지 않고 시스템 폰트만 쓴다.

올릴 곳을 고를 때 이 제약이 갈린다.

| 호스팅 | 가능 여부 | 비고 |
|---|---|---|
| Vercel | ✅ | `vercel.json` 이 이미 준비돼 있다 |
| Netlify / Cloudflare Pages | ✅ | 헤더 설정을 직접 옮겨야 한다 |
| **GitHub Pages** | ❌ | **응답 헤더를 지정할 수 없다** |

GitHub Pages 는 커스텀 헤더를 붙일 방법이 없어서 이 앱이 돌아가지 않는다.
굳이 쓰려면 `coi-serviceworker` 같이 서비스 워커로 헤더를 흉내 내는 우회가 필요하다.

## 기능

**판 편집** — 팔레트에서 기물을 고르고 교차점을 누르면 놓인다. 기물을 끌어서
옮기고, 판 밖으로 끌어내면 지워진다. 궁이 없거나 사·궁이 궁성 밖에 있으면 경고가
뜬다. FEN 을 붙여넣거나 복사할 수 있다.

**실시간 분석** — 국면이 바뀌면 그 자리에서 다시 판다. 후보수는 최대 8개까지,
평가치는 항상 초(楚) 기준이다. 줄에 마우스를 올리면 판에 화살표가 뜨고, 누르면
그 수를 둔다.

**대국** — 엔진에게 초·한·양쪽 중 아무 쪽이나 맡길 수 있다. 무르기/다시,
한수쉼(궁을 제자리에 두는 수)을 지원한다.

**상차림** — 원앙마(안상), 양귀마(바깥상), 왼귀마(왼상), 오른귀마(오른상).
양쪽이 따로 고른다. 지금 판이 어떤 차림인지도 되읽어서 표시한다.
`면상`은 별도의 차림이 아니라 귀마 차림에서 상을 면자리로 올리는 포진이라
프리셋에 없다.

**규칙 선택** — 표준(빅장 있음·점수제), 현대(카카오 호환, 빅장 없음·수 반복 금지),
전통(빅장 무승부·점수제 없음).

## 좌표와 기보

장기 기보 방식을 그대로 쓴다. 세로줄은 왼쪽부터 1~9, 가로줄은 위에서부터 1~9 와
0(열째 줄). 좌표는 **가로줄을 먼저** 읽는다. 그래서 초의 궁 자리는 95, 한의 궁
자리는 25다. 한 수는 `출발좌표 기물 도착좌표` 로 적는다 — 예: `03馬84`.

엔진은 내부적으로 체스식 좌표(a1~i10)를 쓰고, `src/janggi/notation.ts` 가 둘
사이를 옮긴다.

## 구조

```
scripts/fetch-engine.mjs   엔진 파일 준비 (복사 + 신경망 다운로드)
scripts/verify-engine.mjs  브라우저 없이 엔진 점검
src/engine/                UCI 통신. 명령 직렬화, 정보 라인 파싱, React 훅
src/janggi/                장기 도메인. 기물, 좌표·FEN, 상차림, 기보
src/components/            장기판(SVG), 팔레트, 분석·엔진·기보 패널
```

규칙은 UI 에 구현하지 않았다. 합법수는 전부 엔진에게 `go perft 1` 로 물어본다.
마의 멱, 상의 길, 궁성 사선, 포가 포를 못 넘는 것까지 엔진이 유일한 근거다.

## 기물 글자

실물 장기판처럼 **초(楚)는 초서체(흘림), 한(漢)은 해서체(정자)** 로 새긴다.
유니코드에는 초서 글자가 따로 없어서 폰트로는 이 구분을 낼 수 없다. 그래서
글자를 SVG 도형으로 들고 있다(`src/janggi/glyphs.ts`). 출처는 `NOTICE.md` 참고.

기보는 양쪽 모두 정자로 적는다 — `03馬84` 처럼.

## 진영 표기

Fairy-Stockfish 의 대문자(White)가 **초(楚)**, 소문자(Black)가 **한(漢)** 이다.
초가 선수이고 한이 1.5점 덤을 받는 장기 규칙과 맞다. 화면에서는 초가 초록,
한이 빨강이며 초가 아래쪽에 앉는다(판 뒤집기로 바꿀 수 있다).

## 저장소를 공개하기 전에

지금은 비공개 저장소다. 공개로 돌리기 전에 아래를 정리해야 한다.

- [ ] **라이선스를 정하고 `LICENSE` 파일을 넣는다.**
      엔진이 GPL v3 라서 **GPL v3** 가 무난하다. 서버로 서비스할 생각이면
      lichess·pychess-variants 처럼 **AGPL v3** 를 쓴다.
- [ ] `package.json` 의 `license` 항목을 정한 라이선스로 맞춘다.
- [ ] 배포까지 한다면 빌드 결과물에 `stockfish.wasm` 이 들어가므로,
      GPL v3 전문과 엔진 소스 위치 안내를 함께 올린다. (`NOTICE.md` 참고)

`src/janggi/glyphs.ts` 의 기물 글자는 **CC BY-SA 3.0** 이라 프로젝트 라이선스와
별개로 그 조건을 유지해야 한다. 파일 머리말과 `NOTICE.md` 에 적어뒀으니 지우지 말 것.

## 출처

- [Fairy-Stockfish](https://github.com/fairy-stockfish/Fairy-Stockfish) (GPLv3)
- [fairy-stockfish-nnue.wasm](https://github.com/gbtami/fairy-stockfish.wasm)
- [장기 NNUE 신경망](https://fairy-stockfish.github.io/nnue/)
- [기물 글자](https://commons.wikimedia.org/wiki/File:Janggi.svg) — Leo Ha (Yeo123), GFDL

자세한 고지는 `NOTICE.md` 에 있다.
