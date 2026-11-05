import { useEffect, useState } from "react";
import { Lucide } from "@/base-components";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, formatDate, titleCase } from "@/lib/format";
import { PoBadge, PO_STATUSES, Pagination, ErrorBanner, Modal, todayISO, likeSafe } from "./common";

function NewOrderModal({ session, branches, onClose, onCreated }) {
  const [suppliers, setSuppliers] = useState([]);
  const [f, setF] = useState({ supplier_id: "", order_date: todayISO(), expected_date: "", notes: "", branch_id: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase
      .from("suppliers")
      .select("id,name,supplier_code")
      .eq("status", "active")
      .order("name")
      .then(({ data, error: e }) => (e ? setError(friendlyError(e)) : setSuppliers(data || [])));
  }, []);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.supplier_id) return setError("Choose a supplier.");
    setSaving(true);
    setError("");
    const row = {
      supplier_id: f.supplier_id,
      order_date: f.order_date || todayISO(),
      expected_date: f.expected_date || null,
      notes: f.notes.trim() || null,
    };
    if (!session.branchId && f.branch_id) row.branch_id = f.branch_id;
    const { data, error: e } = await supabase.from("purchase_orders").insert(row).select("id").single();
    setSaving(false);
    if (e) return setError(friendlyError(e));
    onCreated(data.id);
  };

  return (
    <Modal
      title="New purchase order"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Create draft"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="form-label">Supplier *</label>
          <select className="form-select" value={f.supplier_id} onChange={set("supplier_id")}>
            <option value="">Select supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.supplier_code} - {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">Order date</label>
          <input type="date" className="form-control" value={f.order_date} onChange={set("order_date")} />
        </div>
        <div>
          <label className="form-label">Expected date</label>
          <input type="date" className="form-control" value={f.expected_date} onChange={set("expected_date")} />
        </div>
        {!session.branchId && branches.length > 0 && (
          <div className="col-span-2">
            <label className="form-label">Branch</label>
            <select className="form-select" value={f.branch_id} onChange={set("branch_id")}>
              <option value="">Default</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="col-span-2">
          <label className="form-label">Notes</label>
          <textarea className="form-control" rows={2} value={f.notes} onChange={set("notes")} />
        </div>
      </div>
    </Modal>
  );
}

export default function OrdersTab({ session, perms, branches, refreshKey, onOpen }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [supplier, setSupplier] = useState("");
  const [branch, setBranch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    supabase
      .from("suppliers")
      .select("id,name")
      .order("name")
      .then(({ data }) => setSuppliers(data || []));
  }, [refreshKey]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      let query = supabase
        .from("v_purchase_overview")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (status) query = query.eq("status", status);
      if (supplier) query = query.eq("supplier_id", supplier);
      if (branch) query = query.eq("branch_id", branch);
      if (from) query = query.gte("order_date", from);
      if (to) query = query.lte("order_date", to);
      const s = likeSafe(q);
      if (s) query = query.or(`po_number.ilike.%${s}%,supplier_name.ilike.%${s}%`);
      const { data, count, error: e } = await query;
      if (!alive) return;
      setLoading(false);
      if (e) return setError(friendlyError(e));
      setError("");
      setRows(data || []);
      setTotal(count || 0);
    })();
    return () => {
      alive = false;
    };
  }, [page, pageSize, q, status, supplier, branch, from, to, refreshKey]);

  const reset = (fn) => (e) => {
    fn(e.target.value);
    setPage(0);
  };

  return (
    <div className="intro-y">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {perms.create && (
          <button type="button" className="btn btn-primary shadow-md mr-2" onClick={() => setShowNew(true)}>
            <Lucide icon="Plus" className="w-4 h-4 mr-2" /> New purchase order
          </button>
        )}
        <select className="form-select box w-36" value={status} onChange={reset(setStatus)}>
          <option value="">All statuses</option>
          {PO_STATUSES.map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </select>
        <select className="form-select box w-44" value={supplier} onChange={reset(setSupplier)}>
          <option value="">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {!session.branchId && branches.length > 0 && (
          <select className="form-select box w-36" value={branch} onChange={reset(setBranch)}>
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <input type="date" className="form-control box w-40" value={from} onChange={reset(setFrom)} title="From" />
        <input type="date" className="form-control box w-40" value={to} onChange={reset(setTo)} title="To" />
        <input
          className="form-control box w-48 ml-auto"
          placeholder="Search PO or supplier…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <ErrorBanner message={error} />
      <div className="box overflow-x-auto">
        <table className="table table-report -mt-2">
          <thead>
            <tr>
              <th className="whitespace-nowrap">PO</th>
              <th className="whitespace-nowrap">Supplier</th>
              <th className="whitespace-nowrap">Date</th>
              <th className="text-center whitespace-nowrap">Status</th>
              <th className="text-right whitespace-nowrap">Total</th>
              <th className="text-right whitespace-nowrap">Paid</th>
              <th className="text-right whitespace-nowrap">Balance due</th>
              <th className="text-center whitespace-nowrap">Lines</th>
              <th className="text-center whitespace-nowrap">Pending qty</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="intro-x cursor-pointer" onClick={() => onOpen(r.id)}>
                <td className="font-medium text-primary whitespace-nowrap">{r.po_number}</td>
                <td>{r.supplier_name}</td>
                <td className="whitespace-nowrap">{formatDate(r.order_date)}</td>
                <td className="text-center">
                  <PoBadge status={r.status} />
                </td>
                <td className="text-right whitespace-nowrap">{money(r.total)}</td>
                <td className="text-right whitespace-nowrap">{money(r.paid_amount)}</td>
                <td className="text-right whitespace-nowrap">{money(r.balance_due)}</td>
                <td className="text-center">{r.lines_count}</td>
                <td className="text-center">{Number(r.qty_pending)}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-slate-500 py-8">
                  No purchase orders found.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={9} className="text-center text-slate-500 py-8">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(0); }} />
      {showNew && (
        <NewOrderModal
          session={session}
          branches={branches}
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            onOpen(id);
          }}
        />
      )}
    </div>
  );
}
