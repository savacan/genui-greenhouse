"use client";

import { useContext } from "react";
import { AnchorContext } from "../anchorContext";

/**
 * 結果ボードの作品画像カード・グリッド（出力部品）。pokefinder の MonGrid と同型 = 部品が配列の反復を持つ
 * （json-render の repeat を spec に書かせず、/findArt/artworks をそのままバインド）。
 *
 * §14: AnchorContext が居れば各カードに「これに似た作品を」= 出力に乗せた入力アフォーダンスを出す。
 * クリックでその作品を上流へ渡し、page が seed 付きで「似た作品」フォームを再 compose する。
 *
 * 画像は AIC の IIIF（www.artic.edu）。画像ホストは Cloudflare の challenge 裏だが、ブラウザの <img>
 * サブリソースは通過後に描画する（docs §2）。読めない場合に備えてプレースホルダを出す（onError）。
 */

export interface ArtGridRow {
  id: number;
  title: string;
  artist: string;
  dateText: string;
  medium: string;
  type: string;
  department: string;
  origin?: string;
  subjects?: string[];
  onView: boolean;
  image: string | null;
  swatch: string | null;
  hue: number | null;
}

export function ArtGrid({ artworks }: { artworks: ArtGridRow[] }) {
  const onAnchor = useContext(AnchorContext);
  if (!artworks?.length) {
    return <p className="af-empty">該当ゼロ。条件をゆるめてみて。</p>;
  }
  return (
    <div className="af-grid">
      {artworks.map((a) => (
        <article key={a.id} className={`af-card${onAnchor ? " af-card--anchorable" : ""}`}>
          {/* AIC の IIIF 画像は cross-origin 表示不可（Cloudflare + CORP・docs §2）。背景に主要色チップを敷き、
              画像が読めた環境（artic.edu と同一オリジン等）では画像が上に乗る。読めない時は色チップが残る＝色の視覚化。 */}
          <div className="af-thumb" style={a.swatch ? { background: a.swatch } : undefined}>
            {a.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="af-img"
                src={a.image}
                alt={a.title}
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                }}
              />
            ) : null}
            {a.onView ? <span className="af-onview">展示中</span> : null}
          </div>
          <div className="af-card__body">
            <div className="af-card__title">{a.title}</div>
            <div className="af-card__artist">{a.artist}</div>
            <div className="af-card__meta">
              {a.dateText ? <span>{a.dateText}</span> : null}
              {a.type ? <span className="af-typebadge">{a.type}</span> : null}
              {a.origin ? <span className="af-origin">{a.origin}</span> : null}
            </div>
            {a.medium ? <div className="af-card__medium">{a.medium}</div> : null}
          </div>
          {onAnchor ? (
            <button
              type="button"
              className="af-anchorbtn"
              onClick={() => onAnchor(a)}
              title={`${a.artist} に似た作品をさがす`}
            >
              ◎ これに似た作品を
            </button>
          ) : null}
        </article>
      ))}
    </div>
  );
}
