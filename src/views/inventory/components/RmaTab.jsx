import { Lucide, Tippy } from "@/base-components";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { formatDate, titleCase, toDateInput } from "@/lib/format";
import { equipLabel } from "./InstallationForm";
import { Empty, ErrorBanner, Field, Modal, Pager, Spinner, SuccessBanner, clean, nullIfEmpty } from "./shared";

const BADGE = {
  sent: "bg-pending/20 text-pending",
  repaired: "bg-success/20 text-success",
  returned: "bg-success/20 text-success",
  replaced: "bg-primary/20 text-primary",
  rejected: "bg-danger/20 text-danger",
};
const EQ_COLS = "id, equipment_code, equipment_type, brand, model, serial_number, status";

export default function RmaTab({ ctx }) {
  const canCreate = can(ctx.session, "inventory", "create");
  const canEdit = can(ctx.session, "inventory", "edit");

  const [rows, setRows] = useState([]);
  const [eqMap, setEqMap] = useState({});
  const [supMap, setSupMap] = useState({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [status, setStatus] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [sending, setSending] = useState(false);
  const [changing, setChanging] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase
        .from("equipment_rma")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (status) q = q.eq("status", status);
      const s = clean(search);
      if (s) q = q.or(`rma_number.ilike.%${s}%,reason.ilike.%${s}%`);
      const { data, count, error: err } = await q;
      if (cancelled) return;
      if (err) {
        setError(friendlyError(err));
        return setLoading(false);
      }
      const list = data || [];
      const eqIds = [...new Set(list.flatMap((r) => [r.equipment_id, r.replacement_equipment_id]).filter(Boolean))];
      const supIds = [...new Set(list.map((r) => r.supplier_id).filter(Boolean))];
      const [eq, sup] = await Promise.all([
        eqIds.length ? supabase.from("equipment").select(EQ_COLS).in("id", eqIds) : { data: [] },
        supIds.length ? supabase.from("suppliers").select("id, name").in("id", supIds) : { data: [] },
      ]);
      if (cancelled) return;
      setEqMap(Object.fromEntries((eq.data || []).map((e) => [e.id, e])));
      setSupMap(Object.fromEntries((sup.data || []).map((s2) => [s2.id, s2.name])));
      setError("");
      setRows(list);
      setTotal(count || 0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, status, search, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 flex flex-wrap gap-2 items-center">
        <div className="mr-auto">
          <h2 className="text-lg font-medium">Warranty returns (RMA)</h2>
          <div className="text-slate-500 mt-1">Units sent to a supplier for repair or replacement.</div>
        </div>
        <input
          className="form-control box w-56"
          placeholder="Search RMA number or reason"
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setPage(0);
              setSearch(searchDraft);
            }
          }}
        />
        <select
          className="form-select box w-40"
          value={status}
          onChange={(e) => {
            setPage(0);
            setStatus(e.target.value);
          }}
        >
          <option value="">All statuses</option>
          {Object.keys(BADGE).map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </select>
        {canCreate && (
          <button type="button" className="btn btn-primary shadow-md" onClick={() => setSending(true)}>
            <Lucide icon="Send" className="w-4 h-4 mr-2" /> Send for repair
          </button>
        )}
      </div>
      <div className="col-span-12">
        <SuccessBanner message={notice} />
        <ErrorBanner message={error} />
      </div>

      <div className="col-span-12">
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty text="No warranty returns found." icon="RotateCcw" />
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="table table-report w-full min-w-[1100px]">
              <thead>
                <tr>
                  <th>RMA</th>
                  <th>EQUIPMENT</th>
                  <th>SUPPLIER</th>
                  <th>REASON</th>
                  <th className="text-center">STATUS</th>
                  <th>SENT</th>
                  <th>RETURNED</th>
                  <th>REPLACEMENT</th>
                  <th className="text-center">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const e = eqMap[r.equipment_id];
                  const rep = eqMap[r.replacement_equipment_id];
                  return (
                    <tr key={r.id} className="intro-x">
                      <td className="font-medium whitespace-nowrap">{r.rma_number}</td>
                      <td>
                        {e ? (
                          <>
                            <div className="whitespace-nowrap">{e.equipment_code} · {e.equipment_type}</div>
                            <div className="text-xs text-slate-500">{e.serial_number || "no serial"}</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{supMap[r.supplier_id] || "—"}</td>
                      <td>{r.reason}</td>
                      <td>
                        <div className="flex justify-center">
                          <div className={`py-1 px-2 rounded-full text-xs font-medium whitespace-nowrap ${BADGE[r.status]}`}>{titleCase(r.status)}</div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap">{formatDate(r.sent_at)}</td>
                      <td className="whitespace-nowrap">{formatDate(r.returned_at)}</td>
                      <td className="whitespace-nowrap">{rep ? `${rep.equipment_code} (${rep.serial_number || "no serial"})` : "—"}</td>
                      <td className="table-report__action">
                        <div className="flex justify-center">
                          {canEdit && r.status === "sent" && (
                            <Tippy
                              tag="a"
                              href=""
                              content="Update status"
                              onClick={(ev) => {
                                ev.preventDefault();
                                setChanging(r);
                              }}
                            >
                              <Lucide icon="Edit" className="w-4 h-4 text-slate-500 hover:text-primary" />
                            </Tippy>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && total > 0 && (
          <Pager page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(s) => { setPage(0); setPageSize(s); }} />
        )}
      </div>

      {sending && (
        <SendModal
          onClose={() => setSending(false)}
          onDone={() => {
            setSending(false);
            setNotice("Unit sent for repair. It is now marked Under Maintenance.");
            reload();
          }}
        />
      )}
      {changing && (
        <StatusModal
          rma={changing}
          onClose={() => setChanging(null)}
          onDone={(msg) => {
            setChanging(null);
            setNotice(msg);
            reload();
          }}
        />
      )}
    </div>
  );
}

function SendModal({ onClose, onDone }) {
  const [units, setUnits] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [unitFilter, setUnitFilter] = useState("");
  const [unitId, setUnitId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [reason, setReason] = useState("");
  const [sentAt, setSentAt] = useState(toDateInput(new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const [u, s] = await Promise.all([
        supabase
          .from("equipment")
          .select(EQ_COLS)
          .in("status", ["in_stock", "available", "assigned", "damaged"])
          .order("equipment_code")
          .limit(1000),
        supabase.from("suppliers").select("id, name").eq("status", "active").order("name"),
      ]);
      if (u.error) setError(friendlyError(u.error));
      setUnits(u.data || []);
      setSuppliers(s.data || []);
    })();
  }, []);

  const f = unitFilter.trim().toLowerCase();
  const shown = units.filter((u) => !f || equipLabel(u).toLowerCase().includes(f) || u.id === unitId);

  const submit = async () => {
    if (!unitId) return setError("Choose the unit.");
    if (!reason.trim()) return setError("Enter the reason for the return.");
    setSaving(true);
    setError("");
    const { error: err } = await supabase.from("equipment_rma").insert({
      equipment_id: unitId,
      supplier_id: nullIfEmpty(supplierId),
      reason: reason.trim(),
      sent_at: sentAt || undefined,
    });
    setSaving(false);
    if (err) return setError(friendlyError(err));
    onDone();
  };

  return (
    <Modal
      title="Send unit for repair"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary shadow-md" disabled={saving} onClick={submit}>
            {saving ? "Saving..." : "Send"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <div className="grid grid-cols-12 gap-4 mt-3">
        <Field label="Equipment unit *" className="col-span-12">
          <input className="form-control box w-full mb-2" placeholder="Filter by code, type or serial" value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} />
          <select className="form-select box w-full" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            <option value="">Select unit</option>
            {shown.map((u) => (
              <option key={u.id} value={u.id}>
                {equipLabel(u)} [{titleCase(u.status)}]
              </option>
            ))}
          </select>
        </Field>
        <Field label="Supplier">
          <select className="form-select box w-full" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">— None —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date sent">
          <input type="date" className="form-control box w-full" value={sentAt} onChange={(e) => setSentAt(e.target.value)} />
        </Field>
        <Field label="Reason *" className="col-span-12">
          <textarea rows={2} className="form-control box w-full" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
      <div className="text-xs text-slate-500 mt-3">The unit is marked Under Maintenance and unassigned from its customer.</div>
    </Modal>
  );
}

function StatusModal({ rma, onClose, onDone }) {
  const [next, setNext] = useState("repaired");
  const [replacementId, setReplacementId] = useState("");
  const [replacements, setReplacements] = useState([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (next !== "replaced") return;
    supabase
      .from("equipment")
      .select(EQ_COLS)
      .in("status", ["in_stock", "available"])
      .neq("id", rma.equipment_id)
      .order("equipment_code")
      .limit(1000)
      .then(({ data, error: err }) => {
        if (err) setError(friendlyError(err));
        setReplacements(data || []);
      });
  }, [next, rma.equipment_id]);

  const submit = async () => {
    setSaving(true);
    setError("");
    const patch = { status: next };
    if (next === "replaced" && replacementId) patch.replacement_equipment_id = replacementId;
    if (notes.trim()) patch.notes = notes.trim();
    const { error: err } = await supabase.from("equipment_rma").update(patch).eq("id", rma.id);
    setSaving(false);
    if (err) return setError(friendlyError(err));
    onDone(`${rma.rma_number} marked ${titleCase(next)}.`);
  };

  return (
    <Modal
      title={`Update ${rma.rma_number}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary shadow-md" disabled={saving} onClick={submit}>
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <div className="grid grid-cols-12 gap-4 mt-3">
        <Field label="Outcome" className="col-span-12">
          <select className="form-select box w-full" value={next} onChange={(e) => setNext(e.target.value)}>
            <option value="repaired">Repaired (back in stock)</option>
            <option value="returned">Returned (back in stock)</option>
            <option value="replaced">Replaced (old unit becomes damaged)</option>
            <option value="rejected">Rejected (unit becomes damaged)</option>
          </select>
        </Field>
        {next === "replaced" && (
          <Field label="Replacement unit (optional)" className="col-span-12">
            <select className="form-select box w-full" value={replacementId} onChange={(e) => setReplacementId(e.target.value)}>
              <option value="">— None —</option>
              {replacements.map((u) => (
                <option key={u.id} value={u.id}>
                  {equipLabel(u)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Notes" className="col-span-12">
          <textarea rows={2} className="form-control box w-full" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
