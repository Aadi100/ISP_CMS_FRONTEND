import { Lucide } from "@/base-components";
import classnames from "classnames";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { titleCase } from "@/lib/format";

export const PAGE_SIZES = [10, 25];

export const EQUIPMENT_TYPES = [
  "ONU",
  "Router",
  "Fiber Cable",
  "Fiber Box",
  "Splitter",
  "Switch",
  "Access Point",
  "Power Adapter",
  "Network Cable",
  "Other",
];

export const EQUIPMENT_STATUSES = [
  "available",
  "assigned",
  "in_stock",
  "under_maintenance",
  "damaged",
  "lost",
];

export const BADGE = {
  available: "bg-success/20 text-success",
  assigned: "bg-primary/20 text-primary",
  in_stock: "bg-pending/20 text-pending",
  under_maintenance: "bg-warning/20 text-warning",
  damaged: "bg-danger/20 text-danger",
  lost: "bg-slate-300 text-slate-600 dark:bg-darkmode-400 dark:text-slate-300",
  planned: "bg-pending/20 text-pending",
  in_progress: "bg-warning/20 text-warning",
  completed: "bg-success/20 text-success",
  cancelled: "bg-slate-300 text-slate-600 dark:bg-darkmode-400 dark:text-slate-300",
  active: "bg-success/20 text-success",
  inactive: "bg-slate-200 text-slate-500 dark:bg-darkmode-300",
};

export function StatusBadge({ value }) {
  return (
    <div
      className={classnames(
        "py-1 px-2 rounded-full text-xs font-medium inline-block whitespace-nowrap",
        BADGE[value]
      )}
    >
      {titleCase(value)}
    </div>
  );
}

export function LowBadge() {
  return (
    <div className="py-0.5 px-2 rounded-full text-[10px] font-medium inline-block whitespace-nowrap bg-danger/20 text-danger ml-2">
      Low Stock
    </div>
  );
}

/** strip characters that would break a PostgREST or() filter */
export const clean = (q) => String(q ?? "").replace(/[,()%*\\]/g, " ").trim();

export const nullIfEmpty = (v) => {
  const s = typeof v === "string" ? v.trim() : v;
  return s === "" || s === undefined ? null : s;
};

export const qty = (n) => Number(n ?? 0).toLocaleString("en-PK", { maximumFractionDigits: 2 });

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ErrorBanner({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="box p-3 px-4 bg-danger/10 text-danger text-sm flex items-start">
      <Lucide icon="AlertCircle" className="w-4 h-4 mr-2 mt-0.5 flex-none" />
      <div className="flex-1 whitespace-pre-wrap">{message}</div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Dismiss">
          <Lucide icon="X" className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function SuccessBanner({ message }) {
  if (!message) return null;
  return (
    <div className="box p-3 px-4 bg-success/10 text-success text-sm flex items-center">
      <Lucide icon="CheckCircle2" className="w-4 h-4 mr-2 flex-none" />
      {message}
    </div>
  );
}

export function Spinner({ label = "Loading..." }) {
  return <div className="box p-10 text-center text-slate-500 text-sm">{label}</div>;
}

export function Empty({ text, icon = "Package", children }) {
  return (
    <div className="box p-10 flex flex-col items-center justify-center text-center">
      <Lucide icon={icon} className="w-12 h-12 text-slate-300 mb-3" />
      <div className="text-slate-500 mb-4">{text}</div>
      {children}
    </div>
  );
}

export function Field({ label, children, className = "col-span-12 sm:col-span-6", hint }) {
  return (
    <div className={className}>
      <label className="text-xs text-slate-500">{label}</label>
      <div className="mt-1">{children}</div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, size = "max-w-lg" }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
      <div className={classnames("relative box w-full p-6 max-h-[90vh] overflow-y-auto", size)}>
        <div className="flex items-center mb-5">
          <h2 className="text-lg font-medium">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-slate-500 hover:text-slate-700"
            aria-label="Close"
          >
            <Lucide icon="X" className="w-5 h-5" />
          </button>
        </div>
        {children}
        {footer && <div className="flex justify-end gap-2 mt-6">{footer}</div>}
      </div>
    </div>
  );
}

export function KV({ label, children }) {
  return (
    <div>
      <div className="text-slate-500 text-xs">{label}</div>
      <div className="font-medium break-words">{children || "—"}</div>
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage, onPageSize }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex flex-wrap items-center gap-3 mt-4 text-sm text-slate-500">
      <div>
        {from}-{to} of {total}
      </div>
      <div className="flex items-center gap-2 sm:ml-auto">
        <select
          className="form-select box w-20"
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-outline-secondary"
          disabled={page <= 0}
          onClick={() => onPage(page - 1)}
        >
          Previous
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
          Next
        </button>
      </div>
    </div>
  );
}

export function SearchBox({ value, onChange, onSubmit, placeholder }) {
  return (
    <div className="relative text-slate-500">
      <Lucide icon="Search" className="w-5 h-5 z-10 absolute my-auto inset-y-0 ml-4 left-0" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
        }}
        className="form-control w-full box pl-12 py-3 text-base"
        placeholder={placeholder}
      />
    </div>
  );
}

export function BranchSelect({ branches, value, onChange, allLabel = "All Branches", className = "form-select box mt-1 w-full" }) {
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{allLabel}</option>
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}

/** Searchable subscriber picker. onChange receives the full subscriber row or null. */
export function SubscriberSelect({ value, onChange, disabled }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const debounced = useDebounced(text, 300);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    (async () => {
      setBusy(true);
      let q = supabase
        .from("subscribers")
        .select("id, subscriber_code, full_name, phone, address, installation_location, connection_status")
        .order("full_name")
        .limit(20);
      const s = clean(debounced);
      if (s) q = q.or(`full_name.ilike.%${s}%,subscriber_code.ilike.%${s}%,phone.ilike.%${s}%`);
      const { data, error } = await q;
      if (cancelled) return;
      setBusy(false);
      if (error) setErr(friendlyError(error));
      else {
        setErr("");
        setRows(data || []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  useEffect(() => {
    const h = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  if (value) {
    return (
      <div className="flex items-center form-control box">
        <div className="flex-1 truncate text-sm">
          <span className="font-medium">{value.full_name}</span>
          <span className="text-slate-500"> · {value.subscriber_code} · {value.phone}</span>
        </div>
        {!disabled && (
          <button type="button" onClick={() => onChange(null)} aria-label="Clear" className="ml-2 text-slate-500">
            <Lucide icon="X" className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={box}>
      <input
        type="text"
        className="form-control box w-full"
        placeholder="Search customer by name, ID or phone"
        value={text}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
      />
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 box shadow-lg max-h-60 overflow-y-auto">
          {busy && <div className="p-3 text-sm text-slate-500">Searching...</div>}
          {err && <div className="p-3 text-sm text-danger">{err}</div>}
          {!busy && !err && rows.length === 0 && (
            <div className="p-3 text-sm text-slate-500">No customers found.</div>
          )}
          {rows.map((r) => (
            <button
              type="button"
              key={r.id}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-darkmode-400"
              onClick={() => {
                onChange(r);
                setOpen(false);
                setText("");
              }}
            >
              <span className="font-medium">{r.full_name}</span>
              <span className="text-slate-500">
                {" "}· {r.subscriber_code} · {r.phone} · {titleCase(r.connection_status)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Technician select: Field/technician staff first, then everyone else. */
export function TechnicianSelect({ employees, value, onChange, className = "form-select box w-full", allLabel = "— None —" }) {
  const isField = (e) => /field|tech|install|network/i.test(e.department || "");
  const field = employees.filter(isField);
  const others = employees.filter((e) => !isField(e));
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{allLabel}</option>
      {field.length > 0 && (
        <optgroup label="Field / Technical">
          {field.map((e) => (
            <option key={e.id} value={e.id}>
              {e.full_name}
              {e.department ? ` (${e.department})` : ""}
            </option>
          ))}
        </optgroup>
      )}
      {others.length > 0 && (
        <optgroup label="Other employees">
          {others.map((e) => (
            <option key={e.id} value={e.id}>
              {e.full_name}
              {e.department ? ` (${e.department})` : ""}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

export function downloadCsv(filename, columns, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [columns.map((c) => esc(c.label)).join(",")]
    .concat(rows.map((r) => columns.map((c) => esc(c.get(r))).join(",")))
    .join("\n");
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const MOVE_LABELS = { transfer_in: "Transfer in", transfer_out: "Transfer out" };
export const moveLabel = (t) => MOVE_LABELS[t] || titleCase(t);
