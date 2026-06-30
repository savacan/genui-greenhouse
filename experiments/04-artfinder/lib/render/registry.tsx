"use client";

import { defineRegistry, useBoundProp } from "@json-render/react";
import { catalog } from "./catalog";
import { ArtGrid as ArtGridView } from "./components/ArtGrid";

/** カタログの各部品名 → React コンポーネント。汎用は inline（写経）、入力は two-way（useBoundProp）。 */
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
      <section className={`af-panel${props.tone === "accent" ? " af-panel--accent" : ""}`}>
        {props.title ? <h3 className="af-panel__title">{props.title}</h3> : null}
        <div className="af-panel__body">{children}</div>
      </section>
    ),

    Heading: ({ props }) => {
      const Tag = props.level;
      return <Tag className={`af-heading af-heading--${props.level}`}>{props.text}</Tag>;
    },

    Text: ({ props }) => <p className={`af-text${props.muted ? " af-text--muted" : ""}`}>{props.text}</p>,

    Badge: ({ props }) => <span className={`af-badge af-badge--${props.tone}`}>{props.text}</span>,

    Kpi: ({ props }) => (
      <div className="af-kpi">
        <div className="af-kpi__label">{props.label}</div>
        <div className="af-kpi__value">
          {props.value}
          {props.unit ? <span className="af-kpi__unit"> {props.unit}</span> : null}
        </div>
      </div>
    ),

    // ---------- 入力（two-way・exp04 の核） ----------
    FacetCheckbox: ({ props, bindings }) => {
      const [checked, setChecked] = useBoundProp<boolean>(props.checked, bindings?.checked);
      return (
        <label className={`af-check${checked ? " af-check--on" : ""}`}>
          <input type="checkbox" checked={checked ?? false} onChange={(e) => setChecked(e.target.checked)} />
          <span className="af-check__label">{props.label}</span>
        </label>
      );
    },

    // 色相スウォッチ（単一選択・複数 swatch が同じ /shelf/hue を共有）。選択中は props.hue===value。
    ColorSwatch: ({ props, bindings }) => {
      const [value, setValue] = useBoundProp<number | null>(props.value, bindings?.value);
      const on = value != null && value === props.hue;
      return (
        <button
          type="button"
          className={`af-swatch${on ? " af-swatch--on" : ""}`}
          style={{ background: props.swatch }}
          title={props.label}
          aria-pressed={on}
          onClick={() => setValue(on ? null : props.hue)}
        >
          {on ? <span className="af-swatch__check">✓</span> : null}
        </button>
      );
    },

    TextInput: ({ props, bindings }) => {
      const [value, setValue] = useBoundProp<string | null>(props.value, bindings?.value);
      return (
        <label className="af-field">
          <span className="af-field__label">{props.label}</span>
          <input
            className="af-textinput"
            type="text"
            value={value ?? ""}
            placeholder={props.placeholder ?? ""}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
      );
    },

    RangeSelect: ({ props, bindings }) => {
      const [from, setFrom] = useBoundProp<number | null>(props.from, bindings?.from);
      const [to, setTo] = useBoundProp<number | null>(props.to, bindings?.to);
      const num = (s: string) => (s === "" ? null : Number(s));
      return (
        <label className="af-field">
          <span className="af-field__label">{props.label}</span>
          <span className="af-range__row">
            <input type="number" className="af-numinput" value={from ?? ""} min={props.min} max={props.max} placeholder="から" onChange={(e) => setFrom(num(e.target.value))} />
            <span className="af-range__dash">—</span>
            <input type="number" className="af-numinput" value={to ?? ""} min={props.min} max={props.max} placeholder="まで" onChange={(e) => setTo(num(e.target.value))} />
          </span>
        </label>
      );
    },

    Toggle: ({ props, bindings }) => {
      const [checked, setChecked] = useBoundProp<boolean>(props.checked, bindings?.checked);
      return (
        <label className={`af-toggle${checked ? " af-toggle--on" : ""}`}>
          <input type="checkbox" checked={checked ?? false} onChange={(e) => setChecked(e.target.checked)} />
          <span className="af-toggle__label">{props.label}</span>
        </label>
      );
    },

    Select: ({ props, bindings }) => {
      const [value, setValue] = useBoundProp<number | string | null>(props.value, bindings?.value);
      const keyOf = (v: number | string | null) => (v === null || v === undefined ? "__all__" : String(v));
      const cur = keyOf(value ?? null);
      return (
        <label className="af-field">
          <span className="af-field__label">{props.label}</span>
          <select
            className="af-select"
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

    ActionButton: ({ props, emit }) => (
      <button type="button" className={`af-actionbtn af-actionbtn--${props.tone}`} onClick={() => emit("click")}>
        {props.label}
      </button>
    ),

    // ---------- 出力 ----------
    ArtGrid: ({ props }) => <ArtGridView artworks={props.artworks} />,
  },
  actions: {},
});

/** Renderer fallback for any element whose type isn't registered (rare; sanitize prunes first). */
export function Fallback() {
  return <div className="af-fallback">この部品は描画できませんでした。</div>;
}
