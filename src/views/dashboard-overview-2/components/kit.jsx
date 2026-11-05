import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import classnames from "classnames";
import { Lucide } from "@/base-components";
import { friendlyError } from "@/lib/errors";

// Loads one widget independently. fn() must return the data (throw on error).
export function useWidget(fn, enabled = true) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
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
  }, [enabled, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

// Card with its own title, link, loading and error state.
export function Widget({ title, icon, to, state, children, className = "xl:col-span-4" }) {
  return (
    <div className={classnames("col-span-12 md:col-span-6 intro-y", className)}>
      <div className="box p-5 h-full">
        <div className="flex items-center mb-4">
          {icon && <Lucide icon={icon} className="w-5 h-5 mr-2 text-primary flex-none" />}
          <div className="font-medium text-base truncate">{title}</div>
          {to && (
            <Link to={to} className="ml-auto text-primary text-sm whitespace-nowrap pl-3">
              View all
            </Link>
          )}
        </div>
        {state.loading && !state.data ? (
          <div className="text-center text-slate-500 py-6">Loading...</div>
        ) : state.error ? (
          <div className="alert alert-danger show flex items-center">
            <div className="flex-1 text-sm">{state.error}</div>
            <button type="button" className="btn btn-sm btn-outline-danger ml-3" onClick={state.reload}>
              Retry
            </button>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export function Row({ label, value, tone, to }) {
  const inner = (
    <>
      <div className="text-slate-500 truncate mr-3">{label}</div>
      <div className={classnames("ml-auto font-medium whitespace-nowrap", tone)}>{value}</div>
    </>
  );
  const cls = "flex items-center py-2 border-b border-slate-200/60 dark:border-darkmode-400 last:border-0";
  return to ? (
    <Link to={to} className={classnames(cls, "hover:text-primary")}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function Empty({ text }) {
  return <div className="text-center text-slate-500 py-4 text-sm">{text}</div>;
}

export function SubTitle({ children }) {
  return <div className="text-xs uppercase text-slate-500 mt-4 mb-1">{children}</div>;
}

export function Bar({ label, used, max }) {
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const color = pct >= 90 ? "bg-danger" : pct >= 75 ? "bg-warning" : "bg-primary";
  return (
    <div className="mb-3">
      <div className="flex text-sm mb-1">
        <span>{label}</span>
        <span className="ml-auto text-slate-500">
          {used} / {max ?? "unlimited"}
        </span>
      </div>
      <div className="h-2 rounded bg-slate-200 dark:bg-darkmode-400 overflow-hidden">
        <div className={classnames("h-2 rounded", color)} style={{ width: `${max ? pct : 0}%` }} />
      </div>
    </div>
  );
}

export const isoDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
