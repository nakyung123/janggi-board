// 오류 경계 — 화면 그리다 터졌을 때 흰 페이지 대신 보여줄 것
//
// React 는 그리는 도중 오류가 나면 **화면을 통째로 비운다.** 아무것도 없는 흰 페이지가
// 되고, 사용자는 "앱이 죽었어요" 말고는 할 말이 없다. 받는 쪽도 단서가 없다.
//
// 그래서 여기서 받아, 두 가지를 준다.
//   사용자에게 — 무슨 일이 났는지, 어떻게 벗어나는지(새로고침)
//   받는 쪽에게 — 자리를 가리키는 짧은 코드. 제보 버튼에 이미 적혀서 열린다.
//
// 이 경계가 못 잡는 것이 있다. 이벤트 처리 중에 터진 것, 타이머 안에서 터진 것, 조용히
// 깨진 약속(Promise)은 React 를 거치지 않는다. 그쪽은 errors.ts 의 watchTroubles 가 받는다.

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { noteTrouble } from "../../report/errors";
import type { Trouble } from "../../report/errors";
import { FeedbackButton, hasFeedback } from "../../report/feedback";

interface Props {
  children: ReactNode;
}

interface State {
  trouble: Trouble | null;
}

/**
 * 오류 경계는 **클래스로만 만들 수 있다.** 훅에는 componentDidCatch 에 해당하는 것이
 * 없다(React 19 기준). 이 저장소에서 클래스 컴포넌트는 여기 하나뿐이고, 그 까닭이 이것이다.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { trouble: null };

  componentDidCatch(err: unknown, info: ErrorInfo) {
    /*
     * 자리 이름에 컴포넌트 스택을 넣지 않는다.
     *
     * 넣어 봤더니 배포본에서는 `at ta (…/index-mE7aLWMo.js:10:50074)` 처럼 **빌드마다
     * 달라지는 글자**가 들어왔다. 코드는 내용에서 만들므로(errors.ts), 그 글자가 섞이면
     * 같은 버그인데 배포할 때마다 코드가 바뀐다 - 코드를 두는 까닭이 사라진다.
     *
     * 스택은 콘솔에 따로 남긴다. 거기서는 빌드마다 달라도 상관없다.
     */
    if (info.componentStack) console.error("[장기] 그리던 자리:", info.componentStack);
    this.setState({ trouble: noteTrouble("화면", err) });
  }

  render() {
    const { trouble } = this.state;
    if (!trouble) return this.props.children;

    return (
      <div className="boot">
        <h1>장기 AI</h1>
        <div className="boot-error">
          <p>화면을 그리다 문제가 생겼습니다.</p>
          {/*
            까닭을 글로 적지 않고 코드만 둔다. 내부 사정이 섞인 영어 한 줄은 사람에게
            아무것도 알려 주지 않으면서 겁만 준다. 코드는 짧아서 옮겨 적을 수 있고,
            받는 쪽은 그것만으로 자리를 찾는다. 날것은 콘솔에 있다.
          */}
          <pre>오류 코드 {trouble.code}</pre>
          <p className="muted small">
            새로고침하면 다시 시작합니다. 두던 판은 그대로 남아 있습니다.
            {hasFeedback && " 같은 일이 되풀이되면 아래로 알려 주세요 — 코드가 이미 적혀 있습니다."}
          </p>
          <div className="boot-actions">
            <button type="button" onClick={() => window.location.reload()}>
              새로고침
            </button>
          </div>
        </div>
        <FeedbackButton detail={`${trouble.code} ${trouble.where}`} />
      </div>
    );
  }
}
