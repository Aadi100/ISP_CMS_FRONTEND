import classnames from "classnames";
import { titleCase } from "@/lib/format";

export { Modal, ErrorBanner, Pagination, esc, printHtml, orgHeaderHtml } from "@/views/payments/components/shared.jsx";

const BADGE = "py-1 px-2.5 rounded-full text-xs font-medium inline-block whitespace-nowrap";

const TONES = {
  paid: "bg-success/20 text-success",
  confirmed: "bg-success/20 text-success",
  active: "bg-success/20 text-success",
  resolved: "bg-success/20 text-success",
  closed: "bg-slate-200 text-slate-500",
  unpaid: "bg-pending/20 text-pending",
  pending: "bg-pending/20 text-pending",
  open: "bg-pending/20 text-pending",
  partial: "bg-warning/20 text-warning",
  suspended: "bg-warning/20 text-warning",
  in_progress: "bg-warning/20 text-warning",
  assigned: "bg-primary/20 text-primary",
  waiting_for_customer: "bg-warning/20 text-warning",
  overdue: "bg-danger/20 text-danger",
  terminated: "bg-danger/20 text-danger",
  rejected: "bg-danger/20 text-danger",
  refunded: "bg-slate-200 text-slate-500",
  critical: "bg-danger/20 text-danger",
  high: "bg-warning/20 text-warning",
  medium: "bg-primary/20 text-primary",
  low: "bg-slate-200 text-slate-500",
};

export function Badge({ value }) {
  return <span className={classnames(BADGE, TONES[value] || "bg-slate-200 text-slate-500")}>{titleCase(value)}</span>;
}

export function Spinner({ text = "Loading..." }) {
  return <div className="box p-8 text-center text-slate-500">{text}</div>;
}

export function Empty({ text }) {
  return <div className="box p-8 text-center text-slate-500">{text}</div>;
}

export const dateOnly = (v) => {
  if (!v) return "-";
  return String(v).length === 10 ? `${v}T00:00:00` : v;
};

export const periodText = (inv, formatDate) => {
  const a = inv.billing_month ? formatDate(inv.billing_month) : "";
  const b = inv.period_end ? formatDate(inv.period_end) : "";
  return b ? `${a} - ${b}` : a;
};

export const ordinal = (n) => {
  const v = Number(n);
  if (!v) return "";
  const s = ["th", "st", "nd", "rd"];
  const m = v % 100;
  return v + (s[(m - 20) % 10] || s[m] || s[0]);
};

export const methodText = (m) => (m === "advance_credit" ? "Advance credit" : titleCase(m));
