// jsdom 에 없는 브라우저 기능을 채운다 — 화면 테스트(*.test.tsx)가 맨 먼저 불러온다
//
// jsdom 은 화면을 그리지 않는 브라우저라 미디어 쿼리·크기 관찰·요소 크기가 없다. 앱은
// 이것들로 폰인지 가리고(useNarrow) 판 크기를 잰다(useBoardFit). 테스트는 넓은 화면의
// 마우스 기기로 둔다 - 어떤 미디어 쿼리에도 걸리지 않는다.

window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;

// 크기가 바뀔 일이 없으니 알릴 것도 없다.
window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// 펼침 목록이 고른 줄을 보이는 자리로 굴린다(Dropdown). 굴릴 화면이 없다.
Element.prototype.scrollIntoView = () => {};

/*
 * 판(svg.board)의 화면 크기를 SVG 좌표 그대로 둔다 - 왼쪽 위가 (0,0), 폭·높이는 viewBox.
 * 그러면 교차점의 SVG 좌표(.hit 의 cx·cy)를 그대로 clientX·clientY 로 넘겨 누를 수 있다.
 * 판은 누른 자리를 이 크기로 교차점에 옮긴다(Board 의 locate). 크기가 0 이면 NaN 이 된다.
 */
const measure = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function (this: Element) {
  if (this instanceof SVGSVGElement && this.classList.contains("board")) {
    const [, , width, height] = (this.getAttribute("viewBox") ?? "0 0 0 0").split(" ").map(Number);
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width,
      height,
      right: width,
      bottom: height,
      toJSON: () => ({}),
    } as DOMRect;
  }
  return measure.call(this);
};
