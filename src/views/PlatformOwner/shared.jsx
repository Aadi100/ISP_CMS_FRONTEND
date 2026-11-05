// Small UI helpers shared by the platform-owner pages.
import { titleCase } from "@/lib/format";

const BADGES = {
  active: "bg-success/20 text-success",
  trial: "bg-primary/20 text-primary",
  inactive: "bg-slate-200 text-slate-600",
  suspended: "bg-danger/20 text-danger",
  expired: "bg-danger/20 text-danger",
  cancelled: "bg-slate-200 text-slate-600",
  disabled: "bg-danger/20 text-danger",
};

export function StatusBadge({ status }) {
  return (
    <span
      className={`px-2 py-1 rounded text-xs font-medium ${
        BADGES[status] || "bg-slate-200 text-slate-600"
      }`}
    >
      {titleCase(status || "-")}
    </span>
  );
}

export function ErrorBanner({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="intro-y alert alert-danger show mb-5 flex items-start justify-between gap-3">
      <span>{message}</span>
      {onClose && (
        <button type="button" className="text-xl leading-none" onClick={onClose}>
          ×
        </button>
      )}
    </div>
  );
}

export function InfoBanner({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="intro-y alert alert-success show mb-5 flex items-start justify-between gap-3">
      <span>{message}</span>
      {onClose && (
        <button type="button" className="text-xl leading-none" onClick={onClose}>
          ×
        </button>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-5 overflow-y-auto">
      <div className={`box w-full ${wide ? "max-w-2xl" : "max-w-md"} p-5 max-h-full overflow-y-auto`}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-medium">{title}</h3>
          <button type="button" className="text-slate-500 text-xl" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex items-center justify-between mt-5 text-sm">
      <div className="text-slate-500">
        {from}-{to} of {total}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </button>
        <span>
          Page {page + 1} / {pages}
        </span>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          disabled={page + 1 >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

/** Horizontal bar list: items = [{ label, value, hint }] */
export function BarList({ items, format = (v) => v, empty = "No data yet." }) {
  const max = Math.max(0, ...items.map((i) => Number(i.value) || 0));
  if (!items.length || max === 0) {
    return <div className="text-slate-500 text-sm py-4">{empty}</div>;
  }
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="flex justify-between text-sm mb-1">
            <span className="font-medium">{item.label}</span>
            <span className="text-slate-500">
              {format(item.value)}
              {item.hint ? ` · ${item.hint}` : ""}
            </span>
          </div>
          <div className="h-2 rounded bg-slate-200">
            <div
              className="h-2 rounded bg-primary"
              style={{ width: `${Math.max(2, ((Number(item.value) || 0) / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Vertical column chart: items = [{ label, value }] */
export function ColumnChart({ items, format = (v) => v, empty = "No data yet." }) {
  const max = Math.max(0, ...items.map((i) => Number(i.value) || 0));
  if (!items.length || max === 0) {
    return <div className="text-slate-500 text-sm py-4">{empty}</div>;
  }
  return (
    <div className="flex items-end gap-2 h-48">
      {items.map((item) => (
        <div key={item.label} className="flex-1 flex flex-col items-center justify-end h-full">
          <div className="text-xs text-slate-500 mb-1">{format(item.value)}</div>
          <div
            className="w-full rounded-t bg-primary"
            style={{ height: `${Math.max(2, ((Number(item.value) || 0) / max) * 80)}%` }}
          />
          <div className="text-xs mt-1 truncate max-w-full">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

export function downloadCsv(filename, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** "2026-11" style key and a short label */
export function monthKey(value) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
  });
}

/** last n month keys, oldest first */
export function lastMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Is this subscription live but already past its expiry date? */
export function isOverdue(sub) {
  return (
    ["active", "trial"].includes(sub.status) &&
    sub.expires_at &&
    new Date(sub.expires_at) < new Date()
  );
}

/** Monthly-equivalent price of a plan. */
export function monthlyPrice(plan) {
  const p = Number(plan?.price || 0);
  if (plan?.billing_cycle === "yearly") return p / 12;
  if (plan?.billing_cycle === "quarterly") return p / 3;
  return p;
}

export const ORG_STATUSES = ["active", "inactive", "suspended"];
export const SUB_STATUSES = ["active", "trial", "expired", "cancelled", "inactive"];

export const EDGE_UNAVAILABLE =
  "This action needs a backend function that is not reachable (not deployed yet, or the network is down). Please deploy the edge function and try again.";

/** Translate a functions.invoke error into a clear message. */
export async function edgeError(error, friendly) {
  if (!error) return "";
  const name = error.name || "";
  if (name === "FunctionsFetchError" || name === "FunctionsRelayError") return EDGE_UNAVAILABLE;
  const ctx = error.context;
  if (ctx && typeof ctx.json === "function") {
    if (ctx.status === 404) return EDGE_UNAVAILABLE;
    try {
      const body = await ctx.json();
      if (body?.error) return body.error;
    } catch (e) {
      /* ignore */
    }
  }
  return friendly(error);
}
