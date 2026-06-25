"use client";

export interface ArticleView {
  title: string;
  dist: number; // meters
  description: string | null;
  thumbnail: string | null;
  url: string | null;
}

const km = (m: number) => (m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`);

/** 震源近傍の Wikipedia 記事グリッド。articles=/nearby/articles（生のまま）。 */
export function ArticleGrid({ articles }: { articles: ArticleView[] }) {
  if (!articles?.length) return <p className="sc-text sc-text--muted">近くに記事のある場所はありませんでした。</p>;
  return (
    <div className="sc-articles">
      {articles.map((a, i) => {
        const inner = (
          <>
            {a.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="sc-articles__thumb" src={a.thumbnail} alt={a.title} loading="lazy" />
            ) : (
              <div className="sc-articles__thumb sc-articles__thumb--none" aria-hidden>📍</div>
            )}
            <div className="sc-articles__body">
              <div className="sc-articles__title">{a.title}</div>
              <div className="sc-articles__dist">{km(a.dist)}</div>
              {a.description ? <div className="sc-articles__desc">{a.description}</div> : null}
            </div>
          </>
        );
        return a.url ? (
          <a key={i} className="sc-articles__item" href={a.url} target="_blank" rel="noreferrer">
            {inner}
          </a>
        ) : (
          <div key={i} className="sc-articles__item" >
            {inner}
          </div>
        );
      })}
    </div>
  );
}
