import { Lucide, Tippy } from "@/base-components";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { formatDateTime, money, titleCase } from "@/lib/format";
import {
  BranchSelect,
  Empty,
  ErrorBanner,
  Field,
  LowBadge,
  Modal,
  Pager,
  SearchBox,
  Spinner,
  StatusBadge,
  SubscriberSelect,
  SuccessBanner,
  clean,
  downloadCsv,
  nullIfEmpty,
  moveLabel,
  qty,
} from "./shared";

const CATEGORIES = ["cable", "connector", "tool", "accessory", "other"];
const UNITS = ["pcs", "m", "roll", "box"];

const EMPTY_ITEM = {
  name: "",
  category: "cable",
  unit: "pcs",
  sku: "",
  brand: "",
  quantity_on_hand: "",
  reorder_level: "0",
  unit_cost: "0",
  location: "",
  is_active: true,
  branch_id: "",
};

const MOVEMENTS = {
  purchase: { label: "Purchase / Receive stock", sign: "+", hint: "Stock bought or received. Updates the unit cost." },
  return: { label: "Return to stock", sign: "+", hint: "Item brought back (optionally from a customer)." },
  damaged: { label: "Damaged / Write-off", sign: "-", hint: "Removes the quantity from stock." },
  adjustment: { label: "Adjustment (+/-)", sign: "±", hint: "Stock-take correction. Use a negative number to reduce." },
};

export default function StockTab({ ctx }) {
  const { session, branches, isAdmin } = ctx;
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
  const [category, setCategory] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [activeFilter, setActiveFilter] = useState("active");
  const [branch, setBranch] = useState("");

  const [form, setForm] = useState(null);
  const [move, setMove] = useState(null); // {item, type}
  const [history, setHistory] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  const applyFilters = (q) => {
    if (category) q = q.eq("category", category);
    if (lowOnly) q = q.eq("is_low", true);
    if (activeFilter === "active") q = q.eq("is_active", true);
    if (activeFilter === "inactive") q = q.eq("is_active", false);
    if (branch) q = q.eq("branch_id", branch);
    const s = clean(search);
    if (s) q = q.or(`name.ilike.%${s}%,item_code.ilike.%${s}%,sku.ilike.%${s}%,brand.ilike.%${s}%`);
    return q;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, count, error: err } = await applyFilters(
        supabase
          .from("v_stock_overview")
          .select("*", { count: "exact" })
          .order("name")
          .range(page * pageSize, page * pageSize + pageSize - 1)
      );
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
  }, [page, pageSize, search, category, lowOnly, activeFilter, branch, reloadKey]);

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
    setCategory("");
    setLowOnly(false);
    setActiveFilter("active");
    setBranch("");
    setPage(0);
  };

  const exportCsv = async () => {
    const { data, error: err } = await applyFilters(supabase.from("v_stock_overview").select("*").order("name").limit(5000));
    if (err) return setError(friendlyError(err));
    downloadCsv(
      "stock-items.csv",
      [
        { label: "Code", get: (r) => r.item_code },
        { label: "Name", get: (r) => r.name },
        { label: "Category", get: (r) => r.category },
        { label: "Unit", get: (r) => r.unit },
        { label: "On hand", get: (r) => r.quantity_on_hand },
        { label: "Reorder level", get: (r) => r.reorder_level },
        { label: "Unit cost", get: (r) => r.unit_cost },
        { label: "Value", get: (r) => r.stock_value },
        { label: "Low stock", get: (r) => (r.is_low ? "yes" : "no") },
        { label: "Location", get: (r) => r.location },
      ],
      data || []
    );
  };

  const openCreate = () => {
    setModalError("");
    setForm({ ...EMPTY_ITEM, branch_id: session.branchId || "" });
  };
  const openEdit = (r) => {
    setModalError("");
    setForm({
      id: r.id,
      name: r.name,
      category: r.category || "other",
      unit: r.unit || "pcs",
      sku: r.sku || "",
      brand: r.brand || "",
      reorder_level: r.reorder_level,
      unit_cost: r.unit_cost,
      location: r.location || "",
      is_active: r.is_active,
      quantity_on_hand: r.quantity_on_hand,
      branch_id: r.branch_id || "",
    });
  };

  const save = async () => {
    if (!form.name.trim()) return setModalError("Name is required.");
    setSaving(true);
    setModalError("");
    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || "other",
      unit: form.unit.trim() || "pcs",
      sku: nullIfEmpty(form.sku),
      brand: nullIfEmpty(form.brand),
      reorder_level: Number(form.reorder_level || 0),
      unit_cost: Number(form.unit_cost || 0),
      location: nullIfEmpty(form.location),
      is_active: form.is_active,
    };
    let res;
    if (form.id) {
      // quantity_on_hand is never sent: the database only changes it through stock movements
      res = await supabase.from("stock_items").update(payload).eq("id", form.id);
    } else {
      if (form.quantity_on_hand !== "") payload.quantity_on_hand = Number(form.quantity_on_hand);
      if (form.branch_id) payload.branch_id = form.branch_id;
      res = await supabase.from("stock_items").insert(payload);
    }
    setSaving(false);
    if (res.error) return setModalError(friendlyError(res.error));
    setNotice(form.id ? "Stock item updated." : "Stock item created.");
    setForm(null);
    reload();
  };

  const doMove = async (v) => {
    setSaving(true);
    setModalError("");
    const q = Number(v.quantity);
    if (!q || (move.type !== "adjustment" && q < 0)) {
      setSaving(false);
      return setModalError("Enter a valid quantity.");
    }
    const { error: err } = await supabase.rpc("record_stock_movement", {
      p_item_id: move.item.id,
      p_type: move.type,
      p_quantity: q,
      p_unit_cost: move.type === "purchase" && v.unit_cost !== "" ? Number(v.unit_cost) : null,
      p_subscriber_id: v.subscriber?.id ?? null,
      p_reference: nullIfEmpty(v.reference),
      p_notes: nullIfEmpty(v.notes),
    });
    setSaving(false);
    if (err) return setModalError(friendlyError(err));
    setNotice(`${MOVEMENTS[move.type].label}: ${move.item.name} updated.`);
    setMove(null);
    reload();
  };

  const icon = (name, tip, fn, cls = "text-slate-500 hover:text-primary") => (
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
      <Lucide icon={name} className={`w-4 h-4 ${cls}`} />
    </Tippy>
  );

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 flex flex-wrap gap-2 items-center">
        <h2 className="text-lg font-medium mr-auto">Stock items</h2>
        {canCreate && (
          <button type="button" className="btn btn-primary shadow-md" onClick={openCreate}>
            <Lucide icon="Plus" className="w-4 h-4 mr-2" /> Add Stock Item
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
          <SearchBox value={searchDraft} onChange={setSearchDraft} onSubmit={submitSearch} placeholder="Search by name, item code, SKU or brand" />
          <div className="grid grid-cols-12 gap-3 mt-4">
            <div className="col-span-12 sm:col-span-6 lg:col-span-3">
              <label className="text-xs text-slate-500">Category</label>
              <select className="form-select box mt-1 w-full" value={category} onChange={(e) => resetPage(setCategory)(e.target.value)}>
                <option value="">All Categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {titleCase(c)}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-12 sm:col-span-6 lg:col-span-3">
              <label className="text-xs text-slate-500">Active</label>
              <select className="form-select box mt-1 w-full" value={activeFilter} onChange={(e) => resetPage(setActiveFilter)(e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="all">All</option>
              </select>
            </div>
            {isAdmin && (
              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <label className="text-xs text-slate-500">Branch</label>
                <BranchSelect branches={branches} value={branch} onChange={resetPage(setBranch)} />
              </div>
            )}
            <div className="col-span-12 sm:col-span-6 lg:col-span-3 flex items-end">
              <label className="flex items-center gap-2 text-sm pb-2">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={lowOnly}
                  onChange={(e) => resetPage(setLowOnly)(e.target.checked)}
                />
                Low stock only
              </label>
            </div>
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
          <Empty text="No stock items found." icon="Layers">
            {canCreate && (
              <button type="button" className="btn btn-primary shadow-md" onClick={openCreate}>
                <Lucide icon="Plus" className="w-4 h-4 mr-2" /> Add Stock Item
              </button>
            )}
          </Empty>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="table table-report w-full min-w-[1100px]">
              <thead>
                <tr>
                  <th>CODE</th>
                  <th>ITEM</th>
                  <th>CATEGORY</th>
                  <th className="text-right">ON HAND</th>
                  <th className="text-right">REORDER LEVEL</th>
                  <th className="text-right">UNIT COST</th>
                  <th className="text-right">VALUE</th>
                  <th>LOCATION</th>
                  <th className="text-center min-w-[170px]">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="intro-x">
                    <td className="font-medium whitespace-nowrap">{r.item_code}</td>
                    <td className="whitespace-nowrap">
                      <div className="flex items-center">
                        {r.name}
                        {r.is_low && r.is_active && <LowBadge />}
                        {!r.is_active && <span className="ml-2"><StatusBadge value="inactive" /></span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{titleCase(r.category)}</td>
                    <td className={`text-right font-medium whitespace-nowrap ${r.is_low ? "text-danger" : ""}`}>
                      {qty(r.quantity_on_hand)} {r.unit}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {qty(r.reorder_level)} {r.unit}
                    </td>
                    <td className="text-right whitespace-nowrap">{money(r.unit_cost)}</td>
                    <td className="text-right whitespace-nowrap">{money(r.stock_value)}</td>
                    <td className="whitespace-nowrap">{r.location || "—"}</td>
                    <td className="table-report__action">
                      <div className="flex justify-center items-center gap-3">
                        {icon("Clock", "Movement history", () => setHistory(r))}
                        {canEdit && icon("Edit", "Edit", () => openEdit(r))}
                        {canEdit && icon("PackagePlus", "Purchase / Receive", () => setMove({ item: r, type: "purchase" }))}
                        {canEdit && icon("RotateCcw", "Return", () => setMove({ item: r, type: "return" }))}
                        {canEdit && icon("AlertTriangle", "Damaged / Write-off", () => setMove({ item: r, type: "damaged" }), "text-danger")}
                        {canEdit && icon("SlidersHorizontal", "Adjustment (+/-)", () => setMove({ item: r, type: "adjustment" }))}
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
          title={form.id ? "Edit Stock Item" : "Add Stock Item"}
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
            <Field label="Name *" className="col-span-12">
              <input className="form-control box w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Category">
              <input
                list="stock-categories"
                className="form-control box w-full"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
              <datalist id="stock-categories">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Unit">
              <input
                list="stock-units"
                className="form-control box w-full"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
              <datalist id="stock-units">
                {UNITS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="SKU">
              <input className="form-control box w-full" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </Field>
            <Field label="Brand">
              <input className="form-control box w-full" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            </Field>
            {form.id ? (
              <Field label="Quantity on hand" hint="Change it with Purchase / Return / Damaged / Adjustment.">
                <div className="form-control box">
                  {qty(form.quantity_on_hand)} {form.unit}
                </div>
              </Field>
            ) : (
              <Field label="Opening quantity" hint="Recorded in the stock ledger as opening stock.">
                <input
                  type="number"
                  min="0"
                  className="form-control box w-full"
                  value={form.quantity_on_hand}
                  onChange={(e) => setForm({ ...form, quantity_on_hand: e.target.value })}
                />
              </Field>
            )}
            <Field label="Reorder level">
              <input
                type="number"
                min="0"
                className="form-control box w-full"
                value={form.reorder_level}
                onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
              />
            </Field>
            <Field label="Unit cost (PKR)">
              <input
                type="number"
                min="0"
                className="form-control box w-full"
                value={form.unit_cost}
                onChange={(e) => setForm({ ...form, unit_cost: e.target.value })}
              />
            </Field>
            <Field label="Location / Store">
              <input className="form-control box w-full" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
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
            <Field label="Active" className="col-span-12">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                Item can be used in installations
              </label>
            </Field>
          </div>
        </Modal>
      )}

      {move && <MovementModal move={move} saving={saving} error={modalError} onClose={() => setMove(null)} onSubmit={doMove} />}
      {history && <ItemHistory item={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

function MovementModal({ move, saving, error, onClose, onSubmit }) {
  const meta = MOVEMENTS[move.type];
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState(move.item.unit_cost ?? "");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [subscriber, setSubscriber] = useState(null);
  const n = Number(quantity) || 0;
  const delta = move.type === "damaged" ? -n : n;
  const after = Number(move.item.quantity_on_hand) + delta;

  return (
    <Modal
      title={`${meta.label}: ${move.item.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary shadow-md"
            disabled={saving || !n || after < 0}
            onClick={() => onSubmit({ quantity, unit_cost: unitCost, reference, notes, subscriber })}
          >
            {saving ? "Saving..." : "Confirm"}
          </button>
        </>
      }
    >
      <ErrorBanner message={error} />
      <div className="text-sm text-slate-500 my-3">{meta.hint}</div>
      <div className="grid grid-cols-12 gap-4">
        <Field label={`Quantity (${move.item.unit}) ${move.type === "adjustment" ? "(use - to reduce)" : ""}`}>
          <input
            type="number"
            step="any"
            min={move.type === "adjustment" ? undefined : "0"}
            className="form-control box w-full"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
        {move.type === "purchase" && (
          <Field label="Unit cost (PKR)">
            <input type="number" min="0" className="form-control box w-full" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
          </Field>
        )}
        <Field label="Reference (PO / invoice no.)">
          <input className="form-control box w-full" value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        {move.type === "return" && (
          <Field label="Returned by customer (optional)" className="col-span-12">
            <SubscriberSelect value={subscriber} onChange={setSubscriber} />
          </Field>
        )}
        <Field label="Notes" className="col-span-12">
          <textarea rows={2} className="form-control box w-full" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <div className={`mt-4 text-sm ${after < 0 ? "text-danger" : "text-slate-600"}`}>
        On hand: {qty(move.item.quantity_on_hand)} &rarr; after: <b>{qty(after)}</b> {move.item.unit}
        {after < 0 && " (not enough stock)"}
      </div>
    </Modal>
  );
}

function ItemHistory({ item, onClose }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, count, error: err } = await supabase
        .from("v_stock_movements")
        .select("*", { count: "exact" })
        .eq("item_id", item.id)
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
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
  }, [item.id, page, pageSize]);

  return (
    <Modal
      title={`Movement history: ${item.name}`}
      size="max-w-4xl"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
          Close
        </button>
      }
    >
      <ErrorBanner message={error} />
      {loading ? (
        <div className="text-slate-500 text-sm">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-500 text-sm">No movements recorded for this item.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table w-full min-w-[700px]">
            <thead>
              <tr>
                <th>WHEN</th>
                <th>TYPE</th>
                <th className="text-right">QTY</th>
                <th className="text-right">BALANCE</th>
                <th>CUSTOMER / JOB</th>
                <th>BY</th>
                <th>NOTES</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap">{formatDateTime(m.created_at)}</td>
                  <td className="whitespace-nowrap">{moveLabel(m.movement_type)}</td>
                  <td className={`text-right font-medium whitespace-nowrap ${Number(m.quantity) < 0 ? "text-danger" : "text-success"}`}>
                    {Number(m.quantity) > 0 ? "+" : ""}
                    {qty(m.quantity)} {m.unit}
                  </td>
                  <td className="text-right whitespace-nowrap">{qty(m.balance_after)}</td>
                  <td>{[m.subscriber_name, m.installation_number || m.reference].filter(Boolean).join(" · ") || "—"}</td>
                  <td>{m.technician_name || m.created_by_name || "—"}</td>
                  <td>{m.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > 0 && (
        <Pager page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(s) => { setPage(0); setPageSize(s); }} />
      )}
    </Modal>
  );
}
