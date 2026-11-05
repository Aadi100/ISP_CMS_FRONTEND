import { useEffect, useState } from "react";
import classnames from "classnames";
import { supabase } from "@/lib/supabase";
import { titleCase } from "@/lib/format";

export { Modal, ErrorBanner, Pagination, useToast, todayISO, useOrganization, printHtml, esc, orgHeaderHtml } from "@/views/payments/components/shared";

/** Active employees for selects. */
export function useEmployees() {
  const [employees, setEmployees] = useState([]);
  useEffect(() => {
    let alive = true;
    supabase
      .from("employees")
      .select("id, full_name, employee_code, department")
      .neq("employment_status", "resigned")
      .order("full_name")
      .limit(1000)
      .then(({ data }) => alive && setEmployees(data || []));
    return () => {
      alive = false;
    };
  }, []);
  return employees;
}

const BADGE = "py-1 px-2 rounded-full text-xs font-medium inline-block whitespace-nowrap";
const TONES = {
  present: "bg-success/20 text-success",
  approved: "bg-success/20 text-success",
  paid: "bg-success/20 text-success",
  completed: "bg-success/20 text-success",
  late: "bg-warning/20 text-warning",
  half_day: "bg-warning/20 text-warning",
  pending: "bg-pending/20 text-pending",
  draft: "bg-pending/20 text-pending",
  planned: "bg-pending/20 text-pending",
  absent: "bg-danger/20 text-danger",
  rejected: "bg-danger/20 text-danger",
  in_progress: "bg-primary/20 text-primary",
  open: "bg-primary/20 text-primary",
};
export function StatusBadge({ status }) {
  return <span className={classnames(BADGE, TONES[status] || "bg-slate-200 text-slate-500")}>{titleCase(status)}</span>;
}

export const monthStart = (iso) => `${String(iso).slice(0, 7)}-01`;
export const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
export const monthLabel = (iso) =>
  new Date(`${String(iso).slice(0, 7)}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

/** Inclusive number of days between two ISO dates. */
export const daysBetween = (from, to) => {
  if (!from || !to) return 0;
  const ms = new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`);
  return Math.max(0, Math.round(ms / 86400000) + 1);
};

export function EmployeeSelect({ employees, value, onChange, allLabel, className = "form-select", disabled }) {
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {allLabel !== undefined && <option value="">{allLabel}</option>}
      {!allLabel && allLabel !== "" && <option value="">Select employee</option>}
      {employees.map((e) => (
        <option key={e.id} value={e.id}>
          {e.full_name}
          {e.employee_code ? ` (${e.employee_code})` : ""}
        </option>
      ))}
    </select>
  );
}

export function Empty({ children }) {
  return <div className="text-center text-slate-500 py-10 text-sm">{children}</div>;
}

export function Loading() {
  return <div className="text-center text-slate-500 py-10 text-sm">Loading...</div>;
}
