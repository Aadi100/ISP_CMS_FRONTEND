import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { Empty, ErrorBanner, Field, Pager, Spinner, SuccessBanner, moveLabel, nullIfEmpty, qty } from "./shared";

export default function TransfersTab({ ctx }) {
  const { session, branches } = ctx;
  const canEdit = can(session, "inventory", "edit");

  const [items, setItems] = useState([]);
  const [itemId, setItemId] = useState("");
  const [toBranch, setToBranch] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("v_stock_overview")
      .select("id, name, unit, quantity_on_hand, branch_id, branch_name, item_code")
      .eq("is_active", true)
      .order("name")
      .limit(1000)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(friendlyError(err));
        else setItems(data || []);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, count, error: err } = await supabase
        .from("v_stock_movements")
        .select("*", { count: "exact" })
        .in("movement_type", ["transfer_out", "transfer_in"])
        .order("created_at", { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (cancelled) return;
      if (err) setError(friendlyError(err));
      else {
        setRows(data || []);
        setTotal(count || 0);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, reloadKey]);

  const item = items.find((i) => i.id === itemId);
  const n = Number(quantity) || 0;
  const short = item && n > Number(item.quantity_on_hand);
  const destinations = branches.filter((b) => !item || b.id !== item.branch_id);

  const submit = async () => {
    if (!item) return setFormError("Choose the stock item.");
    if (!toBranch) return setFormError("Choose the destination branch.");
    if (n <= 0) return setFormError("Enter a quantity above zero.");
    setSaving(true);
    setFormError("");
    const { error: err } = await supabase.rpc("transfer_stock", {
      p_item_id: item.id,
      p_to_branch: toBranch,
      p_qty: n,
      p_notes: nullIfEmpty(notes),
    });
    setSaving(false);
    if (err) return setFormError(friendlyError(err));
    const dest = branches.find((b) => b.id === toBranch)?.name;
    setNotice(`Transferred ${qty(n)} ${item.unit} of ${item.name} to ${dest}.`);
    setItemId("");
    setQuantity("");
    setNotes("");
    setPage(0);
    setReloadKey((k) => k + 1);
  };

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12">
        <h2 className="text-lg font-medium">Stock transfers</h2>
        <div className="text-slate-500 mt-1">Move stock from one branch to another. Each side is recorded in the ledger.</div>
      </div>
      <div className="col-span-12">
        <SuccessBanner message={notice} />
        <ErrorBanner message={error} />
      </div>

      {canEdit && (
        <div className="col-span-12">
          <div className="box p-5">
            <ErrorBanner message={formError} />
            <div className="grid grid-cols-12 gap-4 mt-2">
              <Field label="Stock item" className="col-span-12 lg:col-span-5">
                <select
                  className="form-select box w-full"
                  value={itemId}
                  onChange={(e) => {
                    setItemId(e.target.value);
                    setToBranch("");
                  }}
                >
                  <option value="">Select item</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                      {i.branch_name ? ` [${i.branch_name}]` : ""} - on hand {qty(i.quantity_on_hand)} {i.unit}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Destination branch" className="col-span-12 sm:col-span-6 lg:col-span-3">
                <select className="form-select box w-full" value={toBranch} onChange={(e) => setToBranch(e.target.value)}>
                  <option value="">Select branch</option>
                  {destinations.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`Quantity${item ? ` (${item.unit})` : ""}`} className="col-span-12 sm:col-span-6 lg:col-span-2">
                <input type="number" min="0" step="any" className="form-control box w-full" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </Field>
              <Field label="Notes" className="col-span-12 lg:col-span-5">
                <input className="form-control box w-full" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
              <div className="col-span-12 lg:col-span-7 flex items-end gap-4">
                <button type="button" className="btn btn-primary shadow-md" disabled={saving} onClick={submit}>
                  {saving ? "Transferring..." : "Transfer stock"}
                </button>
                {item && (
                  <div className={`text-sm ${short ? "text-danger" : "text-slate-500"}`}>
                    On hand {qty(item.quantity_on_hand)} &rarr; after {qty(Number(item.quantity_on_hand) - n)} {item.unit}
                    {short && " (not enough stock)"}
                  </div>
                )}
              </div>
            </div>
            {branches.length === 0 && (
              <div className="text-xs text-slate-500 mt-3">
                Only users who are not pinned to a branch can pick a destination branch.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="col-span-12">
        <div className="font-medium mb-2">Transfer history</div>
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty text="No transfers yet." icon="Truck" />
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="table table-report w-full min-w-[800px]">
              <thead>
                <tr>
                  <th>WHEN</th>
                  <th>ITEM</th>
                  <th>TYPE</th>
                  <th className="text-right">QTY</th>
                  <th className="text-right">BALANCE</th>
                  <th>REFERENCE</th>
                  <th>BY</th>
                  <th>NOTES</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="intro-x">
                    <td className="whitespace-nowrap">{formatDateTime(m.created_at)}</td>
                    <td>{m.item_name}</td>
                    <td className="whitespace-nowrap">{moveLabel(m.movement_type)}</td>
                    <td className={`text-right font-medium whitespace-nowrap ${Number(m.quantity) < 0 ? "text-danger" : "text-success"}`}>
                      {Number(m.quantity) > 0 ? "+" : ""}
                      {qty(m.quantity)} {m.unit}
                    </td>
                    <td className="text-right">{qty(m.balance_after)}</td>
                    <td>{m.reference || "—"}</td>
                    <td>{m.created_by_name || "—"}</td>
                    <td>{m.notes || "—"}</td>
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
    </div>
  );
}
