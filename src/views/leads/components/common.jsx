import classnames from "classnames";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { titleCase } from "@/lib/format";

export const STAGES = ["new", "contacted", "feasibility", "survey_scheduled", "survey_done", "quoted", "won", "lost"];
export const SOURCES = ["walk_in", "referral", "facebook", "website", "agent", "call", "other"];
export const FEASIBILITY = ["unknown", "feasible", "not_feasible"];

export const STAGE_TONE = {
  new: "bg-slate-200 text-slate-600 dark:bg-darkmode-300",
  contacted: "bg-primary/20 text-primary",
  feasibility: "bg-pending/20 text-pending",
  survey_scheduled: "bg-warning/20 text-warning",
  survey_done: "bg-warning/20 text-warning",
  quoted: "bg-primary/20 text-primary",
  won: "bg-success/20 text-success",
  lost: "bg-danger/20 text-danger",
};

export const LEAD_COLS =
  "id,lead_code,full_name,phone,email,address,area_id,package_id,source,stage,feasibility,assigned_to,quoted_monthly_fee,quoted_installation_fee,follow_up_at,notes,lost_reason,converted_subscriber_id,created_at,updated_at,area_name,package_name,assigned_name,activities_count,follow_up_overdue,converted_code";

export const likeSafe = (s) => String(s).replace(/[,()%*\\]/g, " ").trim();

/** ISO timestamp -> value for <input type="datetime-local"> (local time) */
export function toLocalInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

export function StageBadge({ stage }) {
  return (
    <span className={classnames("py-1 px-2 rounded-full text-xs font-medium whitespace-nowrap", STAGE_TONE[stage])}>
      {titleCase(stage)}
    </span>
  );
}

export function ErrorBanner({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="alert alert-danger flex items-center mb-2" role="alert">
      <span className="flex-1 text-sm">{message}</span>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Dismiss" className="ml-2">
          &times;
        </button>
      )}
    </div>
  );
}

/** areas, packages, employees, default installation charge */
export function useLookups() {
  const [data, setData] = useState({ areas: [], packages: [], employees: [], installCharge: 0 });
  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase.from("areas").select("id,name").order("name"),
      supabase.from("packages").select("id,name,monthly_price,status").order("name"),
      supabase.from("employees").select("id,full_name,employment_status").order("full_name"),
      supabase.from("organization_settings").select("installation_charges").maybeSingle(),
    ]).then(([a, p, e, s]) => {
      if (!alive) return;
      setData({
        areas: a.data || [],
        packages: (p.data || []).filter((x) => x.status !== "inactive"),
        employees: (e.data || []).filter((x) => x.employment_status === "active"),
        installCharge: Number(s.data?.installation_charges || 0),
      });
    });
    return () => {
      alive = false;
    };
  }, []);
  return data;
}

export function downloadCsv(name, rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(esc).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
