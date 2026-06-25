"use client";

import { defineRegistry } from "@json-render/react";
import { catalog } from "./catalog";
import { BigStat as BigStatView } from "./components/BigStat";
import { QuakeList as QuakeListView } from "./components/QuakeList";
import { MagnitudeBars as MagnitudeBarsView } from "./components/MagnitudeBars";
import { Beachball as BeachballView } from "./components/Beachball";
import { ShakeMapImage as ShakeMapImageView } from "./components/ShakeMapImage";
import { WeatherTile as WeatherTileView } from "./components/WeatherTile";
import { Sparkline as SparklineView } from "./components/Sparkline";
import { ArticleGrid as ArticleGridView } from "./components/ArticleGrid";
import { AlertBanner as AlertBannerView } from "./components/AlertBanner";

/** カタログの各部品名 → React コンポーネント。汎用は inline、データ可視化は components/ から。 */
const GAP_PX = { sm: 8, md: 16, lg: 28 } as const;

export const { registry } = defineRegistry(catalog, {
  components: {
    Stack: ({ props, children }) => (
      <div
        className={`sc-stack sc-stack--${props.direction === "horizontal" ? "row" : "col"}`}
        style={{
          display: "flex",
          flexDirection: props.direction === "horizontal" ? "row" : "column",
          gap: GAP_PX[props.gap],
          flexWrap: props.wrap ? "wrap" : "nowrap",
        }}
      >
        {children}
      </div>
    ),

    Card: ({ props, children }) => (
      <section className={`sc-card${props.tone === "danger" ? " sc-card--danger" : ""}`}>
        {props.title ? <h3 className="sc-card__title">{props.title}</h3> : null}
        <div className="sc-card__body">{children}</div>
      </section>
    ),

    Heading: ({ props }) => {
      const Tag = props.level;
      return <Tag className={`sc-heading sc-heading--${props.level}`}>{props.text}</Tag>;
    },

    Text: ({ props }) => <p className={`sc-text${props.muted ? " sc-text--muted" : ""}`}>{props.text}</p>,

    List: ({ props }) => {
      const Tag = props.ordered ? "ol" : "ul";
      return (
        <div className="sc-list">
          {props.title ? <div className="sc-list__title">{props.title}</div> : null}
          <Tag className="sc-list__items">
            {props.items.map((item, i) => (
              <li key={i} className="sc-list__item">
                {item}
              </li>
            ))}
          </Tag>
        </div>
      );
    },

    Badge: ({ props }) => <span className={`sc-badge sc-badge--${props.tone}`}>{props.text}</span>,

    Kpi: ({ props }) => (
      <div className="sc-kpi">
        <div className="sc-kpi__label">{props.label}</div>
        <div className="sc-kpi__value">
          {props.value}
          {props.unit ? <span className="sc-kpi__unit"> {props.unit}</span> : null}
        </div>
        {props.hint ? <div className="sc-kpi__hint">{props.hint}</div> : null}
      </div>
    ),

    BigStat: ({ props }) => (
      <BigStatView
        label={props.label}
        value={props.value}
        unit={props.unit}
        context={props.context}
        decimals={props.decimals}
        tone={props.tone}
      />
    ),

    // emit("click") → Renderer が element.on.click を解決し provider の "ask" ハンドラを呼ぶ。
    ActionButton: ({ props, emit }) => (
      <button type="button" className={`sc-actionbtn sc-actionbtn--${props.tone}`} onClick={() => emit("click")}>
        {props.label}
      </button>
    ),

    QuakeList: ({ props }) => <QuakeListView rows={props.rows} caption={props.caption} />,
    MagnitudeBars: ({ props }) => <MagnitudeBarsView rows={props.rows} />,
    Beachball: ({ props }) => <BeachballView planes={props.planes} faultType={props.faultType} />,
    ShakeMapImage: ({ props }) => <ShakeMapImageView src={props.src} title={props.title} caption={props.caption} />,
    WeatherTile: ({ props }) => <WeatherTileView current={props.current} label={props.label} />,
    Sparkline: ({ props }) => <SparklineView points={props.points} label={props.label} />,
    ArticleGrid: ({ props }) => <ArticleGridView articles={props.articles} />,
    AlertBanner: ({ props }) => <AlertBannerView level={props.level} title={props.title} text={props.text} />,
  },
  actions: {},
});

/** Renderer fallback for any element whose type isn't registered (rare; sanitize prunes first). */
export function Fallback() {
  return <div className="sc-fallback">この部品は描画できませんでした。</div>;
}
