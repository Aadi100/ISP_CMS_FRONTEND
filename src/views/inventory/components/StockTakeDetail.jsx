import { Lucide } from "@/base-components";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { ErrorBanner, Modal, qty } from "./shared";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export default function StockTakeDetail({ take, branchName, canEdit, onClose, onFinalized }) {
  const isOpen = take.status === "open";
  const [lines, setLines] = useState([]);
  const [counts, setCounts] = useState({}); // line id -> input string
  const [saved, setSaved] = useState({}); // line id -> saved string
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("stock_take_lines")
        .select("id, stock_item_id, system_qty, counted_qty, stock_items(name, unit, item_code)")
        .eq("take_id", take.id)
        .limit(2000);
      if (cancelled) return;
      if (err) setError(friendlyError(err));
      const sorted = (data || []).sort((a, b) => (a.stock_items?.name || "").localeCompare(b.stock_items?.name || ""));
      setLines(sorted);
      const init = Object.fromEntries(sorted.map((l) => [l.id, l.counted_qty === null ? "" : String(l.counted_qty)]));
      setCounts(init);
      setSaved(init);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [take.id]);

  const diff = (l) => (counts[l.id] === "" || counts[l.id] === undefined ? null : Number(counts[l.id]) - Number(l.system_qty));

  const saveLine = async (l) => {
    if (!isOpen || counts[l.id] === saved[l.id]) return;
    const value = counts[l.id] === "" ? null : Number(counts[l.id]);
    if (value !== null && value < 0) return setError("Counted quantity cannot be negative.");
    const { error: err } = await supabase.from("stock_take_lines").update({ counted_qty: value }).eq("id", l.id);
    if (err) return setError(friendlyError(err));
    setError("");
    setSaved((s) => ({ ...s, [l.id]: counts[l.id] }));
  };

  // save every pending edit, then apply
  const finalize = async () => {
    setBusy(true);
    setError("");
    for (const l of lines) {
      if (counts[l.id] !== saved[l.id]) {
        const { error: err } = await supabase
          .from("stock_take_lines")
          .update({ counted_qty: counts[l.id] === "" ? null : Number(counts[l.id]) })
          .eq("id", l.id);
        if (err) {
          setBusy(false);
          setConfirming(false);
          return setError(friendlyError(err));
        }
      }
    }
    const { data, error: err } = await supabase.rpc("finalize_stock_take", { p_take: take.id });
    setBusy(false);
    setConfirming(false);
    if (err) return setError(friendlyError(err));
    const msg = `${take.take_number} finalized: ${data?.adjusted_items ?? 0} item(s) adjusted.`;
    setResult(msg);
    onFinalized(msg);
  };

  const printSheet = () => {
    const w = window.open("", "_blank");
    if (!w) return setError("Allow pop-ups to print the count sheet.");
    const body = lines
      .map(
        (l) =>
          `<tr><td>${esc(l.stock_items?.item_code)}</td><td>${esc(l.stock_items?.name)}</td><td>${esc(l.stock_items?.unit)}</td><td style="text-align:right">${qty(l.system_qty)}</td><td style="width:120px"></td></tr>`
      )
      .join("");
    w.document.write(
      `<html><head><title>${esc(take.take_number)}</title><style>body{font-family:Arial,sans-serif;padding:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #444;padding:6px;font-size:13px}th{background:#eee;text-align:left}</style></head><body><h2>Stock count sheet ${esc(take.take_number)}</h2><p>Branch: ${esc(branchName)} &middot; Started: ${esc(formatDateTime(take.started_at))}</p><table><thead><tr><th>Code</th><th>Item</th><th>Unit</th><th>System qty</th><th>Counted</th></tr></thead><tbody>${body}</tbody></table></body></html>`
    );
    w.document.close();
    w.focus();
    w.print();
  };

  const f = filter.trim().toLowerCase();
  const shown = lines.filter((l) => !f || `${l.stock_items?.name} ${l.stock_items?.item_code}`.toLowerCase().includes(f));
  const differing = lines.filter((l) => {
    const d = diff(l);
    return d !== null && d !== 0;
  });
  const counted = lines.filter((l) => counts[l.id] !== "" && counts[l.id] !== undefined).length;

  return (
    <Modal
      title={`Stock-take ${take.take_number}`}
      size="max-w-4xl"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={printSheet} disabled={loading}>
            <Lucide icon="Printer" className="w-4 h-4 mr-2" /> Print count sheet
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Close
          </button>
          {isOpen && canEdit && !result && (
            <button type="button" className="btn btn-primary shadow-md" disabled={loading || busy} onClick={() => setConfirming(true)}>
              Finish &amp; apply
            </button>
          )}
        </>
      }
    >
      <ErrorBanner message={error} />
      {result && (
        <div className="box p-3 bg-success/10 text-success text-sm flex items-center my-3">
          <Lucide icon="CheckCircle2" className="w-4 h-4 mr-2" /> {result}
        </div>
      )}
      <div className="text-sm text-slate-500 my-3">
        {branchName} · started {formatDateTime(take.started_at)}
        {take.finalized_at ? ` · finalized ${formatDateTime(take.finalized_at)}` : ""} · counted {counted} of {lines.length}
      </div>
      <input className="form-control box w-full mb-3" placeholder="Filter items" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {loading ? (
        <div className="text-sm text-slate-500">Loading...</div>
      ) : lines.length === 0 ? (
        <div className="text-sm text-slate-500">This stock-take has no items.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table w-full min-w-[560px]">
            <thead>
              <tr>
                <th>ITEM</th>
                <th>UNIT</th>
                <th className="text-right">SYSTEM</th>
                <th className="text-right w-36">COUNTED</th>
                <th className="text-right">DIFFERENCE</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => {
                const d = diff(l);
                return (
                  <tr key={l.id}>
                    <td>{l.stock_items?.name}</td>
                    <td>{l.stock_items?.unit}</td>
                    <td className="text-right">{qty(l.system_qty)}</td>
                    <td className="text-right">
                      {isOpen && canEdit && !result ? (
                        <input
                          type="number"
                          min="0"
                          step="any"
                          className="form-control box w-28 ml-auto text-right"
                          value={counts[l.id] ?? ""}
                          onChange={(e) => setCounts((c) => ({ ...c, [l.id]: e.target.value }))}
                          onBlur={() => saveLine(l)}
                        />
                      ) : l.counted_qty === null ? (
                        "—"
                      ) : (
                        qty(counts[l.id])
                      )}
                    </td>
                    <td className={`text-right font-medium ${d === null || d === 0 ? "" : d < 0 ? "text-danger" : "text-success"}`}>
                      {d === null ? "—" : `${d > 0 ? "+" : ""}${qty(d)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-xs text-slate-500 mt-2">Items left blank are not changed when you finish.</div>

      {confirming && (
        <Modal
          title="Finish & apply stock-take"
          onClose={() => setConfirming(false)}
          footer={
            <>
              <button type="button" className="btn btn-outline-secondary" onClick={() => setConfirming(false)}>
                Back
              </button>
              <button type="button" className="btn btn-primary shadow-md" disabled={busy} onClick={finalize}>
                {busy ? "Applying..." : "Apply adjustments"}
              </button>
            </>
          }
        >
          {differing.length === 0 ? (
            <div className="text-sm">No differences. The stock-take will simply be closed.</div>
          ) : (
            <>
              <div className="text-sm mb-2">These quantities will be posted as adjustments:</div>
              <ul className="list-disc ml-5 text-sm">
                {differing.map((l) => (
                  <li key={l.id}>
                    {l.stock_items?.name}: {qty(l.system_qty)} &rarr; {qty(counts[l.id])} {l.stock_items?.unit} ({diff(l) > 0 ? "+" : ""}
                    {qty(diff(l))})
                  </li>
                ))}
              </ul>
            </>
          )}
        </Modal>
      )}
    </Modal>
  );
}
