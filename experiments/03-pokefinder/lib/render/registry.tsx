"use client";

import { defineRegistry, useBoundProp } from "@json-render/react";
import { catalog } from "./catalog";
import { MonGrid as MonGridView } from "./components/MonGrid";

/** カタログの各部品名 → React コンポーネント。汎用は inline（01/02 写経）、入力は two-way。 */
const GAP_PX = { sm: 8, md: 16, lg: 28 } as const;

export const { registry } = defineRegistry(catalog, {
  components: {
    // ---------- 汎用（写経） ----------
    Stack: ({ props, children }) => (
      <div
        style={{
          display: "flex",
          flexDirection: props.direction === "horizontal" ? "row" : "column",
          gap: GAP_PX[props.gap],
          flexWrap: props.wrap ? "wrap" : "nowrap",
          alignItems: props.direction === "horizontal" ? "center" : "stretch",
        }}
      >
        {children}
      </div>
    ),

    Card: ({ props, children }) => (
      <section className={`pf-panel${props.tone === "accent" ? " pf-panel--accent" : ""}`}>
        {props.title ? <h3 className="pf-panel__title">{props.title}</h3> : null}
        <div className="pf-panel__body">{children}</div>
      </section>
    ),

    Heading: ({ props }) => {
      const Tag = props.level;
      return <Tag className={`pf-heading pf-heading--${props.level}`}>{props.text}</Tag>;
    },

    Text: ({ props }) => <p className={`pf-text${props.muted ? " pf-text--muted" : ""}`}>{props.text}</p>,

    Badge: ({ props }) => <span className={`pf-badge pf-badge--${props.tone}`}>{props.text}</span>,

    Kpi: ({ props }) => (
      <div className="pf-kpi">
        <div className="pf-kpi__label">{props.label}</div>
        <div className="pf-kpi__value">
          {props.value}
          {props.unit ? <span className="pf-kpi__unit"> {props.unit}</span> : null}
        </div>
      </div>
    ),

    // ---------- 入力（two-way・exp03 の核） ----------
    // checked を $bindState で state に双方向結合。トグルは即座に local state を書き換える（サーバ往復なし）。
    TypeCheckbox: ({ props, bindings }) => {
      const [checked, setChecked] = useBoundProp<boolean>(props.checked, bindings?.checked);
      return (
        <label className={`pf-check${checked ? " pf-check--on" : ""}`} style={checked && props.color ? { borderColor: props.color, background: `${props.color}22` } : undefined}>
          <input type="checkbox" checked={checked ?? false} onChange={(e) => setChecked(e.target.checked)} />
          {props.color ? <span className="pf-check__dot" style={{ background: props.color }} /> : null}
          <span className="pf-check__label">{props.label}</span>
        </label>
      );
    },

    Select: ({ props, bindings }) => {
      const [value, setValue] = useBoundProp<number | string | null>(props.value, bindings?.value);
      const keyOf = (v: number | string | null) => (v === null || v === undefined ? "__all__" : String(v));
      const cur = keyOf(value ?? null);
      return (
        <label className="pf-select">
          <span className="pf-select__label">{props.label}</span>
          <select
            value={cur}
            onChange={(e) => {
              const opt = props.options.find((o) => keyOf(o.value) === e.target.value);
              setValue(opt ? (opt.value as number | string | null) : null);
            }}
          >
            {props.options.map((o) => (
              <option key={keyOf(o.value)} value={keyOf(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      );
    },

    Slider: ({ props, bindings }) => {
      const [value, setValue] = useBoundProp<number>(props.value, bindings?.value);
      const v = value ?? 0;
      return (
        <label className="pf-slider">
          <span className="pf-slider__label">
            {props.label}
            <span className="pf-slider__val">
              {v}
              {props.unit ? props.unit : ""}
            </span>
          </span>
          <input
            type="range"
            min={props.min}
            max={props.max}
            step={props.step}
            value={v}
            onChange={(e) => setValue(Number(e.target.value))}
          />
        </label>
      );
    },

    // 単独 ON/OFF トグル（別形態を含めるか等）。checked を $bindState で state に two-way 結合。
    Toggle: ({ props, bindings }) => {
      const [checked, setChecked] = useBoundProp<boolean>(props.checked, bindings?.checked);
      return (
        <label className={`pf-toggle${checked ? " pf-toggle--on" : ""}`}>
          <input type="checkbox" checked={checked ?? false} onChange={(e) => setChecked(e.target.checked)} />
          <span className="pf-toggle__label">{props.label}</span>
        </label>
      );
    },

    // emit("click") → Renderer が element.on.click を解決し provider の "find" ハンドラを呼ぶ。
    ActionButton: ({ props, emit }) => (
      <button type="button" className={`pf-actionbtn pf-actionbtn--${props.tone}`} onClick={() => emit("click")}>
        {props.label}
      </button>
    ),

    // ---------- 出力 ----------
    MonGrid: ({ props }) => <MonGridView mons={props.mons} />,
  },
  actions: {},
});

/** Renderer fallback for any element whose type isn't registered (rare; sanitize prunes first). */
export function Fallback() {
  return <div className="pf-fallback">この部品は描画できませんでした。</div>;
}
