import { useEffect, useState } from "react";
import { Lucide } from "@/base-components";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, formatDate, titleCase } from "@/lib/format";
import { Modal, Pagination, ErrorBanner, PoBadge, fetchAll, likeSafe } from "./common";

const EMPTY = { name: "", contact_person: "", phone: "", email: "", address: "", notes: "", status: "active" };

function SupplierForm({ supplier, onClose, onSaved }) {
  const [f, setF] = useState(supplier ? { ...EMPTY, ...supplier } : EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.name.trim()) return setError("Name is required.");
    setSaving(true);
    setError("");
    const row = {
      name: f.name.trim(),
      contact_person: f.contact_person?.trim() || null,
      phone: f.phone?.trim() || null,
      email: f.email?.trim() || null,
      address: f.address?.trim() || null,
      notes: f.notes?.trim() || null,
      status: f.status,
    };
    const { error: e } = supplier
      ? await supabase.from("suppliers").update(row).eq("id", supplier.id)
      : await supabase.from("suppliers").insert(row);
    setSaving(false);
    if (e) return setError(friendlyError(e));
    onSaved();
  };

  return (
    <Modal
      title={supplier ? `Edit ${supplier.supplier_code}` : "New supplier"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="form-label">Name *</label>
          <input className="form-control" value={f.name} onChange={set("name")} />
        </div>
        <div>
          <label className="form-label">Contact person</label>
          <input className="form-control" value={f.contact_person || ""} onChange={set("contact_person")} />
        </div>
        <div>
          <label className="form-label">Phone</label>
          <input className="form-control" value={f.phone || ""} onChange={set("phone")} />
        </div>
        <div>
          <label className="form-label">Email</label>
          <input type="email" className="form-control" value={f.email || ""} onChange={set("email")} />
        </div>
        <div>
          <label className="form-label">Status</label>
          <select className="form-select" value={f.status} onChange={set("status")}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="form-label">Address</label>
          <input className="form-control" value={f.address || ""} onChange={set("address")} />
        </div>
        <div className="col-span-2">
          <label className="form-label">Notes</label>
          <textarea className="form-control" rows={2} value={f.notes || ""} onChange={set("notes")} />
        </div>
      </div>
    </Modal>
  );
}

function History({ supplier, onClose, onOpen }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    supabase
      .from("v_purchase_overview")
      .select("id,po_number,order_date,status,total,paid_amount,balance_due")
      .eq("supplier_id", supplier.id)
      .order("order_date", { ascending: false })
      .limit(200)
      .then(({ data, error: e }) => (e ? setError(friendlyError(e)) : setRows(data || [])));
  }, [supplier.id]);
  return (
    <Modal wide title={`Order history - ${supplier.name}`} onClose={onClose}>
      <ErrorBanner message={error} />
      {rows === null && !error && <div className="text-slate-500">Loading…</div>}
      {rows && rows.length === 0 && <div className="text-slate-500">No orders for this supplier yet.</div>}
      {rows && rows.length > 0 && (
        <table className="table table-bordered text-sm">
          <thead>
            <tr>
              <th>PO</th>
              <th>Date</th>
              <th>Status</th>
              <th className="text-right">Total</th>
              <th className="text-right">Paid</th>
              <th className="text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="cursor-pointer" onClick={() => { onClose(); onOpen(r.id); }}>
                <td className="text-primary font-medium">{r.po_number}</td>
                <td>{formatDate(r.order_date)}</td>
                <td>
                  <PoBadge status={r.status} />
                </td>
                <td className="text-right">{money(r.total)}</td>
                <td className="text-right">{money(r.paid_amount)}</td>
                <td className="text-right">{money(r.balance_due)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

export default function SuppliersTab({ perms, refreshKey, onChanged, onOpen, toast }) {
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null); // {} new or supplier
  const [history, setHistory] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search);
      setPage(0);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      let query = supabase
        .from("suppliers")
        .select("*", { count: "exact" })
        .order("name")
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (status) query = query.eq("status", status);
      const s = likeSafe(q);
      if (s) query = query.or(`name.ilike.%${s}%,supplier_code.ilike.%${s}%,contact_person.ilike.%${s}%,phone.ilike.%${s}%`);
      const { data, count, error: e } = await query;
      if (!alive) return;
      setLoading(false);
      if (e) return setError(friendlyError(e));
      setError("");
      setRows(data || []);
      setTotal(count || 0);
      try {
        const po = await fetchAll((from, to) =>
          supabase.from("v_purchase_overview").select("supplier_id,total,paid_amount").neq("status", "cancelled").range(from, to)
        );
        if (!alive) return;
        const agg = {};
        po.forEach((r) => {
          const a = (agg[r.supplier_id] ||= { ordered: 0, paid: 0 });
          a.ordered += Number(r.total || 0);
          a.paid += Number(r.paid_amount || 0);
        });
        setTotals(agg);
      } catch (err) {
        if (alive) setError(friendlyError(err));
      }
    })();
    return () => {
      alive = false;
    };
  }, [page, pageSize, q, status, refreshKey]);

  const remove = async (s) => {
    if (!window.confirm(`Delete supplier ${s.name}?`)) return;
    const { data, error: e } = await supabase.from("suppliers").delete().eq("id", s.id).select("id");
    if (e) return setError(friendlyError(e));
    if (!data || data.length === 0) return setError("This supplier could not be deleted.");
    toast.show("Supplier deleted.");
    onChanged();
  };

  return (
    <div className="intro-y">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {perms.create && (
          <button type="button" className="btn btn-primary shadow-md mr-2" onClick={() => setForm({})}>
            <Lucide icon="Plus" className="w-4 h-4 mr-2" /> New supplier
          </button>
        )}
        <select className="form-select box w-36" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <input className="form-control box w-56 ml-auto" placeholder="Search suppliers…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <ErrorBanner message={error} onClose={() => setError("")} />
      <div className="box overflow-x-auto">
        <table className="table table-report -mt-2">
          <thead>
            <tr>
              <th>Code</th>
              <th>Supplier</th>
              <th>Contact</th>
              <th>Phone</th>
              <th className="text-center">Status</th>
              <th className="text-right">Ordered</th>
              <th className="text-right">Paid</th>
              <th className="text-right">Balance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const a = totals[s.id] || { ordered: 0, paid: 0 };
              return (
                <tr key={s.id} className="intro-x">
                  <td className="whitespace-nowrap">{s.supplier_code}</td>
                  <td>
                    <button type="button" className="font-medium text-primary text-left" onClick={() => setHistory(s)}>
                      {s.name}
                    </button>
                    {s.email && <div className="text-xs text-slate-500">{s.email}</div>}
                  </td>
                  <td>{s.contact_person || "—"}</td>
                  <td className="whitespace-nowrap">{s.phone || "—"}</td>
                  <td className="text-center">
                    <div
                      className={`py-1 px-2 rounded-full text-xs font-medium inline-block ${
                        s.status === "active" ? "bg-success/20 text-success" : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {titleCase(s.status)}
                    </div>
                  </td>
                  <td className="text-right whitespace-nowrap">{money(a.ordered)}</td>
                  <td className="text-right whitespace-nowrap">{money(a.paid)}</td>
                  <td className="text-right whitespace-nowrap">{money(a.ordered - a.paid)}</td>
                  <td className="whitespace-nowrap text-right">
                    <button type="button" className="mr-3 text-slate-500" title="Order history" onClick={() => setHistory(s)}>
                      <Lucide icon="List" className="w-4 h-4" />
                    </button>
                    {perms.edit && (
                      <button type="button" className="mr-3 text-primary" title="Edit" onClick={() => setForm(s)}>
                        <Lucide icon="Edit" className="w-4 h-4" />
                      </button>
                    )}
                    {perms.del && (
                      <button type="button" className="text-danger" title="Delete" onClick={() => remove(s)}>
                        <Lucide icon="Trash2" className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-slate-500 py-8">
                  No suppliers found.
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
      {form && (
        <SupplierForm
          supplier={form.id ? form : null}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            toast.show("Supplier saved.");
            onChanged();
          }}
        />
      )}
      {history && <History supplier={history} onClose={() => setHistory(null)} onOpen={onOpen} />}
    </div>
  );
}
