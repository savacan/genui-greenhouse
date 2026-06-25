"use client";

export interface CurrentWeather {
  time: string;
  temp: number;
  wind: number;
  condition: string;
}

/** 現在天気タイル。current=/weather/current（生のまま）。 */
export function WeatherTile({ current, label }: { current: CurrentWeather; label?: string | null }) {
  // condition は "曇り ☁️" のように末尾に emoji。取り出して大きく見せる。
  const m = current.condition.match(/(\p{Emoji}+)\s*$/u);
  const emoji = m ? m[1] : "🌡️";
  const text = m ? current.condition.replace(/\s*\p{Emoji}+\s*$/u, "") : current.condition;
  return (
    <div className="sc-weather">
      <div className="sc-weather__emoji" aria-hidden>{emoji}</div>
      <div className="sc-weather__body">
        {label ? <div className="sc-weather__label">{label}</div> : null}
        <div className="sc-weather__temp">
          {current.temp}
          <span className="sc-weather__unit">°C</span>
        </div>
        <div className="sc-weather__meta">
          {text} · 風 {current.wind} km/h
        </div>
      </div>
    </div>
  );
}
