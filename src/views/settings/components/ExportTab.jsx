import { Lucide } from "@/base-components";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";

const DATASETS = [
  ["subscribers", "Subscribers"],
  ["invoices", "Invoices"],
  ["payments", "Payments"],
  ["refunds", "Refunds"],
  ["tickets", "Tickets"],
  ["equipment", "Equipment"],
  ["stock_items", "Stock items"],
  ["employees", "Employees (no salary)"],
  ["branches", "Branches"],
  ["areas", "Areas"],
  ["packages", "Packages"],
  ["resellers", "Resellers"],
];
const CHUNK = 1000;

const cell = (v) => {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function toCsv(rows) {
  const cols = [];
  rows.forEach((r) => Object.keys(r).forEach((k) => !cols.includes(k) && cols.push(k)));
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
}

function ExportTab({ canEdit }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const run = async (table, title) => {
    setBusy(table);
    setError("");
    setMsg("");
    try {
      const all = [];
      for (let from = 0; ; from += CHUNK) {
        const { data, error: err } = await supabase
          .from(table)
          .select("*")
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + CHUNK - 1);
        if (err) throw err;
        all.push(...(data || []));
        if (!data || data.length < CHUNK) break;
      }
      if (all.length === 0) {
        setMsg(`${title}: nothing to export.`);
        return;
      }
      const blob = new Blob(["﻿" + toCsv(all)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${table}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMsg(`${title}: ${all.length} row(s) exported.`);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="intro-y box p-5">
      <div className="text-base font-medium mb-2">Data export</div>
      <div className="text-slate-500 text-sm mb-4">
        Download your ISP's data as CSV files. Platform-level database backups are managed by the platform owner.
      </div>
      {!canEdit && <div className="alert alert-danger show mb-3 text-sm">You do not have permission to export data.</div>}
      {error && <div className="alert alert-danger show mb-3 text-sm">{error}</div>}
      {msg && <div className="mb-3 text-sm text-success">{msg}</div>}
      <div className="grid grid-cols-12 gap-3">
        {DATASETS.map(([table, title]) => (
          <div key={table} className="col-span-12 sm:col-span-6 lg:col-span-4">
            <button
              type="button"
              className="btn btn-outline-secondary w-full justify-start"
              disabled={!canEdit || !!busy}
              onClick={() => run(table, title)}
            >
              <Lucide icon="Download" className="w-4 h-4 mr-2" />
              {busy === table ? "Exporting..." : title}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ExportTab;
