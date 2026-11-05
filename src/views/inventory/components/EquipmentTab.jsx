import { Lucide, Tippy } from "@/base-components";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatDateTime, money, titleCase, toDateInput } from "@/lib/format";
import {
  BranchSelect,
  EQUIPMENT_STATUSES,
  EQUIPMENT_TYPES,
  Empty,
  ErrorBanner,
  Field,
  KV,
  Modal,
  Pager,
  SearchBox,
  Spinner,
  StatusBadge,
  SubscriberSelect,
  SuccessBanner,
  TechnicianSelect,
  clean,
  downloadCsv,
  nullIfEmpty,
} from "./shared";

const EMPTY_FORM = {
  equipment_type: EQUIPMENT_TYPES[0],
  brand: "",
  model: "",
  serial_number: "",
  mac_address: "",
  status: "in_stock",
  location: "",
  supplier: "",
  purchase_date: "",
  purchase_price: "",
  warranty_expiry: "",
  remarks: "",
  branch_id: "",
};

const EDIT_STATUSES = EQUIPMENT_STATUSES.filter((s) => s !== "assigned");

export default function EquipmentTab({ ctx }) {
  const { session, branches, employees, isAdmin } = ctx;
  const canCreate = can(session, "inventory", "create");
  const canEdit = can(session, "inventory", "edit");
  const canExport = can(session, "inventory", "export");

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [reloadKey, setReloadKey] = useState(0);

  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [branch, setBranch] = useState("");
  const [location, setLocation] = useState("");

  const [form, setForm] = useState(null); // {id?, ...fields}
  const [assign, setAssign] = useState(null); // equipment row
  const [change, setChange] = useState(null); // {row, status}
  const [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  const applyFilters = (q) => {
    if (type) q = q.eq("equipment_type", type);
    if (status) q = q.eq("status", status);
    if (branch) q = q.eq("branch_id", branch);
    if (location.trim()) q = q.ilike("location", `%${clean(location)}%`);
    const s = clean(search);
    if (s) {
      q = q.or(
        [
          "serial_number",
          "equipment_code",
          "brand",
          "model",
          "mac_address",
          "equipment_type",
          "assigned_subscriber_name",
          "assigned_technician_name",
        ]
          .map((c) => `${c}.ilike.%${s}%`)
          .join(",")
      );
    }
    return q;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const q = applyFilters(
        supabase
          .from("v_equipment_overview")
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(page * pageSize, page * pageSize + pageSize - 1)
      );
      const { data, count, error: err } = await q;
      if (cancelled) return;
      if (err) setError(friendlyError(err));
      else {
        setError("");
        setRows(data || []);
        setTotal(count || 0);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, type, status, branch, location, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);
  const resetPage = (fn) => (v) => {
    setPage(0);
    fn(v);
  };
  const submitSearch = () => {
    setPage(0);
    setSearch(searchDraft);
  };
  const reset = () => {
    setSearchDraft("");
    setSearch("");
    setType("");
    setStatus("");
    setBranch("");
    setLocation("");
    setPage(0);
  };

  const exportCsv = async () => {
    const { data, error: err } = await applyFilters(
      supabase.from("v_equipment_overview").select("*").order("created_at", { ascending: false }).limit(5000)
    );
    if (err) return setError(friendlyError(err));
    downloadCsv(
      "equipment.csv",
      [
        { label: "Code", get: (r) => r.equipment_code },
        { label: "Type", get: (r) => r.equipment_type },
        { label: "Brand", get: (r) => r.brand },
        { label: "Model", get: (r) => r.model },
        { label: "Serial", get: (r) => r.serial_number },
        { label: "MAC", get: (r) => r.mac_address },
        { label: "Status", get: (r) => r.status },
        { label: "Location", get: (r) => r.location },
        { label: "Assigned customer", get: (r) => r.assigned_subscriber_name },
        { label: "Technician", get: (r) => r.assigned_technician_name },
        { label: "Purchase date", get: (r) => r.purchase_date },
        { label: "Purchase price", get: (r) => r.purchase_price },
        { label: "Warranty expiry", get: (r) => r.warranty_expiry },
      ],
      data || []
    );
  };

  const openCreate = () => {
    setModalError("");
    setForm({ ...EMPTY_FORM, branch_id: ctx.session.branchId || "" });
  };
  const openEdit = (r) => {
    setModalError("");
    setForm({
      id: r.id,
      equipment_type: r.equipment_type || "",
      brand: r.brand || "",
      model: r.model || "",
      serial_number: r.serial_number || "",
      mac_address: r.mac_address || "",
      status: r.status,
      location: r.location || "",
      supplier: r.supplier || "",
      purchase_date: toDateInput(r.purchase_date),
      purchase_price: r.purchase_price ?? "",
      warranty_expiry: toDateInput(r.warranty_expiry),
      remarks: r.remarks || "",
      branch_id: r.branch_id || "",
    });
  };

  const save = async () => {
    if (!form.equipment_type.trim()) return setModalError("Equipment type is required.");
    setSaving(true);
    setModalError("");
    const payload = {
      equipment_type: form.equipment_type.trim(),
      brand: nullIfEmpty(form.brand),
      model: nullIfEmpty(form.model),
      serial_number: nullIfEmpty(form.serial_number),
      mac_address: nullIfEmpty(form.mac_address),
      location: nullIfEmpty(form.location),
      supplier: nullIfEmpty(form.supplier),
      purchase_date: nullIfEmpty(form.purchase_date),
      purchase_price: form.purchase_price === "" ? null : Number(form.purchase_price),
      warranty_expiry: nullIfEmpty(form.warranty_expiry),
      remarks: nullIfEmpty(form.remarks),
    };
    let res;
    if (form.id) {
      if (form.status !== "assigned") payload.status = form.status;
      res = await supabase.from("equipment").update(payload).eq("id", form.id);
    } else {
      payload.status = form.status;
      if (form.branch_id) payload.branch_id = form.branch_id;
      res = await supabase.from("equipment").insert(payload);
    }
    setSaving(false);
    if (res.error) return setModalError(friendlyError(res.error));
    setNotice(form.id ? "Equipment updated." : "Equipment added to inventory.");
    setForm(null);
    reload();
  };

  const doAssign = async (values) => {
    setSaving(true);
    setModalError("");
    const { error: err } = await supabase
      .from("equipment")
      .update({
        status: "assigned",
        assigned_subscriber_id: values.subscriber.id,
        assigned_technician_id: nullIfEmpty(values.technician),
        installation_date: nullIfEmpty(values.date),
        location: "Customer premises",
        remarks: nullIfEmpty(values.remarks),
      })
      .eq("id", assign.id);
    setSaving(false);
    if (err) return setModalError(friendlyError(err));
    setNotice(`${assign.equipment_code} assigned to ${values.subscriber.full_name}.`);
    setAssign(null);
    reload();
  };

  const doChange = async (values) => {
    setSaving(true);
    setModalError("");
    const next = change.status;
    const patch = { status: next, remarks: nullIfEmpty(values.remarks) };
    if (next === "in_stock" || next === "available") {
      patch.assigned_subscriber_id = null;
      patch.assigned_technician_id = null;
      patch.location = nullIfEmpty(values.location);
    }
    const { error: err } = await supabase.from("equipment").update(patch).eq("id", change.row.id);
    setSaving(false);
    if (err) return setModalError(friendlyError(err));
    setNotice(`${change.row.equipment_code} is now ${titleCase(next)}.`);
    setChange(null);
    reload();
  };

  const act = (cls, icon, tip, fn) => (
    <Tippy
      tag="a"
      href=""
      content={tip}
      onClick={(e) => {
        e.preventDefault();
        setModalError("");
        fn();
      }}
    >
      <Lucide icon={icon} className={`w-4 h-4 ${cls}`} />
    </Tippy>
  );

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 flex flex-wrap gap-2 items-center">
        <h2 className="text-lg font-medium mr-auto">Serial equipment</h2>
        {canCreate && (
          <button type="button" className="btn btn-primary shadow-md" onClick={openCreate}>
            <Lucide icon="Plus" className="w-4 h-4 mr-2" /> Add Equipment
          </button>
        )}
        {canExport && (
          <button type="button" className="btn btn-outline-secondary" onClick={exportCsv}>
            <Lucide icon="Download" className="w-4 h-4 mr-2" /> Export
          </button>
        )}
      </div>

      <div className="col-span-12">
        <SuccessBanner message={notice} />
        <ErrorBanner message={error} />
      </div>

      <div className="col-span-12">
        <div className="box p-5">
          <SearchBox
            value={searchDraft}
            onChange={setSearchDraft}
            onSubmit={submitSearch}
            placeholder="Search serial, code, MAC, brand, model, customer or technician"
          />
          <div className="grid grid-cols-12 gap-3 mt-4">
            <div className="col-span-12 sm:col-span-6 lg:col-span-3">
              <label className="text-xs text-slate-500">Equipment Type</label>
              <select className="form-select box mt-1 w-full" value={type} onChange={(e) => resetPage(setType)(e.target.value)}>
                <option value="">All Types</option>
                {EQUIPMENT_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="col-span-12 sm:col-span-6 lg:col-span-3">
              <label className="text-xs text-slate-500">Status</label>
              <select className="form-select box mt-1 w-full" value={status} onChange={(e) => resetPage(setStatus)(e.target.value)}>
                <option value="">All Statuses</option>
                {EQUIPMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {titleCase(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-12 sm:col-span-6 lg:col-span-3">
              <label className="text-xs text-slate-500">Location / Store</label>
              <input
                className="form-control box mt-1 w-full"
                placeholder="e.g. warehouse"
                value={location}
                onChange={(e) => resetPage(setLocation)(e.target.value)}
              />
            </div>
            {isAdmin && (
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Branch</label>
                <BranchSelect branches={branches} value={branch} onChange={resetPage(setBranch)} />
              </div>
            )}
            <div className="col-span-12 flex gap-2">
              <button type="button" className="btn btn-primary" onClick={submitSearch}>
                Search
              </button>
              <button type="button" className="btn btn-outline-secondary" onClick={reset}>
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="col-span-12">
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty text="No equipment found.">
            {canCreate && (
              <button type="button" className="btn btn-primary shadow-md" onClick={openCreate}>
                <Lucide icon="Plus" className="w-4 h-4 mr-2" /> Add Equipment
              </button>
            )}
          </Empty>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="table table-report w-full min-w-[1200px]">
              <thead>
                <tr>
                  <th>CODE</th>
                  <th>TYPE</th>
                  <th>BRAND / MODEL</th>
                  <th>SERIAL</th>
                  <th>ASSIGNED TO</th>
                  <th>LOCATION</th>
                  <th className="text-center">STATUS</th>
                  <th>PURCHASED</th>
                  <th className="text-center min-w-[180px]">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="intro-x">
                    <td className="font-medium whitespace-nowrap">{r.equipment_code}</td>
                    <td className="whitespace-nowrap">{r.equipment_type}</td>
                    <td className="whitespace-nowrap">{[r.brand, r.model].filter(Boolean).join(" ") || "—"}</td>
                    <td className="whitespace-nowrap">{r.serial_number || "—"}</td>
                    <td className="whitespace-nowrap">
                      {r.assigned_subscriber_name || r.assigned_technician_name || "—"}
                    </td>
                    <td className="whitespace-nowrap">{r.location || "—"}</td>
                    <td>
                      <div className="flex justify-center">
                        <StatusBadge value={r.status} />
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{formatDate(r.purchase_date)}</td>
                    <td className="table-report__action">
                      <div className="flex justify-center items-center gap-3">
                        {act("text-slate-500 hover:text-primary", "Eye", "Details & history", () => setDetail(r))}
                        {canEdit && act("text-slate-500 hover:text-primary", "Edit", "Edit", () => openEdit(r))}
                        {canEdit &&
                          r.status !== "assigned" &&
                          r.status !== "lost" &&
                          act("text-slate-500 hover:text-primary", "Send", "Assign to customer", () => setAssign(r))}
                        {canEdit &&
                          r.status !== "in_stock" &&
                          act("text-slate-500 hover:text-primary", "RotateCcw", "Return to stock", () => setChange({ row: r, status: "in_stock" }))}
                        {canEdit &&
                          r.status !== "under_maintenance" &&
                          act("text-warning", "Wrench", "Mark under maintenance", () =>
                            setChange({ row: r, status: "under_maintenance" })
                          )}
                        {canEdit &&
                          r.status !== "damaged" &&
                          act("text-danger", "AlertTriangle", "Mark damaged", () => setChange({ row: r, status: "damaged" }))}
                        {canEdit &&
                          r.status !== "lost" &&
                          act("text-danger", "XCircle", "Mark lost", () => setChange({ row: r, status: "lost" }))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && total > 0 && (
          <Pager page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(s) => { setPage(0); setPageSize(s); }} />
        )}
      </div>

      {form && (
        <Modal
          title={form.id ? "Edit Equipment" : "Add Equipment"}
          onClose={() => setForm(null)}
          footer={
            <>
              <button type="button" className="btn btn-outline-secondary" onClick={() => setForm(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary shadow-md" disabled={saving} onClick={save}>
                {saving ? "Saving..." : "Save"}
              </button>
            </>
          }
        >
          <ErrorBanner message={modalError} />
          <div className="grid grid-cols-12 gap-4 mt-3">
            <Field label="Equipment Type *">
              <select
                className="form-select box w-full"
                value={form.equipment_type}
                onChange={(e) => setForm({ ...form, equipment_type: e.target.value })}
              >
                {[...new Set([...EQUIPMENT_TYPES, form.equipment_type])].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              {form.status === "assigned" ? (
                <div className="form-control box">Assigned (use the actions to change)</div>
              ) : (
                <select
                  className="form-select box w-full"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {EDIT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {titleCase(s)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {[
              ["brand", "Brand"],
              ["model", "Model"],
              ["serial_number", "Serial Number"],
              ["mac_address", "MAC Address"],
              ["location", "Location / Store"],
              ["supplier", "Supplier"],
            ].map(([k, label]) => (
              <Field key={k} label={label}>
                <input
                  className="form-control box w-full"
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              </Field>
            ))}
            <Field label="Purchase Date">
              <input
                type="date"
                className="form-control box w-full"
                value={form.purchase_date}
                onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
              />
            </Field>
            <Field label="Purchase Price (PKR)">
              <input
                type="number"
                min="0"
                className="form-control box w-full"
                value={form.purchase_price}
                onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
              />
            </Field>
            <Field label="Warranty Expiry">
              <input
                type="date"
                className="form-control box w-full"
                value={form.warranty_expiry}
                onChange={(e) => setForm({ ...form, warranty_expiry: e.target.value })}
              />
            </Field>
            {isAdmin && !form.id && (
              <Field label="Branch">
                <BranchSelect
                  branches={branches}
                  value={form.branch_id}
                  allLabel="Whole ISP (no branch)"
                  className="form-select box w-full"
                  onChange={(v) => setForm({ ...form, branch_id: v })}
                />
              </Field>
            )}
            <Field label="Remarks" className="col-span-12">
              <textarea
                rows={2}
                className="form-control box w-full"
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              />
            </Field>
          </div>
        </Modal>
      )}

      {assign && (
        <AssignModal
          row={assign}
          employees={employees}
          saving={saving}
          error={modalError}
          onClose={() => setAssign(null)}
          onSubmit={doAssign}
        />
      )}

      {change && (
        <ChangeModal
          change={change}
          saving={saving}
          error={modalError}
          onClose={() => setChange(null)}
          onSubmit={doChange}
        />
      )}

      {detail && <EquipmentDetail row={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function AssignModal({ row, employees, saving, error, onClose, onSubmit }) {
  const [subscriber, setSubscriber] = useState(null);
  const [technician, setTechnician] = useState(row.assigned_technician_id || "");
  const [date, setDate] = useState(toDateInput(new Date()));
  const [remarks, setRemarks] = useState("");
  const [localErr, setLocalErr] = useState("");
  return (
    <Modal
      title={`Assign ${row.equipment_code}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary shadow-md"
            disabled={saving}
            onClick={() => {
              if (!subscriber) return setLocalErr("Choose the customer this unit is assigned to.");
              setLocalErr("");
              onSubmit({ subscriber, technician, date, remarks });
            }}
          >
            {saving ? "Saving..." : "Assign"}
          </button>
        </>
      }
    >
      <ErrorBanner message={localErr || error} />
      <div className="text-sm text-slate-500 my-3">
        {[row.equipment_type, row.brand, row.model, row.serial_number].filter(Boolean).join(" · ")}
      </div>
      <div className="grid grid-cols-12 gap-4">
        <Field label="Customer *" className="col-span-12">
          <SubscriberSelect value={subscriber} onChange={setSubscriber} />
        </Field>
        <Field label="Technician">
          <TechnicianSelect employees={employees} value={technician} onChange={setTechnician} />
        </Field>
        <Field label="Installation Date">
          <input type="date" className="form-control box w-full" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Remarks" className="col-span-12">
          <textarea rows={2} className="form-control box w-full" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function ChangeModal({ change, saving, error, onClose, onSubmit }) {
  const [remarks, setRemarks] = useState("");
  const [location, setLocation] = useState(change.row.status === "assigned" ? "" : change.row.location || "");
  const toStock = change.status === "in_stock" || change.status === "available";
  return (
    <Modal
      title={`${change.row.equipment_code}: ${toStock ? "Return to stock" : `Mark ${titleCase(change.status)}`}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary shadow-md"
            disabled={saving}
            onClick={() => onSubmit({ remarks, location })}
          >
            {saving ? "Saving..." : "Confirm"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      {change.row.assigned_subscriber_name && (
        <div className="text-sm text-slate-500 my-3">
          Currently assigned to {change.row.assigned_subscriber_name}.
          {!toStock && " It stays linked to the customer unless you return it to stock."}
        </div>
      )}
      <div className="grid grid-cols-12 gap-4 mt-3">
        {toStock && (
          <Field label="Store / Location" className="col-span-12">
            <input className="form-control box w-full" value={location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
        )}
        <Field label="Remarks (saved in the history)" className="col-span-12">
          <textarea rows={2} className="form-control box w-full" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function EquipmentDetail({ row, onClose }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from("equipment_history")
      .select("*")
      .eq("equipment_id", row.id)
      .order("created_at", { ascending: false });
    if (err) {
      setError(friendlyError(err));
      setLoading(false);
      return;
    }
    const subIds = [...new Set((data || []).map((h) => h.subscriber_id).filter(Boolean))];
    const techIds = [...new Set((data || []).map((h) => h.technician_id).filter(Boolean))];
    const [subs, techs] = await Promise.all([
      subIds.length ? supabase.from("subscribers").select("id, full_name").in("id", subIds) : { data: [] },
      techIds.length ? supabase.from("employees").select("id, full_name").in("id", techIds) : { data: [] },
    ]);
    const sm = Object.fromEntries((subs.data || []).map((s) => [s.id, s.full_name]));
    const tm = Object.fromEntries((techs.data || []).map((s) => [s.id, s.full_name]));
    setHistory((data || []).map((h) => ({ ...h, subscriber: sm[h.subscriber_id], technician: tm[h.technician_id] })));
    setError("");
    setLoading(false);
  }, [row.id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Modal
      title={`Equipment ${row.equipment_code}`}
      size="max-w-3xl"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-4 text-sm">
        <KV label="Type">{row.equipment_type}</KV>
        <KV label="Brand">{row.brand}</KV>
        <KV label="Model">{row.model}</KV>
        <KV label="Serial Number">{row.serial_number}</KV>
        <KV label="MAC Address">{row.mac_address}</KV>
        <div>
          <div className="text-slate-500 text-xs mb-1">Status</div>
          <StatusBadge value={row.status} />
        </div>
        <KV label="Location">{row.location}</KV>
        <KV label="Assigned Customer">
          {row.assigned_subscriber_name && `${row.assigned_subscriber_name} (${row.assigned_subscriber_code})`}
        </KV>
        <KV label="Technician">{row.assigned_technician_name}</KV>
        <KV label="Installation Date">{formatDate(row.installation_date)}</KV>
        <KV label="Supplier">{row.supplier}</KV>
        <KV label="Purchase Date">{formatDate(row.purchase_date)}</KV>
        <KV label="Purchase Price">{row.purchase_price != null && money(row.purchase_price)}</KV>
        <KV label="Warranty Expiry">{formatDate(row.warranty_expiry)}</KV>
        <KV label="Remarks">{row.remarks}</KV>
      </div>

      <div className="mt-6 border-t border-slate-200/60 dark:border-darkmode-400 pt-4">
        <div className="text-sm font-medium mb-2">History</div>
        <ErrorBanner message={error} />
        {loading ? (
          <div className="text-slate-500 text-sm">Loading...</div>
        ) : history.length === 0 ? (
          <div className="text-slate-500 text-sm">No history recorded.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full min-w-[520px]">
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>ACTION</th>
                  <th>CUSTOMER</th>
                  <th>TECHNICIAN</th>
                  <th>REMARKS</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="whitespace-nowrap">{formatDateTime(h.created_at)}</td>
                    <td className="whitespace-nowrap">{h.action}</td>
                    <td>{h.subscriber || "—"}</td>
                    <td>{h.technician || "—"}</td>
                    <td>{h.remarks || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
