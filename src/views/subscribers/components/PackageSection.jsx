import { useCallback, useEffect, useState } from "react";
import { Lucide } from "@/base-components";
import { supabase } from "@/lib/supabase";
import { can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { money, formatDate, titleCase } from "@/lib/format";

function ChangeDialog({ sub, onClose, onDone }) {
  const [packages, setPackages] = useState([]);
  const [pkg, setPkg] = useState("");
  const [fee, setFee] = useState("");
  const [when, setWhen] = useState("now");
  const [prorate, setProrate] = useState(true);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    supabase
      .from("packages")
      .select("id,name,monthly_price")
      .eq("status", "active")
      .order("name")
      .then(({ data, error: err }) => {
        if (err) setError(friendlyError(err));
        else setPackages(data || []);
      });
  }, []);

  const selected = packages.find((p) => p.id === pkg);
  const newFee = fee !== "" ? Number(fee) : selected ? Number(selected.monthly_price) : null;
  const isDowngrade = newFee !== null && newFee < Number(sub.monthly_fee || 0);

  const submit = async () => {
    setError("");
    if (!pkg) return setError("Choose the new package.");
    if (fee !== "" && (!Number.isFinite(Number(fee)) || Number(fee) < 0))
      return setError("Custom fee must be 0 or more.");
    setBusy(true);
    try {
      const { data, error: err } = await supabase.rpc("change_package", {
        p_subscriber_id: sub.id,
        p_new_package: pkg,
        p_new_fee: fee === "" ? null : Number(fee),
        p_when: isDowngrade ? "next_cycle" : when,
        p_charge_proration: prorate,
        p_reason: reason.trim() || null,
      });
      if (err) throw err;
      setResult(data);
      onDone();
    } catch (err) {
      setError(friendlyError(err, "Unable to change package."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white dark:bg-darkmode-600 rounded-md shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center px-5 py-4 border-b border-slate-200">
          <h3 className="text-lg font-medium">Change package</h3>
          <button type="button" className="ml-auto text-slate-500" onClick={onClose} disabled={busy}>
            <Lucide icon="X" className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="alert alert-danger show">{error}</div>}
          {result ? (
            <div className="alert alert-outline-success show">
              {result.status === "applied" ? (
                <>
                  Package changed now.
                  {Number(result.proration_amount) > 0
                    ? ` A price-difference invoice of ${money(result.proration_amount)} was created.`
                    : " No extra invoice was needed."}
                </>
              ) : (
                <>Change scheduled for {formatDate(result.effective_date)} (next billing day).</>
              )}
            </div>
          ) : (
            <>
              <div className="text-sm text-slate-500">
                Current: {sub.package_name || "No package"} at {money(sub.monthly_fee)} per month.
              </div>
              <div>
                <label className="form-label">New package</label>
                <select className="form-select" value={pkg} onChange={(e) => setPkg(e.target.value)}>
                  <option value="">Select package</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} - {money(p.monthly_price)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Custom monthly fee (optional)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-control"
                  placeholder={selected ? String(selected.monthly_price) : "Package price"}
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">When</label>
                <select
                  className="form-select"
                  value={isDowngrade ? "next_cycle" : when}
                  disabled={isDowngrade}
                  onChange={(e) => setWhen(e.target.value)}
                >
                  <option value="now">Now</option>
                  <option value="next_cycle">Next billing day</option>
                </select>
                {isDowngrade && (
                  <div className="text-xs text-slate-500 mt-1">
                    Downgrades always take effect on the next billing day.
                  </div>
                )}
              </div>
              {!isDowngrade && when === "now" && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={prorate}
                    onChange={(e) => setProrate(e.target.checked)}
                  />
                  Charge the price difference for the rest of this cycle
                </label>
              )}
              <div>
                <label className="form-label">Reason</label>
                <input
                  type="text"
                  className="form-control"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
        <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>
            {result ? "Close" : "Cancel"}
          </button>
          {!result && (
            <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
              {busy ? "Saving..." : "Change package"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const CHANGE_BADGE = {
  applied: "bg-success/20 text-success",
  scheduled: "bg-pending/20 text-pending",
  cancelled: "bg-slate-200 text-slate-500",
};

function PackageSection({ sub, session, onChanged }) {
  const [history, setHistory] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const canEdit = can(session, "subscribers", "edit");

  const load = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from("package_changes")
        .select("*")
        .eq("subscriber_id", sub.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (err) throw err;
      const ids = [
        ...new Set((data || []).flatMap((c) => [c.from_package_id, c.to_package_id]).filter(Boolean)),
      ];
      let names = {};
      if (ids.length) {
        const { data: pk, error: pErr } = await supabase.from("packages").select("id,name").in("id", ids);
        if (pErr) throw pErr;
        names = Object.fromEntries((pk || []).map((p) => [p.id, p.name]));
      }
      setHistory((data || []).map((c) => ({ ...c, from_name: names[c.from_package_id], to_name: names[c.to_package_id] })));
    } catch (err) {
      setError(friendlyError(err));
      setHistory([]);
    }
  }, [sub.id]);

  useEffect(() => {
    load();
  }, [load]);

  const cancel = async (c) => {
    setBusyId(c.id);
    setError("");
    try {
      const { error: err } = await supabase.rpc("cancel_package_change", { p_change_id: c.id });
      if (err) throw err;
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="col-span-12 mt-2">
      <div className="flex items-center mb-2">
        <div className="font-medium">Package history</div>
        {canEdit && sub.connection_status !== "terminated" && (
          <button type="button" className="btn btn-sm btn-outline-secondary ml-auto" onClick={() => setOpen(true)}>
            <Lucide icon="Repeat" className="w-4 h-4 mr-1" />
            Change package
          </button>
        )}
      </div>
      {error && <div className="alert alert-danger show mb-2">{error}</div>}
      {history === null ? (
        <div className="text-slate-500 text-sm">Loading...</div>
      ) : history.length === 0 ? (
        <div className="text-slate-500 text-sm">No package changes yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Requested</th>
                <th>From</th>
                <th>To</th>
                <th>Type</th>
                <th>Effective</th>
                <th>Difference invoiced</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map((c) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap">{formatDate(c.created_at)}</td>
                  <td className="whitespace-nowrap">
                    {c.from_name || "-"} ({money(c.from_fee)})
                  </td>
                  <td className="whitespace-nowrap">
                    {c.to_name || "-"} ({money(c.to_fee)})
                  </td>
                  <td>{titleCase(c.change_type)}</td>
                  <td className="whitespace-nowrap">{formatDate(c.effective_date)}</td>
                  <td>{Number(c.proration_amount) > 0 ? money(c.proration_amount) : "-"}</td>
                  <td>
                    <span className={`py-1 px-2 rounded-full text-xs font-medium ${CHANGE_BADGE[c.status] || ""}`}>
                      {titleCase(c.status)}
                    </span>
                  </td>
                  <td>
                    {c.status === "scheduled" && canEdit && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        disabled={busyId === c.id}
                        onClick={() => cancel(c)}
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <ChangeDialog
          sub={sub}
          onClose={() => setOpen(false)}
          onDone={() => {
            load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

export default PackageSection;
