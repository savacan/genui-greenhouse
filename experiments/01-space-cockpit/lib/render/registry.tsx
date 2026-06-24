"use client";

import { defineRegistry } from "@json-render/react";
import { catalog } from "./catalog";
import { AsteroidTable as AsteroidTableView } from "./components/AsteroidTable";
import { AsteroidScatter as AsteroidScatterView } from "./components/AsteroidScatter";
import { OrbitProximity as OrbitProximityView } from "./components/OrbitProximity";
import { ScatterPlot as ScatterPlotView } from "./components/ScatterPlot";
import { Histogram as HistogramView } from "./components/Histogram";
import { BigStat as BigStatView } from "./components/BigStat";
import { IssMap as IssMapView } from "./components/IssMap";
import { Globe3D as Globe3DView } from "./components/Globe3D";
import { Countdown as CountdownView } from "./components/Countdown";
import { LaunchTimeline as LaunchTimelineView } from "./components/LaunchTimeline";
import { SolarWindGauges as SolarWindGaugesView } from "./components/SolarWindGauges";
import { KpDial as KpDialView } from "./components/KpDial";
import { KpForecastStrip as KpForecastStripView } from "./components/KpForecastStrip";
import { SunEarthLane as SunEarthLaneView } from "./components/SunEarthLane";
import { AuroraOvalGlobe as AuroraOvalGlobeView } from "./components/AuroraOvalGlobe";
import { FlareEventRail as FlareEventRailView } from "./components/FlareEventRail";

/**
 * レジストリ = カタログの各部品名 → 実際の React コンポーネント。
 * ここは「描画の真実」。LLM は触らない（部品の選択と並べ方を spec で指示するだけ）。
 */

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

    Text: ({ props }) => (
      <p className={`sc-text${props.muted ? " sc-text--muted" : ""}`}>{props.text}</p>
    ),

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

    Countdown: ({ props }) => (
      <CountdownView target={props.target} label={props.label} precision={props.precision} zeroLabel={props.zeroLabel} />
    ),
    LaunchTimeline: ({ props }) => <LaunchTimelineView items={props.items} />,

    // emit("click") → Renderer が element.on.click を解決し、provider の "ask" ハンドラを呼ぶ。
    ActionButton: ({ props, emit }) => (
      <button
        type="button"
        className={`sc-actionbtn sc-actionbtn--${props.tone}`}
        onClick={() => emit("click")}
      >
        {props.label}
      </button>
    ),

    Badge: ({ props }) => (
      <span className={`sc-badge sc-badge--${props.tone}`}>{props.text}</span>
    ),

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

    HeroImage: ({ props }) => (
      <figure className="sc-hero">
        <div className="sc-hero__frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="sc-hero__img" src={props.src} alt={props.title ?? "space image"} />
          {props.title || props.credit ? (
            <div className="sc-hero__overlay">
              {props.title ? <div className="sc-hero__title">{props.title}</div> : null}
              {props.credit ? <div className="sc-hero__credit">{props.credit}</div> : null}
            </div>
          ) : null}
        </div>
        {props.caption ? <figcaption className="sc-hero__caption">{props.caption}</figcaption> : null}
      </figure>
    ),

    Gallery: ({ props }) => (
      <div className={`sc-gallery sc-gallery--c${props.columns}`}>
        {props.images.map((im, i) => (
          <figure key={i} className="sc-gallery__item">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="sc-gallery__img" src={im.src} alt={im.caption ?? "space image"} loading="lazy" />
            {im.caption ? <figcaption className="sc-gallery__cap">{im.caption}</figcaption> : null}
          </figure>
        ))}
      </div>
    ),

    AsteroidTable: ({ props }) => <AsteroidTableView rows={props.rows} caption={props.caption} />,
    AsteroidScatter: ({ props }) => <AsteroidScatterView points={props.points} />,
    OrbitProximity: ({ props }) => <OrbitProximityView points={props.points} />,
    ScatterPlot: ({ props }) => <ScatterPlotView points={props.points} />,
    Histogram: ({ props }) => <HistogramView bars={props.bars} />,
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
    IssMap: ({ props }) => <IssMapView lat={props.lat} lon={props.lon} label={props.label} />,
    Globe3D: ({ props }) => <Globe3DView lat={props.lat} lon={props.lon} label={props.label} />,
    SolarWindGauges: ({ props }) => (
      <SolarWindGaugesView speed={props.speed} density={props.density} temperature={props.temperature} bz={props.bz} series={props.series} />
    ),
    KpDial: ({ props }) => <KpDialView kp={props.kp} gScale={props.gScale} />,
    KpForecastStrip: ({ props }) => <KpForecastStripView bars={props.bars} />,
    SunEarthLane: ({ props }) => <SunEarthLaneView progress={props.progress} speedKmS={props.speedKmS} status={props.status} />,
    AuroraOvalGlobe: ({ props }) => (
      <AuroraOvalGlobeView band={props.band} hemisphere={props.hemisphere} observerLat={props.observerLat} observerLon={props.observerLon} />
    ),
    FlareEventRail: ({ props }) => <FlareEventRailView items={props.items} />,
  },
  actions: {},
});

/** Renderer fallback for any element whose type isn't registered (rare; sanitize prunes first). */
export function Fallback() {
  return <div className="sc-fallback">この部品は描画できませんでした。</div>;
}
