import { Lucide } from "@/base-components";
import classnames from "classnames";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { formatDateTime, titleCase } from "@/lib/format";

const PAGE_SIZE = 10;
const EMPTY_FORM = { title: "", message: "", area_id: "" };

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose}></div>
      <div className="relative box w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center mb-5">
          <h2 className="text-lg font-medium">{title}</h2>
          <button type="button" onClick={onClose} className="ml-auto text-slate-500 hover:text-slate-700" aria-label="Close">
            <Lucide icon="X" className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function OutagesPanel({ session }) {
  const [outages, setOutages] = useState([]);
  const [areas, setAreas] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  // notify modal: { outage, resolved, count }
  const [notify, setNotify] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const canCreate = can(session, "network", "create");
  const canEdit = can(session, "network", "edit");
  const canDelete = can(session, "network", "delete");

  const areaName = (id) => (id ? areas.find((a) => a.id === id)?.name || "Unknown area" : "All areas");

  useEffect(() => {
    supabase
      .from("areas")
      .select("id, name")
      .order("name")
      .then(({ data }) => setAreas(data || []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: err, count } = await supabase
        .from("outages")
        .select("*", { count: "exact" })
        .order("started_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      if (err) throw err;
      setOutages(data || []);
      setTotal(count || 0);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (m) => {
    setBanner(m);
    window.clearTimeout(flash._t);
    flash._t = window.setTimeout(() => setBanner(""), 6000);
  };

  const submit = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      setFormError("Title and customer message are required.");
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const { error: err } = await supabase.from("outages").insert({
        title: form.title.trim(),
        message: form.message.trim(),
        area_id: form.area_id || null,
        status: "open",
      });
      if (err) throw err;
      setFormOpen(false);
      setForm(EMPTY_FORM);
      flash("Outage reported. Use 'Notify customers' to e-mail the affected customers.");
      setPage(1);
      load();
    } catch (e) {
      setFormError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  // How many active customers with an e-mail would be notified
  const countRecipients = async (outage) => {
    let q = supabase
      .from("subscribers")
      .select("id", { count: "exact", head: true })
      .eq("connection_status", "active")
      .not("email", "is", null)
      .neq("email", "");
    if (outage.area_id) q = q.eq("area_id", outage.area_id);
    const { count, error: err } = await q;
    if (err) throw err;
    return count || 0;
  };

  const openNotify = async (outage, resolved) => {
    setError("");
    try {
      const count = await countRecipients(outage);
      setNotify({ outage, resolved, count, result: null });
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const sendNotify = async () => {
    setBusy(true);
    setError("");
    try {
      const { data, error: err } = await supabase.rpc("notify_outage", {
        p_outage_id: notify.outage.id,
        p_resolved: notify.resolved,
      });
      if (err) throw err;
      setNotify((n) => ({ ...n, result: Number(data) || 0 }));
      load();
    } catch (e) {
      setError(friendlyError(e));
      setNotify(null);
    } finally {
      setBusy(false);
    }
  };

  const markResolved = async (outage) => {
    setBusy(true);
    setError("");
    try {
      const { error: err } = await supabase
        .from("outages")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", outage.id);
      if (err) throw err;
      load();
      await openNotify({ ...outage, status: "resolved" }, true);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    setError("");
    try {
      const { error: err } = await supabase.from("outages").delete().eq("id", deleting.id);
      if (err) throw err;
      setDeleting(null);
      flash("Outage deleted.");
      load();
    } catch (e) {
      setError(friendlyError(e));
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 intro-y flex items-center">
        <div className="text-slate-500 text-sm">
          Report service interruptions and e-mail the affected customers.
        </div>
        {canCreate && (
          <button
            type="button"
            className="btn btn-primary shadow-md ml-auto"
            onClick={() => {
              setForm(EMPTY_FORM);
              setFormError("");
              setFormOpen(true);
            }}
          >
            <Lucide icon="Plus" className="w-4 h-4 mr-2" /> Report Outage
          </button>
        )}
      </div>

      {error && (
        <div className="col-span-12 intro-y">
          <div className="box p-3 px-4 bg-danger/10 text-danger text-sm flex items-center">
            <Lucide icon="AlertCircle" className="w-4 h-4 mr-2 flex-none" />
            {error}
          </div>
        </div>
      )}
      {banner && (
        <div className="col-span-12 intro-y">
          <div className="box p-3 px-4 bg-success/10 text-success text-sm flex items-center">
            <Lucide icon="CheckCircle2" className="w-4 h-4 mr-2 flex-none" />
            {banner}
          </div>
        </div>
      )}

      <div className="col-span-12">
        {loading ? (
          <div className="intro-y box p-10 text-center text-slate-500">Loading outages...</div>
        ) : outages.length === 0 ? (
          <div className="intro-y box p-10 flex flex-col items-center text-center">
            <Lucide icon="Wifi" className="w-12 h-12 text-slate-300 mb-3" />
            <div className="text-slate-500">No outages reported.</div>
          </div>
        ) : (
          <div className="intro-y w-full overflow-x-auto">
            <table className="table table-report w-full min-w-[1100px]">
              <thead>
                <tr>
                  <th className="whitespace-nowrap">TITLE</th>
                  <th className="whitespace-nowrap">AREA</th>
                  <th className="text-center whitespace-nowrap">STATUS</th>
                  <th className="whitespace-nowrap">STARTED</th>
                  <th className="whitespace-nowrap">RESOLVED</th>
                  <th className="text-center whitespace-nowrap">NOTIFIED</th>
                  <th className="text-center whitespace-nowrap">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {outages.map((o) => (
                  <tr key={o.id} className="intro-x">
                    <td>
                      <div className="font-medium whitespace-nowrap">{o.title}</div>
                      <div className="text-slate-500 text-xs max-w-md truncate">{o.message}</div>
                    </td>
                    <td className="whitespace-nowrap">{areaName(o.area_id)}</td>
                    <td className="w-32">
                      <div className="flex justify-center">
                        <div
                          className={classnames(
                            "py-1 px-2 rounded-full text-xs font-medium inline-block whitespace-nowrap",
                            o.status === "open" ? "bg-danger/20 text-danger" : "bg-success/20 text-success"
                          )}
                        >
                          {titleCase(o.status)}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{formatDateTime(o.started_at)}</td>
                    <td className="whitespace-nowrap">{formatDateTime(o.resolved_at)}</td>
                    <td className="text-center">{o.notified_count}</td>
                    <td className="whitespace-nowrap">
                      <div className="flex justify-center gap-2">
                        {canEdit && (
                          <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={() => openNotify(o, false)}>
                            Notify customers
                          </button>
                        )}
                        {canEdit && o.status === "open" && (
                          <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={() => markResolved(o)}>
                            Mark resolved
                          </button>
                        )}
                        {canEdit && o.status === "resolved" && (
                          <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={() => openNotify(o, true)}>
                            Send fixed notice
                          </button>
                        )}
                        {canDelete && (
                          <button type="button" className="btn btn-outline-danger btn-sm" disabled={busy} onClick={() => setDeleting(o)}>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-5 intro-y">
            <div className="text-slate-500 text-sm">Page {page} of {totalPages}</div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-outline-secondary" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <button type="button" className="btn btn-outline-secondary" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>

      {formOpen && (
        <Modal title="Report Outage" onClose={() => setFormOpen(false)}>
          {formError && <div className="mb-4 p-3 rounded-md bg-danger/10 text-danger text-sm">{formError}</div>}
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12">
              <label className="text-xs text-slate-500">Title</label>
              <input type="text" className="form-control box mt-1 w-full" placeholder="e.g. Fiber cut in Gulshan" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="col-span-12">
              <label className="text-xs text-slate-500">Affected area</label>
              <select className="form-select box mt-1 w-full" value={form.area_id} onChange={(e) => setForm((p) => ({ ...p, area_id: e.target.value }))}>
                <option value="">All areas</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div className="col-span-12">
              <label className="text-xs text-slate-500">Message shown to customers</label>
              <textarea className="form-control box mt-1 w-full" rows={3} placeholder="We are aware of an interruption and our team is working on it." value={form.message} onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}></textarea>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button type="button" className="btn btn-outline-secondary" onClick={() => setFormOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-primary shadow-md" disabled={busy} onClick={submit}>
              {busy ? "Saving..." : "Report Outage"}
            </button>
          </div>
        </Modal>
      )}

      {notify && (
        <Modal title={notify.resolved ? "Send fixed notice" : "Notify customers"} onClose={() => setNotify(null)}>
          {notify.result === null ? (
            <>
              <div className="text-sm">
                <span className="font-medium">{notify.outage.title}</span> ({areaName(notify.outage.area_id)})
              </div>
              <div className="text-sm text-slate-500 mt-3">
                About <span className="font-medium text-slate-700 dark:text-slate-200">{notify.count}</span> active
                customer{notify.count === 1 ? "" : "s"} with an e-mail address would be notified.
                {notify.resolved
                  ? " They will receive a notice that the interruption is fixed."
                  : " They will receive the outage message."}{" "}
                Customers who already got this notice are skipped.
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" className="btn btn-outline-secondary" onClick={() => setNotify(null)}>
                  {notify.resolved ? "Not now" : "Cancel"}
                </button>
                <button type="button" className="btn btn-primary shadow-md" disabled={busy} onClick={sendNotify}>
                  {busy ? "Queuing..." : notify.resolved ? "Send fixed notice" : "Notify customers"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="p-3 rounded-md bg-success/10 text-success text-sm">
                {notify.result} e-mail{notify.result === 1 ? "" : "s"} queued. They are sent within 15 minutes.
              </div>
              <div className="flex justify-end mt-6">
                <button type="button" className="btn btn-primary" onClick={() => setNotify(null)}>Done</button>
              </div>
            </>
          )}
        </Modal>
      )}

      {deleting && (
        <Modal title="Delete outage?" onClose={() => setDeleting(null)}>
          <div className="text-slate-500 text-sm">{deleting.title} will be permanently removed.</div>
          <div className="flex justify-end gap-2 mt-6">
            <button type="button" className="btn btn-outline-secondary" onClick={() => setDeleting(null)}>Cancel</button>
            <button type="button" className="btn btn-danger shadow-md" disabled={busy} onClick={confirmDelete}>
              {busy ? "Deleting..." : "Delete"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default OutagesPanel;
