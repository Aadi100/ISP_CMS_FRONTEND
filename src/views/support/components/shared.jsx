import classnames from "classnames";
import { titleCase } from "@/lib/format";

export const CATEGORY_OPTIONS = [
  "Internet Down",
  "Slow Speed",
  "No Connectivity",
  "Fiber Cut",
  "Router Issue",
  "ONU Issue",
  "WiFi Problem",
  "Billing Issue",
  "Package Upgrade",
  "Package Downgrade",
  "New Installation",
  "Other",
];

export const PRIORITY_OPTIONS = ["low", "medium", "high", "critical"];

export const STATUS_OPTIONS = [
  "open",
  "assigned",
  "in_progress",
  "waiting_for_customer",
  "resolved",
  "closed",
];

const PRIORITY_BADGE_CLASSES = {
  low: "bg-slate-200 text-slate-500 dark:bg-darkmode-300",
  medium: "bg-warning/20 text-warning",
  high: "bg-danger/20 text-danger",
  critical: "bg-danger text-white",
};

const STATUS_BADGE_CLASSES = {
  open: "bg-pending/20 text-pending",
  assigned: "bg-primary/20 text-primary",
  in_progress: "bg-warning/20 text-warning",
  waiting_for_customer: "bg-slate-200 text-slate-500 dark:bg-darkmode-300",
  resolved: "bg-success/20 text-success",
  closed: "bg-slate-300 text-slate-600 dark:bg-darkmode-400 dark:text-slate-300",
};

const BASE_BADGE = "py-1 px-2 rounded-full text-xs font-medium inline-block whitespace-nowrap";

export function formatMinutes(mins) {
  const m = Math.max(0, Math.round(mins));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${mm}m`;
  return `${mm}m`;
}

export function isSlaBreached(t) {
  return Boolean(t.sla_breached_at || t.resolution_breached);
}

export function SlaBadge({ ticket: t }) {
  if (t.status === "resolved" || t.status === "closed") {
    return (
      <div className={classnames(BASE_BADGE, "bg-slate-200 text-slate-500 dark:bg-darkmode-300")}>
        {isSlaBreached(t) ? "Was breached" : "Done"}
      </div>
    );
  }
  if (isSlaBreached(t)) {
    const lvl = Number(t.escalation_level || 0);
    return (
      <div className={classnames(BASE_BADGE, "bg-danger text-white")}>
        {lvl > 0 ? `Breached · Escalated x${lvl}` : "Breached"}
      </div>
    );
  }
  if (t.minutes_to_resolution_due === null || t.minutes_to_resolution_due === undefined) {
    return <span className="text-slate-400 text-xs">No SLA</span>;
  }
  const left = Number(t.minutes_to_resolution_due);
  const total = (new Date(t.resolution_due_at) - new Date(t.created_at)) / 60000;
  const low = total > 0 && left < total * 0.25;
  return (
    <div className={classnames(BASE_BADGE, low ? "bg-warning/20 text-warning" : "bg-success/20 text-success")}>
      On track · {formatMinutes(left)} left
    </div>
  );
}

export function PriorityBadge({ priority }) {
  return (
    <div
      className={classnames(
        "py-1 px-2 rounded-full text-xs font-medium inline-block whitespace-nowrap",
        PRIORITY_BADGE_CLASSES[priority]
      )}
    >
      {titleCase(priority)}
    </div>
  );
}

export function TicketStatusBadge({ status }) {
  return (
    <div
      className={classnames(
        "py-1 px-2 rounded-full text-xs font-medium inline-block whitespace-nowrap",
        STATUS_BADGE_CLASSES[status]
      )}
    >
      {titleCase(status)}
    </div>
  );
}
