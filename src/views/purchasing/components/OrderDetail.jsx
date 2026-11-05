import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, formatDate, formatDateTime } from "@/lib/format";
import { Modal, PoBadge, ErrorBanner, KV } from "./common";
import LinesPanel from "./LinesPanel";
import ReceiveDialog from "./ReceiveDialog";
import PayDialog from "./PayDialog";

function Receipts({ receipts, items }) {
  const desc = (id) => items.find((i) => i.id === id)?.description || "Line";
  return (
    <div>
      <div className="font-medium mb-2">Receipts history</div>
      {receipts.length === 0 && <div className="text-slate-500 text-sm">Nothing received yet.</div>}
      <div className="space-y-2">
        {receipts.map((g) => (
          <div key={g.id} className="border border-slate-200/60 dark:border-darkmode-400 rounded-md p-3 text-sm">
            <div className="flex">
              <div className="font-medium">{g.grn_number}</div>
              <div className="ml-auto text-slate-500">{formatDateTime(g.received_at)}</div>
            </div>
            {g.notes && <div className="text-slate-500 text-xs">{g.notes}</div>}
            <ul className="mt-1">
              {(g.goods_receipt_lines || []).map((l) => (
                <li key={l.id}>
                  {Number(l.qty)} x {desc(l.po_item_id)}
                  {l.serials && l.serials.length > 0 && (
                    <span className="text-slate-500 text-xs"> (S/N: {l.serials.join(", ")})</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OrderDetail({ poId, perms, onClose, onChanged, toast }) {
  const [po, setPo] = useState(null);
  const [items, setItems] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dlg, setDlg] = useState(null); // "receive" | "pay"

  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      supabase.from("v_purchase_overview").select("*").eq("id", poId).maybeSingle(),
      supabase.from("purchase_order_items").select("*").eq("po_id", poId).order("id"),
      supabase
        .from("goods_receipts")
        .select("*, goods_receipt_lines(*)")
        .eq("po_id", poId)
        .order("received_at", { ascending: false }),
    ]);
    const err = a.error || b.error || c.error;
    if (err) return setError(friendlyError(err));
    if (!a.data) return setError("Purchase order not found.");
    setError("");
    setPo(a.data);
    setItems((b.data || []).sort((x, y) => (x.description || "").localeCompare(y.description || "")));
    setReceipts(c.data || []);
  }, [poId]);

  useEffect(() => {
    load();
  }, [load]);

  const changed = async () => {
    await load();
    onChanged();
  };

  const setStatus = async (status, okMsg) => {
    setBusy(true);
    setError("");
    const { error: e } = await supabase.rpc("set_po_status", { p_po: poId, p_status: status });
    setBusy(false);
    if (e) return setError(friendlyError(e));
    toast.show(okMsg);
    changed();
  };

  const deleteDraft = async () => {
    if (!window.confirm("Delete this draft order?")) return;
    setBusy(true);
    setError("");
    const { data, error: e } = await supabase.from("purchase_orders").delete().eq("id", poId).select("id");
    if (e) {
      setBusy(false);
      return setError(friendlyError(e));
    }
    if (!data || data.length === 0) {
      // Orders cannot be hard-deleted by policy; cancelling a draft is the supported equivalent.
      const { error: e2 } = await supabase.rpc("set_po_status", { p_po: poId, p_status: "cancelled" });
      setBusy(false);
      if (e2) return setError(friendlyError(e2));
      toast.show("Draft cancelled (orders are kept for the record).");
      onChanged();
      return load();
    }
    setBusy(false);
    toast.show("Draft deleted.");
    onChanged();
    onClose();
  };

  const close = () => {
    onChanged();
    onClose();
  };

  if (!po) {
    return (
      <Modal title="Purchase order" onClose={close}>
        <ErrorBanner message={error} />
        {!error && <div className="text-slate-500">Loading…</div>}
      </Modal>
    );
  }

  const nothingReceived = items.every((i) => Number(i.qty_received) === 0);
  const receivable = po.status === "ordered" || po.status === "partial";
  const balance = Number(po.total) - Number(po.paid_amount);

  return (
    <>
      <Modal
        wide
        title={`${po.po_number} - ${po.supplier_name}`}
        onClose={close}
        footer={
          <div className="flex flex-wrap gap-2 justify-end w-full">
            {perms.del && po.status === "draft" && (
              <button type="button" className="btn btn-outline-danger mr-auto" disabled={busy} onClick={deleteDraft}>
                Delete draft
              </button>
            )}
            {perms.edit && po.status === "draft" && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || items.length === 0}
                onClick={() => setStatus("ordered", "Order placed.")}
              >
                Place order
              </button>
            )}
            {perms.edit && receivable && (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setDlg("receive")}>
                Receive goods
              </button>
            )}
            {perms.edit && receivable && nothingReceived && (
              <button
                type="button"
                className="btn btn-outline-danger"
                disabled={busy}
                onClick={() => window.confirm("Cancel this order?") && setStatus("cancelled", "Order cancelled.")}
              >
                Cancel order
              </button>
            )}
            {perms.edit && po.status !== "cancelled" && (
              <button type="button" className="btn btn-outline-primary" disabled={busy || balance <= 0} onClick={() => setDlg("pay")}>
                Pay supplier
              </button>
            )}
          </div>
        }
      >
        <ErrorBanner message={error} onClose={() => setError("")} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          <KV label="Status">
            <PoBadge status={po.status} />
          </KV>
          <KV label="Order date">{formatDate(po.order_date)}</KV>
          <KV label="Expected">{formatDate(po.expected_date)}</KV>
          <KV label="Supplier">{po.supplier_name}</KV>
          <KV label="Total">{money(po.total)}</KV>
          <KV label="Paid">{money(po.paid_amount)}</KV>
          <KV label="Balance due">{money(balance)}</KV>
          <KV label="Pending qty">{Number(po.qty_pending)}</KV>
        </div>
        {po.notes && <div className="text-sm text-slate-500 mb-4">{po.notes}</div>}
        <LinesPanel po={po} items={items} canEdit={perms.edit} onChanged={changed} />
        <div className="mt-6">
          <Receipts receipts={receipts} items={items} />
        </div>
      </Modal>
      {dlg === "receive" && (
        <ReceiveDialog
          po={po}
          items={items}
          onClose={() => setDlg(null)}
          onDone={() => {
            setDlg(null);
            changed();
          }}
        />
      )}
      {dlg === "pay" && (
        <PayDialog
          po={po}
          onClose={() => setDlg(null)}
          onDone={(a) => {
            setDlg(null);
            toast.show(`Payment of ${money(a)} booked.`);
            changed();
          }}
        />
      )}
    </>
  );
}
