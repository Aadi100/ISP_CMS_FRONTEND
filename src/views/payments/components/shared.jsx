import { Lucide } from "@/base-components";
import classnames from "classnames";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { money, titleCase } from "@/lib/format";

// ---------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------
export const DB_METHODS = [
  "cash",
  "bank_transfer",
  "online",
  "cheque",
  "jazzcash",
  "easypaisa",
  "wallet",
];

export const methodLabel = (m) => (m === "advance_credit" ? "Advance Credit" : titleCase(m));

const BADGE = "py-1 px-2 rounded-full text-xs font-medium inline-block whitespace-nowrap";

const INVOICE_PAYMENT_CLASSES = {
  paid: "bg-success/20 text-success",
  unpaid: "bg-pending/20 text-pending",
  partial: "bg-warning/20 text-warning",
  overdue: "bg-danger/20 text-danger",
};

const PAYMENT_RECORD_CLASSES = {
  confirmed: "bg-success/20 text-success",
  pending: "bg-pending/20 text-pending",
  rejected: "bg-danger/20 text-danger",
  refunded: "bg-slate-200 text-slate-500 dark:bg-darkmode-300",
};

export function InvoicePaymentBadge({ status }) {
  return (
    <div className={classnames(BADGE, INVOICE_PAYMENT_CLASSES[status] || "bg-slate-200 text-slate-500")}>
      {titleCase(status)}
    </div>
  );
}

export function PaymentRecordBadge({ status }) {
  return (
    <div className={classnames(BADGE, PAYMENT_RECORD_CLASSES[status] || "bg-slate-200 text-slate-500")}>
      {titleCase(status)}
    </div>
  );
}

export function InvoiceStatusBadge({ status }) {
  const cls =
    status === "cancelled"
      ? "bg-danger/20 text-danger"
      : status === "sent"
        ? "bg-slate-200 text-slate-500 dark:bg-darkmode-300"
        : "bg-primary/20 text-primary";
  return <div className={classnames(BADGE, cls)}>{titleCase(status)}</div>;
}

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------
export const todayISO = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const addDaysISO = (iso, days) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Escape a value for use inside a PostgREST .or() ilike pattern. */
export const likeSafe = (s) => String(s).replace(/[,()%*\\]/g, " ").trim();

export function useSession() {
  const [session, setSession] = useState(null);
  useEffect(() => {
    let alive = true;
    getSession().then((s) => alive && setSession(s));
    return () => {
      alive = false;
    };
  }, []);
  return session;
}

/** Enabled payment methods = DB list filtered by organization_settings.payment_methods. */
export function usePaymentMethods() {
  const [methods, setMethods] = useState(DB_METHODS);
  const [confirmationRequired, setConfirmationRequired] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase
      .from("organization_settings")
      .select("payment_methods, payment_confirmation_required")
      .maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return;
        const cfg = data.payment_methods || {};
        const enabled = DB_METHODS.filter((m) => cfg[m] !== false);
        setMethods(enabled.length ? enabled : DB_METHODS);
        setConfirmationRequired(Boolean(data.payment_confirmation_required));
      });
    return () => {
      alive = false;
    };
  }, []);
  return { methods, confirmationRequired };
}

export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const show = useCallback((message, type = "success") => {
    setToast({ message, type });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 6000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const node = toast ? (
    <div
      className={classnames(
        "fixed bottom-6 right-6 z-[60] max-w-sm box p-4 shadow-lg border-l-4 flex items-start",
        toast.type === "error" ? "border-danger" : "border-success"
      )}
      role="status"
    >
      <Lucide
        icon={toast.type === "error" ? "XCircle" : "CheckCircle"}
        className={classnames("w-5 h-5 mr-3 flex-none", toast.type === "error" ? "text-danger" : "text-success")}
      />
      <div className="text-sm">{toast.message}</div>
      <button type="button" onClick={() => setToast(null)} className="ml-3 text-slate-400 hover:text-slate-600">
        <Lucide icon="X" className="w-4 h-4" />
      </button>
    </div>
  ) : null;
  return { show, node };
}

export function ErrorBanner({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="alert alert-danger flex items-center mb-2" role="alert">
      <Lucide icon="AlertOctagon" className="w-5 h-5 mr-2 flex-none" />
      <span className="flex-1 text-sm">{message}</span>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Dismiss">
          <Lucide icon="X" className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
      <div
        className={classnames(
          "relative box w-full p-0 max-h-[92vh] overflow-y-auto",
          wide ? "max-w-3xl" : "max-w-lg"
        )}
      >
        <div className="flex items-center p-5 border-b border-slate-200/60 dark:border-darkmode-400">
          <h2 className="text-lg font-medium">{title}</h2>
          <button type="button" onClick={onClose} className="ml-auto text-slate-500 hover:text-slate-700" aria-label="Close">
            <Lucide icon="X" className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 p-5 border-t border-slate-200/60 dark:border-darkmode-400">{footer}</div>
        )}
      </div>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage, onPageSize }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex flex-wrap items-center gap-3 mt-4 text-sm text-slate-500">
      <div>
        {from}-{to} of {total}
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <select className="form-select box w-20" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
          {[10, 25, 50].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-outline-secondary" disabled={page <= 0} onClick={() => onPage(page - 1)}>
          <Lucide icon="ChevronLeft" className="w-4 h-4" />
        </button>
        <span>
          Page {page + 1} / {pages}
        </span>
        <button
          type="button"
          className="btn btn-outline-secondary"
          disabled={page + 1 >= pages}
          onClick={() => onPage(page + 1)}
        >
          <Lucide icon="ChevronRight" className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function StatCard({ icon, tone = "text-primary", value, label, hint }) {
  return (
    <div className="box p-5 flex items-center h-full">
      <Lucide icon={icon} className={classnames("w-8 h-8 mr-4 flex-none", tone)} />
      <div className="min-w-0">
        <div className="text-xl font-medium truncate">{value}</div>
        <div className="text-slate-500 text-xs mt-0.5">{label}</div>
        {hint && <div className="text-slate-400 text-xs">{hint}</div>}
      </div>
    </div>
  );
}

/** Fetch every row of a (filtered) query, 1000 at a time. build(from,to) must return a query. */
export async function fetchAll(build, max = 20000) {
  const out = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// ---------------------------------------------------------------------
// Organization (for receipts / invoices)
// ---------------------------------------------------------------------
export function useOrganization() {
  const [org, setOrg] = useState(null);
  useEffect(() => {
    let alive = true;
    supabase
      .from("organizations")
      .select("name, address, city, phone, email, ntn, logo_url")
      .maybeSingle()
      .then(({ data }) => alive && setOrg(data));
    return () => {
      alive = false;
    };
  }, []);
  return org;
}

export const orgAddress = (org) => [org?.address, org?.city].filter(Boolean).join(", ");

// ---------------------------------------------------------------------
// Printing (opens a clean window with the given body HTML)
// ---------------------------------------------------------------------
export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function printHtml(title, body) {
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><title>${esc(title)}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;padding:32px;font-size:13px}
    h1{font-size:20px;margin:0}.muted{color:#64748b;font-size:12px}
    .head{display:flex;justify-content:space-between;border-bottom:1px dashed #94a3b8;padding-bottom:12px;margin-bottom:16px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;margin-bottom:16px}
    .row{display:flex;justify-content:space-between;padding:5px 0}
    .total{border-top:1px solid #cbd5e1;margin-top:6px;padding-top:8px;font-weight:bold;font-size:15px}
    table{width:100%;border-collapse:collapse;margin-top:8px}th,td{text-align:left;border-bottom:1px solid #e2e8f0;padding:6px 4px}
  </style></head><body>${body}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
  return true;
}

export function orgHeaderHtml(org, rightTitle, rightValue) {
  return `<div class="head"><div><h1>${esc(org?.name || "Internet Service Provider")}</h1>
    <div class="muted">${esc(orgAddress(org))}</div>
    <div class="muted">${esc([org?.phone, org?.email].filter(Boolean).join(" | "))}</div></div>
    <div style="text-align:right"><div class="muted">${esc(rightTitle)}</div><div><b>${esc(rightValue)}</b></div></div></div>`;
}

export function OrgLetterhead({ org, title, value }) {
  return (
    <div className="flex items-start justify-between pb-5 border-b border-dashed border-slate-300 dark:border-darkmode-400">
      <div className="flex items-center">
        <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-darkmode-300 flex items-center justify-center mr-3 flex-none">
          <Lucide icon="Wifi" className="w-7 h-7 text-primary" />
        </div>
        <div>
          <div className="text-lg font-medium">{org?.name || "Internet Service Provider"}</div>
          <div className="text-slate-500 text-xs">{orgAddress(org) || "Internet Service Provider"}</div>
          {(org?.phone || org?.email) && (
            <div className="text-slate-500 text-xs">{[org?.phone, org?.email].filter(Boolean).join(" | ")}</div>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className="text-slate-500 text-xs">{title}</div>
        <div className="font-medium">{value}</div>
      </div>
    </div>
  );
}

export function KV({ label, children }) {
  return (
    <div>
      <div className="text-slate-500 text-xs">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );
}

export { money };
