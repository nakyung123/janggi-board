// 기보 목록
//
// 지난 판을 새 순서로 늘어놓는다. 한 판을 누르면 그 판이 열려 한 수씩 되짚고
// 복기할 수 있다.
//
// 카카오장기의 기보 타임라인을 따랐다. 한 칸에 상대·언제·어떻게 끝났는지를 적고
// 오른쪽에 끝난 모양을 작은 판으로 붙인다. 거기 있던 것 가운데 이 앱에 없는 것
// (친구 초대, 프로필 사진, 닉네임 제목, 공개 여부, 좋아요·댓글·즐겨찾기, 전적)은
// 뺐다. 혼자 엔진과 두는 도구라 나눌 사람이 없다.

import { useMemo, useRef } from "react";
import { ScrollText } from "lucide-react";
import { parseFen } from "../janggi/board";
import { resultTag, whenLabel } from "../janggi/archive";
import type { ArchivedGame } from "../janggi/archive";
import { MiniBoard } from "./board/MiniBoard";

interface Props {
  games: ArchivedGame[];
  /** 지금 시각. "3시간 전" 을 셀 때 쓴다. 부르는 쪽이 주면 테스트·캡처가 쉽다. */
  now: number;
  onOpen: (id: string) => void;
  /** 파일로 저장해 둔 기보를 목록에 넣는다 */
  onLoad: (file: File) => void;
}

export function GameList({ games, now, onOpen, onLoad }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  // 판마다 마지막 국면. 목록을 다시 그릴 때마다 FEN 을 풀지 않게 한 번만.
  const lastBoards = useMemo(
    () => new Map(games.map((g) => [g.id, parseFen(g.history[g.history.length - 1].fen).board])),
    [games]
  );

  return (
    <section className="games" aria-label="지난 판">
      <div className="games-head">
        <h2 className="games-title">
          기보
          <span className="panel-meta">{games.length}판</span>
        </h2>
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
        <ul className="game-list">
          {games.map((g) => {
            const tag = resultTag(g);
            return (
              <li key={g.id}>
                <button type="button" className="game-card" onClick={() => onOpen(g.id)}>
                  <span className="game-text">
                    <span className="game-title">vs {g.levelName}</span>
                    <span className="game-meta">
                      {whenLabel(g.endedAt, now)} ·{" "}
                      <span className={"game-side " + g.mySide}>
                        {g.mySide === "cho" ? "초 楚" : "한 漢"}
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
    </section>
  );
}
