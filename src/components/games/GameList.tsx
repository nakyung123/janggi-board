// 기보 목록 — 기보 탭의 첫 화면
//
// 지난 판을 최근 순서로 늘어놓는다. 한 판을 누르면 그 판이 열려 한 수씩 되짚고
// 복기할 수 있다. 화면에 들어가는 만큼씩 쪽으로 나누고 아래에 쪽 번호를 둔다.
// 파일로 저장해 둔 기보를 불러오는 버튼도 여기 있다(목록에 한 판을 넣는 일이다).
//
// 카카오장기의 기보 타임라인을 따랐다. 한 칸에 상대·언제·어떻게 끝났는지를 적고
// 오른쪽에 끝난 모양을 작은 판으로 붙인다. 나눌 사람을 전제로 한 것(친구 초대,
// 프로필 사진, 공개 여부, 좋아요·댓글·즐겨찾기, 전적)은 두지 않는다 - 혼자 엔진과
// 두는 앱이다. 판을 남에게 건네는 길은 연 판의 '저장'(기보 파일) 하나다.

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { parseFen } from "../../janggi/board";
import { pageItems, resultTag, whenLabel } from "../../janggi/archive";
import { SIDE_LABEL } from "../../janggi/pieces";
import type { ArchivedGame } from "../../janggi/archive";
import { MiniBoard } from "./MiniBoard";

interface Props {
  games: ArchivedGame[];
  /** 지금 시각. "3시간 전" 을 셀 때 쓴다. 부르는 쪽이 주면 테스트·캡처가 쉽다. */
  now: number;
  onOpen: (id: string) => void;
  /** 파일로 저장해 둔 기보를 목록에 넣는다 */
  onLoad: (file: File) => void;
  /**
   * 보고 있는 쪽(0 부터). App 이 쥔다 - 한 판을 열었다가 '목록' 으로 돌아오면
   * 이 컴포넌트는 새로 그려지는데, 그때 보던 쪽으로 돌아와야 한다.
   */
  page: number;
  onPage: (page: number) => void;
  /** 파일을 못 읽은 까닭. 누른 버튼(파일 불러오기) 옆에 남는다. */
  error: string | null;
  /** 방금 목록에 넣은 판. 그 카드가 잠깐 도드라진다. */
  freshId: string | null;
}

/** 카드 한 줄의 높이를 재기 전에 쓰는 값(작은 판 112 + 안쪽 여백 16×2). */
const CARD_H = 144;

/**
 * 폰의 한 쪽 판 수. 폰은 화면 전체가 스크롤되어 목록 칸에 정해진 높이가 없다 -
 * 잴 칸이 없다. 화면을 내려 보는 것이 자연스러운 기기라 열 판씩 끊는다.
 * 화면 높이로 재면 네 판씩이라 쪽만 스물다섯이 된다.
 */
const PHONE_PER_PAGE = 10;
const NARROW = "(max-width: 900px)";

export function GameList({ games, now, onOpen, onLoad, page, onPage, error, freshId }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  /*
   * 한 쪽에 몇 판을 둘지는 화면이 정한다 - 목록 칸에 스크롤 없이 들어가는 만큼
   * (격자가 정한 열 수 × 들어가는 줄 수). 수를 박아 두면 낮은 창에서는 한 쪽 안에서
   * 또 스크롤하게 된다. 창 크기가 바뀌면 다시 잰다.
   */
  const [perPage, setPerPage] = useState(12);
  // 목록 칸은 판이 하나라도 있어야 붙는다. 처음 한 판이 들어올 때 다시 건다.
  const hasGames = games.length > 0;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      if (window.matchMedia(NARROW).matches) {
        setPerPage(PHONE_PER_PAGE);
        return;
      }
      const cs = getComputedStyle(list);
      const cols = cs.gridTemplateColumns.split(" ").filter(Boolean).length || 1;
      const gap = parseFloat(cs.rowGap) || 0;
      const room = list.clientHeight;
      const cardH = list.firstElementChild?.getBoundingClientRect().height || CARD_H;
      const rows = Math.max(1, Math.floor((room + gap) / (cardH + gap)));
      setPerPage(cols * rows);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [hasGames]);

  const pages = Math.max(1, Math.ceil(games.length / perPage));
  // 창이 커져 쪽 수가 줄면 보던 쪽이 끝을 넘을 수 있다. 마지막 쪽으로 당긴다.
  const current = Math.min(page, pages - 1);
  const shown = games.slice(current * perPage, (current + 1) * perPage);

  // 판마다 마지막 국면. 이 쪽에 보이는 판만, 목록이 바뀔 때만 푼다.
  const lastBoards = useMemo(
    () => new Map(shown.map((g) => [g.id, parseFen(g.history[g.history.length - 1].fen).board])),
    // shown 은 렌더마다 새 배열이라 그것을 만든 값으로 묶는다.
    [games, current, perPage]
  );

  return (
    <section className="games" aria-label="지난 판">
      <div className="games-head">
        <h2 className="games-title">
          기보
          <span className="panel-meta">{games.length}판</span>
        </h2>
        {error && (
          <p className="games-error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>
          파일 불러오기
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onLoad(file);
            e.target.value = ""; // 같은 파일을 다시 골라도 동작하게
          }}
        />
      </div>

      {games.length === 0 ? (
        <div className="empty">
          <ScrollText size={24} strokeWidth={1.75} aria-hidden />
          <p className="empty-title">아직 끝난 판이 없습니다</p>
          <p>대국 탭에서 한 판 두면 끝난 뒤 여기에 남습니다.</p>
        </div>
      ) : (
        <ul className="game-list" ref={listRef}>
          {shown.map((g) => {
            const tag = resultTag(g);
            return (
              <li key={g.id}>
                <button
                  type="button"
                  className={"game-card" + (g.id === freshId ? " fresh" : "")}
                  onClick={() => onOpen(g.id)}
                >
                  <span className="game-text">
                    <span className="game-title">vs {g.levelName}</span>
                    <span className="game-meta">
                      {whenLabel(g.endedAt, now)} ·{" "}
                      <span className={"game-side " + g.mySide}>
                        {SIDE_LABEL[g.mySide]}
                      </span>{" "}
                      <b className={"game-result " + tag.tone}>{tag.text}</b>
                    </span>
                    <span className="game-moves">
                      {g.history.length - 1}수{g.reviewed ? " · 복기함" : ""}
                    </span>
                  </span>
                  <MiniBoard
                    board={lastBoards.get(g.id) ?? {}}
                    flipped={g.mySide === "han"}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/*
        쪽 번호. 한 쪽뿐이어도 자리는 남긴다 - 쪽 번호가 뜨고 사라질 때마다 목록
        칸 높이가 바뀌면 한 쪽에 들어가는 수가 따라 바뀐다.
      */}
      <nav className="pager" aria-label="기보 쪽">
        {pages > 1 && (
          <>
            <button
              type="button"
              className="icon"
              disabled={current === 0}
              onClick={() => onPage(current - 1)}
              aria-label="이전 쪽"
            >
              <ChevronLeft size={20} strokeWidth={2} aria-hidden />
            </button>
            {pageItems(current, pages).map((p, i) =>
              p === "gap" ? (
                <span key={"gap" + i} className="pager-gap" aria-hidden="true">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  aria-current={p === current ? "page" : undefined}
                  aria-label={`${p + 1}쪽`}
                  onClick={() => onPage(p)}
                >
                  {p + 1}
                </button>
              )
            )}
            <button
              type="button"
              className="icon"
              disabled={current === pages - 1}
              onClick={() => onPage(current + 1)}
              aria-label="다음 쪽"
            >
              <ChevronRight size={20} strokeWidth={2} aria-hidden />
            </button>
          </>
        )}
      </nav>
    </section>
  );
}
