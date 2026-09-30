// 로딩 화면 — 엔진과 신경망을 내려받는 동안, 또는 엔진을 띄우지 못했을 때
//
// 엔진이 준비되기 전에는 판을 그리지 않는다. 합법수·장군을 엔진이 알려 줘야 둘 수
// 있어서, 판이 먼저 떠도 누를 수 있는 것이 없다.

import type { LoadProgress } from "../../engine/types";

interface Props {
  /** true 면 까닭(error)을 보여주고, 아니면 내려받는 진행률을 보여준다. */
  failed: boolean;
  progress: LoadProgress | null;
  error: string | null;
}

export function BootScreen({ failed, progress, error }: Props) {
  return (
    <div className="boot">
      <h1>장기 AI</h1>
      {failed ? (
        <div className="boot-error">
          <p>엔진을 시작하지 못했습니다.</p>
          <pre>{error}</pre>
        </div>
      ) : (
        <>
          <p className="muted">
            {progress?.stage ?? "엔진"} 준비 중…
            {progress && progress.total > 0 && (
              <>
                {" "}
                {(progress.loaded / 1e6).toFixed(1)} / {(progress.total / 1e6).toFixed(1)} MB
              </>
            )}
          </p>
          <div className="boot-bar">
            <div
              style={{
                // 전체 크기를 모르면(서버가 길이를 안 알려 주면) 30% 에 세워 둔다.
                width:
                  progress && progress.total
                    ? `${(progress.loaded / progress.total) * 100}%`
                    : "30%",
              }}
            />
          </div>
          <p className="muted small">
            Fairy-Stockfish 엔진과 11MB 장기 신경망을 내려받는 중입니다.
            처음 한 번만 받고 이후에는 브라우저가 캐시합니다.
          </p>
        </>
      )}
    </div>
  );
}
