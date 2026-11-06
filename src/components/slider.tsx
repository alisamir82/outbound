"use client";

import { useState, type CSSProperties } from "react";

/**
 * Range slider with a brand-filled track and a live value readout.
 * Submits like a plain input, so it drops into server-action forms.
 */
export function Slider({
  name,
  min,
  max,
  step = 1,
  defaultValue,
  suffix = "",
  labels,
}: {
  name: string;
  min: number;
  max: number;
  step?: number;
  defaultValue: number;
  suffix?: string;
  labels?: [string, string];
}) {
  const [value, setValue] = useState(defaultValue);
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className="w-full pt-1">
      <div className="flex items-center gap-3">
        <input
          type="range"
          name={name}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="slider min-w-0 flex-1"
          style={{ "--fill": `${fill}%` } as CSSProperties}
        />
        <output className="min-w-12 rounded-md bg-brand-50 px-2 py-0.5 text-center text-sm font-semibold tabular-nums text-brand-700 ring-1 ring-inset ring-brand-200">
          {value}
          {suffix}
        </output>
      </div>
      {labels ? (
        <div className="mt-1 flex justify-between text-[11px] text-stone-400">
          <span>{labels[0]}</span>
          <span>{labels[1]}</span>
        </div>
      ) : null}
    </div>
  );
}
