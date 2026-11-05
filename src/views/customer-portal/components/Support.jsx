import { Lucide } from "@/base-components";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDate, titleCase } from "@/lib/format";
import { Badge, Modal, ErrorBanner, Pagination, Spinner, Empty } from "./ui.jsx";

const FALLBACK = ["Internet down", "Slow speed", "Billing question", "Router problem", "Change package", "Other"];

function NewRequest({ subscriberId, onClose, onSaved }) {
  const [cats, setCats] = useState(FALLBACK);
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("medium");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase
      .from("ticket_categories")
      .select("name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        const names = (data || []).map((c) => c.name);
        if (names.length) setCats(names);
      });
  }, []);
  useEffect(() => {
    if (!category && cats.length) setCategory(cats[0]);
  }, [cats, category]);

  const save = async () => {
    if (!description.trim()) return setError("Please describe your problem or request.");
    if (!subscriberId) return setError("Your account is not linked to a customer record.");
    setSaving(true);
    setError("");
    const { error: e } = await supabase
      .from("tickets")
      .insert({ subscriber_id: subscriberId, category, priority, description: description.trim() });
    setSaving(false);
    if (e) return setError(friendlyError(e));
    onSaved();
  };

  return (
    <Modal
      title="New request"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? "Sending..." : "Send request"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <label className="form-label">What is this about?</label>
      <select className="form-select" value={category} onChange={(e) => setCategory(e.target.value)}>
        {cats.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <label className="form-label mt-4">Please tell us more *</label>
      <textarea className="form-control" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe your problem or request" />
      <label className="form-label mt-4">How urgent is it?</label>
      <select className="form-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
        {["low", "medium", "high", "critical"].map((p) => (
          <option key={p} value={p}>
            {titleCase(p)}
          </option>
        ))}
      </select>
    </Modal>
  );
}

export default function Support({ subscriberId }) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, count, error: e } = await supabase
      .from("v_ticket_overview")
      .select("id,ticket_number,category,status,priority,description,resolution_notes,created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (e) setError(friendlyError(e));
    else {
      setError("");
      setRows(data || []);
      setTotal(count || 0);
    }
    setLoading(false);
  }, [page, pageSize]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="flex items-center mb-3">
        <div className="text-slate-500 text-sm">Need help? Send us a request and we will get back to you.</div>
        <button type="button" className="btn btn-primary ml-auto" onClick={() => setCreating(true)}>
          <Lucide icon="Plus" className="w-4 h-4 mr-2" /> New request
        </button>
      </div>
      {notice && <div className="alert alert-success mb-2">{notice}</div>}
      <ErrorBanner message={error} onClose={() => setError("")} />
      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty text="You have no support requests." />
      ) : (
        <div className="space-y-2">
          {rows.map((t) => (
            <div key={t.id} className="box p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">{t.ticket_number}</div>
                <Badge value={t.status} />
              </div>
              <div className="text-sm mt-1">{titleCase(t.category)}</div>
              {t.description && <div className="text-sm text-slate-500 mt-1 whitespace-pre-line">{t.description}</div>}
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
                <Badge value={t.priority} /> <span>Sent {formatDate(t.created_at)}</span>
              </div>
              {["resolved", "closed"].includes(t.status) && t.resolution_notes && (
                <div className="mt-3 p-3 rounded-md bg-success/10 text-sm">
                  <div className="font-medium text-success mb-1">Our reply</div>
                  <div className="whitespace-pre-line">{t.resolution_notes}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(0); }} />
      {creating && (
        <NewRequest
          subscriberId={subscriberId}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            setNotice("Your request has been sent. We will contact you soon.");
            setPage(0);
            load();
          }}
        />
      )}
    </div>
  );
}
