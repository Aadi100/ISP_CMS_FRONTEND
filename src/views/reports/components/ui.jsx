import { Lucide } from "@/base-components";
import classnames from "classnames";

export function Stat({ icon, color = "text-primary", label, value }) {
  return (
    <div className="box p-5 flex items-center intro-y">
      <Lucide icon={icon} className={classnames("w-8 h-8 mr-4 flex-none", color)} />
      <div className="min-w-0">
        <div className="text-xl font-medium truncate">{value}</div>
        <div className="text-slate-500 text-xs mt-0.5">{label}</div>
      </div>
    </div>
  );
}

export function ChartBox({ title, empty, children }) {
  return (
    <div className="box p-5 intro-y">
      <div className="font-medium text-base mb-4">{title}</div>
      {empty ? (
        <div className="text-center text-slate-500 py-10">No data to chart.</div>
      ) : (
        children
      )}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="alert alert-danger show flex items-center mb-2">
      <Lucide icon="AlertCircle" className="w-5 h-5 mr-2 flex-none" />
      <div className="flex-1">{message}</div>
      {onRetry && (
        <button type="button" className="btn btn-sm btn-outline-danger ml-3" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Loading({ text = "Loading..." }) {
  return <div className="box p-10 text-center text-slate-500 intro-y">{text}</div>;
}

export function Badge({ tone = "pending", children }) {
  const cls = {
    success: "bg-success/20 text-success",
    danger: "bg-danger/20 text-danger",
    warning: "bg-warning/20 text-warning",
    pending: "bg-pending/20 text-pending",
    slate: "bg-slate-200 text-slate-500 dark:bg-darkmode-300",
  }[tone];
  return (
    <div className={classnames("py-1 px-2 rounded-full text-xs font-medium inline-block whitespace-nowrap", cls)}>
      {children}
    </div>
  );
}

// Wraps a report section: loading / error / content.
export function Section({ state, children }) {
  if (state.loading && !state.data) return <Loading text="Loading report..." />;
  return (
    <div className="grid grid-cols-12 gap-6">
      {state.error && (
        <div className="col-span-12">
          <ErrorBanner message={state.error} onRetry={state.reload} />
        </div>
      )}
      {state.data && children(state.data)}
    </div>
  );
}
