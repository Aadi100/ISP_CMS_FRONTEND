import { useEffect, useState } from "react";
import classnames from "classnames";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDate, titleCase } from "@/lib/format";
import { ErrorBanner, Modal, Pagination } from "@/views/payments/components/shared";

const PRIORITIES = ["low", "medium", "high", "critical"];
const FALLBACK_CATEGORIES = ["no_internet", "slow_speed", "billing", "other"];
const PRIO_TONE = {
  low: "bg-slate-200 text-slate-500",
  medium: "bg-primary/20 text-primary",
  high: "bg-warning/20 text-warning",
  critical: "bg-danger/20 text-danger",
};

function NewTicket({ onClose, onDone }) {
  const [customers, setCustomers] = useState([]);
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES);
  const [f, setF] = useState({ subscriber_id: "", category: "", priority: "medium", description: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    supabase
      .from("subscribers")
      .select("id, full_name, subscriber_code")
      .order("full_name")
      .limit(1000)
      .then(({ data, error: err }) => (err ? setError(friendlyError(err)) : setCustomers(data || [])));
    supabase
      .from("ticket_categories")
      .select("name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        if (data && data.length) {
          const names = data.map((c) => c.name);
          setCategories(names);
          setF((p) => ({ ...p, category: p.category || names[0] }));
        } else setF((p) => ({ ...p, category: p.category || FALLBACK_CATEGORIES[0] }));
      });
  }, []);

  const submit = async () => {
    if (!f.subscriber_id) return setError("Select a customer.");
    if (!f.description.trim()) return setError("Describe the problem.");
    setSaving(true);
    setError("");
    const { error: err } = await supabase.from("tickets").insert({
      subscriber_id: f.subscriber_id,
      category: f.category || "other",
      priority: f.priority,
      description: f.description.trim(),
    });
    setSaving(false);
    if (err) return setError(friendlyError(err));
    onDone();
  };

  return (
    <Modal
      title="New ticket"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={submit}>
            {saving ? "Saving..." : "Create ticket"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="form-label">Customer</label>
          <select className="form-select" value={f.subscriber_id} onChange={set("subscriber_id")}>
            <option value="">Select customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name} ({c.subscriber_code})</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label">Category</label>
            <select className="form-select" value={f.category} onChange={set("category")}>
              {categories.map((c) => (
                <option key={c} value={c}>{titleCase(c)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Priority</label>
            <select className="form-select" value={f.priority} onChange={set("priority")}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{titleCase(p)}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="form-label">Description</label>
          <textarea className="form-control" rows={4} value={f.description} onChange={set("description")} />
        </div>
      </div>
    </Modal>
  );
}

export default function Support() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    supabase
      .from("v_ticket_overview")
      .select("id, ticket_number, subscriber_name, category, priority, status, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1)
      .then(({ data, count, error: err }) => {
        if (!alive) return;
        if (err) setError(friendlyError(err));
        else {
          setError("");
          setRows(data || []);
          setTotal(count || 0);
        }
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [page, pageSize, tick]);

  return (
    <div>
      <div className="flex items-center mb-4">
        <h2 className="text-lg font-medium">My tickets</h2>
        <button type="button" className="btn btn-primary ml-auto" onClick={() => setOpen(true)}>
          New ticket
        </button>
      </div>
      <ErrorBanner message={error} onClose={() => setError("")} />
      <div className="box overflow-x-auto">
        <table className="table table-report">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Customer</th>
              <th>Category</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="text-center text-slate-500 py-6">Loading...</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="text-center text-slate-500 py-6">No tickets yet.</td></tr>
            )}
            {!loading &&
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap font-medium">{r.ticket_number}</td>
                  <td className="whitespace-nowrap">{r.subscriber_name || "-"}</td>
                  <td className="whitespace-nowrap">{titleCase(r.category)}</td>
                  <td>
                    <span className={classnames("py-1 px-2 rounded-full text-xs font-medium", PRIO_TONE[r.priority])}>
                      {titleCase(r.priority)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">{titleCase(r.status)}</td>
                  <td className="whitespace-nowrap">{formatDate(r.created_at)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPage={setPage}
        onPageSize={(n) => {
          setPageSize(n);
          setPage(0);
        }}
      />
      {open && (
        <NewTicket
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            setPage(0);
            setTick((t) => t + 1);
          }}
        />
      )}
    </div>
  );
}
