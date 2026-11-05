import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export {
  Modal,
  Pagination,
  ErrorBanner,
  StatCard,
  useToast,
  todayISO,
  addDaysISO,
  likeSafe,
  fetchAll,
} from "@/views/payments/components/shared";

export const EXPENSE_METHODS = ["cash", "bank_transfer", "online", "cheque", "jazzcash", "easypaisa"];

const p2 = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

export function monthRange(offset = 0, span = 1) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + offset + span, 0);
  return { from: iso(from), to: iso(to) };
}

export const thisMonth = () => monthRange(0, 1);

/** Branch list for admins (users pinned to a branch get an empty list). */
export function useBranches(session) {
  const [branches, setBranches] = useState([]);
  useEffect(() => {
    if (!session || session.branchId) return;
    let alive = true;
    supabase
      .from("branches")
      .select("id,name")
      .order("name")
      .then(({ data }) => alive && setBranches(data || []));
    return () => {
      alive = false;
    };
  }, [session]);
  return branches;
}

export function BranchSelect({ branches, value, onChange, allLabel = "All branches" }) {
  if (!branches.length) return null;
  return (
    <select className="form-select box w-44" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{allLabel}</option>
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}

export function downloadCsv(filename, headers, rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DateRange({ from, to, onFrom, onTo }) {
  return (
    <div className="flex items-center gap-2">
      <input type="date" className="form-control box w-40" value={from} onChange={(e) => onFrom(e.target.value)} />
      <span className="text-slate-500">to</span>
      <input type="date" className="form-control box w-40" value={to} onChange={(e) => onTo(e.target.value)} />
    </div>
  );
}

export function Loading() {
  return <div className="box p-8 text-center text-slate-500">Loading...</div>;
}

export function Empty({ text }) {
  return <div className="p-8 text-center text-slate-500">{text}</div>;
}

export const signClass = (n) => (Number(n) < 0 ? "text-danger" : "text-success");
