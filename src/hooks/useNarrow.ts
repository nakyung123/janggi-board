// 폰처럼 좁은 화면인지
//
// 넓은 화면은 대국자 카드를 오른쪽 칸 맨 위에 두 줄 카드로, 폰은 판 위아래에 한 줄로
// 놓는다. 자리 자체가 달라서 CSS 만으로는 못 바꾸고 그리는 쪽(App)이 알아야 한다.

import { useEffect, useState } from "react";

/** layout.css 의 좁은 화면(@media max-width: 900px)과 같은 경계다. */
const NARROW = "(max-width: 900px)";

export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}
