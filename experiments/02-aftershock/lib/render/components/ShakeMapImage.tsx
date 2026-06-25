"use client";

/** USGS ShakeMap 揺れ強度画像。src=/quakeDetail/shakemapIntensityImgUrl（生 url）。 */
export function ShakeMapImage({
  src,
  title,
  caption,
}: {
  src: string;
  title?: string | null;
  caption?: string | null;
}) {
  return (
    <figure className="sc-shakemap">
      <div className="sc-shakemap__frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="sc-shakemap__img" src={src} alt={title ?? "ShakeMap intensity"} loading="lazy" />
        {title ? <figcaption className="sc-shakemap__title">{title}</figcaption> : null}
      </div>
      {caption ? <figcaption className="sc-shakemap__cap">{caption}</figcaption> : null}
    </figure>
  );
}
