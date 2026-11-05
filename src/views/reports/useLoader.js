import { useEffect, useState } from "react";
import { friendlyError } from "@/lib/errors";

// Runs an async loader whenever deps change; ignores stale results.
export function useLoader(fn, deps) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    Promise.resolve()
      .then(fn)
      .then((data) => alive && setState({ loading: false, error: "", data }))
      .catch((e) => alive && setState({ loading: false, error: friendlyError(e), data: null }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

// ---- small aggregation helpers ----
export const num = (v) => Number(v ?? 0);

export function groupBy(rows, keyFn, init, add) {
  const map = new Map();
  rows.forEach((r) => {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, init(k));
    add(map.get(k), r);
  });
  return [...map.values()];
}

export function monthKey(value) {
  if (!value) return "";
  if (typeof value === "string" && value.length === 10) return value.slice(0, 7);
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function dayKey(value) {
  if (!value) return "";
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function monthLabel(key) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

// local start / end of day for timestamptz filters
export const startIso = (d) => new Date(`${d}T00:00:00`).toISOString();
export const endIso = (d) => new Date(`${d}T23:59:59.999`).toISOString();
