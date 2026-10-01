<a id="readme-top"></a>

<!-- 배지 -->
[![License][license-shield]][license-url]
[![Release][release-shield]][release-url]

<br />
<div align="center">

<h1 align="center">장기 AI</h1>

  <p align="center">
    급수를 골라 AI와 한 판 두고, 끝난 판을 한 수씩 되짚으며 복기를 받는 장기
    <br />
    <a href="docs/DECISIONS.md"><strong>기술 기록 보기 »</strong></a>
    <br />
    <br />
    <a href="https://github.com/nakyung123/janggi-board/releases">릴리스</a>
    &middot;
    <a href="https://github.com/nakyung123/janggi-board/issues/new?labels=bug">버그 제보</a>
    &middot;
    <a href="https://github.com/nakyung123/janggi-board/issues/new?labels=enhancement">기능 제안</a>
  </p>
</div>

<!-- 목차 -->
<details>
  <summary>목차</summary>
  <ol>
    <li>
      <a href="#프로젝트-소개">프로젝트 소개</a>
      <ul>
        <li><a href="#만든-도구">만든 도구</a></li>
      </ul>
    </li>
    <li>
      <a href="#시작하기">시작하기</a>
      <ul>
        <li><a href="#준비물">준비물</a></li>
        <li><a href="#설치">설치</a></li>
        <li><a href="#환경-변수">환경 변수</a></li>
        <li><a href="#응답-헤더">응답 헤더</a></li>
      </ul>
    </li>
    <li><a href="#사용법">사용법</a></li>
    <li><a href="#로드맵">로드맵</a></li>
    <li><a href="#기여">기여</a></li>
    <li><a href="#라이선스">라이선스</a></li>
    <li><a href="#연락처">연락처</a></li>
    <li><a href="#감사의-말">감사의 말</a></li>
  </ol>
</details>

<!-- 프로젝트 소개 -->
## 프로젝트 소개

![장기 AI 대국 화면][product-screenshot]

브라우저에서 장기 AI와 두고 복기하는 웹 앱이다. 엔진은 **Fairy-Stockfish** 에 장기 전용
NNUE 신경망을 얹은 것이고, WebAssembly 로 브라우저 안에서 돈다. 서버가 없어서 둔 판과
설정은 그 브라우저에만 남는다.

- **대국** — 18급부터 9단까지 27단계 가운데 상대를 고른다. 상차림 넷, 규칙 셋(표준 ·
  현대 · 전통), 시계(5분 + 초읽기 30초 3회, 또는 없음).
- **기보** — 끝난 판이 목록에 저절로 남는다(최근 100판). 다시 열어 한 수씩 되짚고,
  파일로 저장하거나 불러온다.
- **복기** — AI가 기보를 처음부터 끝까지 다시 보고, 수마다 등급과 승률 변화, 자기라면
  둔 수를 알려 준다.

급수는 장기 급수의 이름을 빌린 **이 앱 안의 눈금**이다. 공인 급수가 아니다.

<p align="right">(<a href="#readme-top">맨 위로</a>)</p>

### 만든 도구

* [![React][React-shield]][React-url]
* [![TypeScript][TypeScript-shield]][TypeScript-url]
* [![Vite][Vite-shield]][Vite-url]
* [![Vitest][Vitest-shield]][Vitest-url]
* [![WebAssembly][Wasm-shield]][Wasm-url]

<p align="right">(<a href="#readme-top">맨 위로</a>)</p>

<!-- 시작하기 -->
## 시작하기

### 준비물

* Node.js `20.19` 이상 또는 `22.12` 이상 (Vite 8 이 요구한다)
* npm

### 설치

1. 저장소를 받는다.
   ```sh
   git clone https://github.com/nakyung123/janggi-board.git
   cd janggi-board
   ```
2. 패키지를 설치한다.
   ```sh
   npm install
   ```
3. 개발 서버를 띄운다.
   ```sh
   npm run dev      # http://localhost:5173
   ```
   처음 한 번은 엔진과 신경망(약 13MB)을 `public/engine/` 에 받는다. 이 파일들은 용량
   때문에 저장소에 넣지 않는다.

> **신경망 받기가 실패하면** — <https://fairy-stockfish.github.io/nnue/> 에서
> `janggi-9991472750de.nnue` 를 직접 받아 `public/engine/` 에 넣는다. 파일 이름은 그대로
> 두어야 한다.

그 밖의 명령:

```sh
npm test                # 테스트 (Vitest)
npm run build           # 프로덕션 빌드
npm run preview         # 빌드 결과를 응답 헤더까지 갖춰서 확인
npm run verify-engine   # 브라우저 없이 엔진만 점검
```

### 환경 변수

없어도 돈다. 제보 버튼을 띄우려면 `.env.example` 을 `.env.local` 로 복사해 채운다
(`.env*` 는 `.gitignore` 에 들어 있다).

| 이름 | 무엇 |
| --- | --- |
| `VITE_FEEDBACK_URL` | 제보를 받을 곳(구글 폼 같은 것)의 주소. 비워 두면 제보 버튼이 뜨지 않는다 |
| `VITE_FEEDBACK_ENTRY` | 그 폼에서 '환경' 을 받는 칸의 이름표(`entry.NNN`). 있으면 버전 · 브라우저 · 지금 판이 미리 채워진 채로 열린다 |

값은 빌드에 그대로 박히므로 비밀이 아닌 주소만 넣는다.

### 응답 헤더

엔진이 여러 스레드로 탐색하려면 `SharedArrayBuffer` 가 필요하고, 브라우저는 아래 두 헤더가
있어야 그것을 허용한다.

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

`vite.config.ts`(개발 · 미리보기)와 `vercel.json` 에 넣어 뒀다. 파일을 그냥 열거나(`file://`)
응답 헤더를 지정할 수 없는 곳(GitHub Pages)에 올리면 **엔진이 시작되지 않는다.**

<p align="right">(<a href="#readme-top">맨 위로</a>)</p>

<!-- 사용법 -->
## 사용법

**대국** — 오른쪽 칸에서 잡을 쪽, 상대 급수, 시계, 규칙, 상차림을 고르고 기물을 누르거나
끌어서 둔다. 누르면 갈 수 있는 자리가 점으로 뜬다. 규칙과 상차림은 첫 수를 두면 잠긴다.
무르기 · 한수쉼 · 기권은 판 오른쪽에 있다.

**기보** — 끝난 판은 기보 탭 목록에 들어간다. 한 판을 눌러 열고 이전 · 다음 버튼이나 수
슬라이더로 되짚는다. `저장` 은 그 판을 JSON 파일로 내려 주고, `파일 불러오기` 는 그 파일을
목록에 한 판으로 넣는다.

**복기** — 연 판에서 깊이(빠름 · 보통 · 정밀)를 고르고 복기를 시작한다. 끝나면 판에 떠 있는
수마다 설명이 붙는다.

```
14사24  한의 6번째 수                    아쉬운 수
사를 앞으로 1칸 옮겼습니다.
승률        한 34% → 27%
AI의 수     32포35
그 뒤       초가 43졸33으로 마를 가져갑니다.
```

등급은 넷이고, 둔 쪽의 승률이 떨어진 폭으로 매긴다.

| 등급 | 언제 |
| --- | --- |
| 최선수 | AI와 같은 수 |
| 좋은 수 | 5%p 미만 |
| 아쉬운 수 | 5%p 이상 |
| 큰 실수 | 20%p 이상 |

**키보드**

| 키 | 하는 일 |
| --- | --- |
| `←` `→` | 한 수 앞뒤로 |
| `Home` `End` | 처음 · 끝으로 |
| `F` | 판 뒤집기 |

무엇을 왜 그렇게 정했는지는 [docs/DECISIONS.md](docs/DECISIONS.md), 화면의 기준은
[DESIGN.md](DESIGN.md) 에 있다.

<p align="right">(<a href="#readme-top">맨 위로</a>)</p>

<!-- 로드맵 -->
## 로드맵

- [x] v0.1.0 — 대국 · 기보 · 복기
- [ ] `.gib` 기보 읽기 — 다른 장기 앱에서 둔 판을 가져와 복기한다. 그쪽에서 기보를
      내보낼 수 있는지 확인될 때까지 보류
- [ ] 로그인 — 지금은 붙이지 않는다. 기기를 옮겨도 전적이 남기를 바라는 사람이 생기면
      소셜 로그인 하나만
- [ ] 신경망 교체 — 지금 신경망은 라이선스가 명시되어 있지 않다. CC0 로 공개되는 망이
      나오면 갈아탄다

하지 않기로 한 것: 박보 · 묘수풀이, 포진법 통계, 대국 중 훈수.

제안과 알려진 문제는 [이슈](https://github.com/nakyung123/janggi-board/issues)에서 본다.

<p align="right">(<a href="#readme-top">맨 위로</a>)</p>

<!-- 기여 -->
## 기여

버그와 제안은 이슈로 남겨 주면 된다. 코드를 고쳐 보내려면:

1. 저장소를 포크한다
2. 가지를 만든다 (`git checkout -b feature/무엇`)
3. 고치고 `npm test` 가 통과하는지 본다
4. 커밋한다 (`git commit -m '고침: 무엇을 왜'`)
5. 올리고(`git push origin feature/무엇`) 풀 리퀘스트를 연다

보낸 코드는 이 프로젝트와 같은 라이선스(GPL v3 이상)로 배포된다.

<p align="right">(<a href="#readme-top">맨 위로</a>)</p>

<!-- 라이선스 -->
## 라이선스

**GPL v3 이상**으로 배포한다. 전문은 `LICENSE` 에 있다.

예외가 하나 있다. `src/janggi/glyphs.ts` 의 기물 글자는 위키미디어 공용 그림의 2차적
저작물이라 **CC BY-SA 3.0** 을 따른다. 엔진 · 신경망 · 글꼴을 포함한 제3자 고지는
[NOTICE.md](NOTICE.md) 에 있다.

<p align="right">(<a href="#readme-top">맨 위로</a>)</p>

<!-- 연락처 -->
## 연락처

nakyung123 — [github.com/nakyung123](https://github.com/nakyung123)

프로젝트: [https://github.com/nakyung123/janggi-board](https://github.com/nakyung123/janggi-board)

<p align="right">(<a href="#readme-top">맨 위로</a>)</p>

<!-- 감사의 말 -->
## 감사의 말

* [Fairy-Stockfish](https://github.com/fairy-stockfish/Fairy-Stockfish) — 엔진 (GPL v3)
* [fairy-stockfish-nnue.wasm](https://github.com/gbtami/fairy-stockfish.wasm) — 엔진의 WebAssembly 빌드
* [장기 NNUE 신경망](https://fairy-stockfish.github.io/nnue/) — belzedar_
* [File:Janggi.svg](https://commons.wikimedia.org/wiki/File:Janggi.svg) — 기물 글자, Yeo123 (CC BY-SA 3.0)
* [Pretendard](https://github.com/orioncactus/pretendard) — 글꼴
* [Lucide](https://lucide.dev) — 아이콘
* [Best-README-Template](https://github.com/othneildrew/Best-README-Template) — 이 README 의 틀

<p align="right">(<a href="#readme-top">맨 위로</a>)</p>

<!-- 링크 -->
[license-shield]: https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg?style=for-the-badge
[license-url]: LICENSE
[release-shield]: https://img.shields.io/badge/release-notes-555.svg?style=for-the-badge
[release-url]: https://github.com/nakyung123/janggi-board/releases
[product-screenshot]: docs/images/screenshot.png
[React-shield]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://react.dev/
[TypeScript-shield]: https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[Vite-shield]: https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white
[Vite-url]: https://vite.dev/
[Vitest-shield]: https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white
[Vitest-url]: https://vitest.dev/
[Wasm-shield]: https://img.shields.io/badge/WebAssembly-654FF0?style=for-the-badge&logo=webassembly&logoColor=white
[Wasm-url]: https://webassembly.org/
