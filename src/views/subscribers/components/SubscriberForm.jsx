import { useEffect, useState } from "react";
import { Lucide } from "@/base-components";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, toDateInput } from "@/lib/format";

export function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** "Billing day: 12th of each month" from a yyyy-mm-dd anchor date. */
export function billingDayText(anchor) {
  if (!anchor) return "";
  const day = Number(String(anchor).slice(8, 10));
  if (!day) return "";
  return `Billing day: ${ordinal(day)} of each month`;
}

const EMPTY = {
  full_name: "",
  cnic: "",
  phone: "",
  email: "",
  address: "",
  area_id: "",
  package_id: "",
  monthly_fee: "",
  reseller_id: "",
  collector_id: "",
  branch_id: "",
  connection_type: "",
  pppoe_username: "",
  installation_location: "",
  installation_date: "",
  latitude: "",
  longitude: "",
  notes: "",
  connection_status: "pending",
};

function fromSubscriber(s) {
  const f = { ...EMPTY };
  Object.keys(EMPTY).forEach((k) => {
    const v = s[k];
    if (v !== null && v !== undefined) f[k] = String(v);
  });
  f.installation_date = s.installation_date ? toDateInput(s.installation_date) : "";
  return f;
}

function SubscriberForm({ editing, session, lookups, onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isAdminAllBranches = session?.role === "isp_admin" && !session?.branchId;

  useEffect(() => {
    if (editing) {
      setForm(fromSubscriber(editing));
      // collector_id is not exposed by the overview view; read it from the table
      supabase
        .from("subscribers")
        .select("collector_id")
        .eq("id", editing.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.collector_id) setForm((p) => ({ ...p, collector_id: data.collector_id }));
        });
    } else {
      setForm({ ...EMPTY, branch_id: session?.branchId || "" });
    }
    setError("");
  }, [editing, session]);

  const set = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const onPackage = (id) => {
    const pkg = lookups.packages.find((p) => p.id === id);
    setForm((p) => ({
      ...p,
      package_id: id,
      monthly_fee:
        pkg && pkg.monthly_price !== null && pkg.monthly_price !== undefined
          ? String(pkg.monthly_price)
          : p.monthly_fee,
    }));
  };

  const num = (v) => (v === "" ? null : Number(v));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.full_name.trim()) return setError("Customer name is required.");
    if (!form.phone.trim()) return setError("Phone number is required.");
    if (!form.package_id) return setError("Please select a package.");
    const fee = form.monthly_fee === "" ? 0 : Number(form.monthly_fee);
    if (!Number.isFinite(fee) || fee < 0) return setError("Monthly fee must be 0 or greater.");
    const lat = num(form.latitude);
    const lng = num(form.longitude);
    if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90))
      return setError("Latitude must be between -90 and 90.");
    if (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180))
      return setError("Longitude must be between -180 and 180.");

    const payload = {
      full_name: form.full_name.trim(),
      cnic: form.cnic.trim() || null,
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      area_id: form.area_id || null,
      package_id: form.package_id || null,
      reseller_id: form.reseller_id || null,
      collector_id: form.collector_id || null,
      monthly_fee: fee,
      connection_type: form.connection_type || null,
      pppoe_username: form.pppoe_username.trim() || null,
      installation_location: form.installation_location.trim() || null,
      installation_date: form.installation_date || null,
      latitude: lat,
      longitude: lng,
      notes: form.notes.trim() || null,
    };
    // Branch-pinned users keep the database default (their own branch).
    if (isAdminAllBranches) payload.branch_id = form.branch_id || null;
    if (!editing) payload.connection_status = form.connection_status;

    setSaving(true);
    try {
      if (editing) {
        const { error: err } = await supabase
          .from("subscribers")
          .update(payload)
          .eq("id", editing.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from("subscribers").insert(payload);
        if (err) throw err;
      }
      onSaved();
    } catch (err) {
      setError(friendlyError(err, "Unable to save subscriber."));
    } finally {
      setSaving(false);
    }
  };

  const label = "form-label";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white dark:bg-darkmode-600 rounded-md shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-darkmode-400">
          <div>
            <h3 className="text-lg font-medium">
              {editing ? "Edit Subscriber" : "Add Subscriber"}
            </h3>
            <div className="text-slate-500 text-xs mt-1">
              Enter the subscriber's account information.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-danger"
            disabled={saving}
          >
            <Lucide icon="X" className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-5">
            {error && (
              <div className="alert alert-danger show flex items-center mb-4">
                <Lucide icon="AlertCircle" className="w-5 h-5 mr-2 flex-none" />
                <span>{error}</span>
              </div>
            )}

            <div className="alert alert-outline-primary show flex items-start mb-4 text-sm">
              <Lucide icon="Info" className="w-5 h-5 mr-2 flex-none" />
              <div>
                Billing happens every month on the activation date.
                {editing?.connection_status === "active" && editing?.billing_anchor_date && (
                  <div className="font-medium mt-1">
                    {billingDayText(editing.billing_anchor_date)}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 sm:col-span-6">
                <label className={label}>Customer Name *</label>
                <input
                  type="text"
                  className="form-control"
                  value={form.full_name}
                  onChange={(e) => set("full_name", e.target.value)}
                />
              </div>
              <div className="col-span-12 sm:col-span-6">
                <label className={label}>Phone Number *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="0300-1234567"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </div>
              <div className="col-span-12 sm:col-span-6">
                <label className={label}>CNIC</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="42101-1234567-1"
                  value={form.cnic}
                  onChange={(e) => set("cnic", e.target.value)}
                />
              </div>
              <div className="col-span-12 sm:col-span-6">
                <label className={label}>Email</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="customer@example.com"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                />
              </div>

              <div className="col-span-12">
                <label className={label}>Address</label>
                <textarea
                  className="form-control"
                  rows="2"
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                />
              </div>

              <div className="col-span-12 sm:col-span-6">
                <label className={label}>Area</label>
                <select
                  className="form-select"
                  value={form.area_id}
                  onChange={(e) => set("area_id", e.target.value)}
                >
                  <option value="">No area</option>
                  {lookups.areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6">
                <label className={label}>Reseller (optional)</label>
                <select
                  className="form-select"
                  value={form.reseller_id}
                  onChange={(e) => set("reseller_id", e.target.value)}
                >
                  <option value="">Direct customer</option>
                  {lookups.resellers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-12 sm:col-span-6">
                <label className={label}>Collector (optional)</label>
                <select
                  className="form-select"
                  value={form.collector_id}
                  onChange={(e) => set("collector_id", e.target.value)}
                >
                  <option value="">No collector</option>
                  {(lookups.collectors || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-12 sm:col-span-6">
                <label className={label}>Package *</label>
                <select
                  className="form-select"
                  value={form.package_id}
                  onChange={(e) => onPackage(e.target.value)}
                >
                  <option value="">Select Package</option>
                  {lookups.packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} - {money(p.monthly_price)}
                      {p.status === "inactive" ? " (inactive)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6">
                <label className={label}>Monthly Fee (PKR)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-control"
                  value={form.monthly_fee}
                  onChange={(e) => set("monthly_fee", e.target.value)}
                />
                <div className="text-xs text-slate-500 mt-1">
                  Filled from the package, but you can change it for this subscriber.
                </div>
              </div>

              {isAdminAllBranches && (
                <div className="col-span-12 sm:col-span-6">
                  <label className={label}>Branch</label>
                  <select
                    className="form-select"
                    value={form.branch_id}
                    onChange={(e) => set("branch_id", e.target.value)}
                  >
                    <option value="">No branch</option>
                    {lookups.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="col-span-12 sm:col-span-6">
                <label className={label}>Connection Type</label>
                <select
                  className="form-select"
                  value={form.connection_type}
                  onChange={(e) => set("connection_type", e.target.value)}
                >
                  <option value="">Not set</option>
                  <option value="fiber">Fiber</option>
                  <option value="wireless">Wireless</option>
                  <option value="cable">Cable</option>
                  <option value="dsl">DSL</option>
                </select>
              </div>
              <div className="col-span-12 sm:col-span-6">
                <label className={label}>PPPoE Username</label>
                <input
                  type="text"
                  className="form-control"
                  value={form.pppoe_username}
                  onChange={(e) => set("pppoe_username", e.target.value)}
                />
              </div>

              <div className="col-span-12 sm:col-span-6">
                <label className={label}>Installation Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={form.installation_date}
                  onChange={(e) => set("installation_date", e.target.value)}
                />
              </div>
              {!editing && (
                <div className="col-span-12 sm:col-span-6">
                  <label className={label}>Connection Status</label>
                  <select
                    className="form-select"
                    value={form.connection_status}
                    onChange={(e) => set("connection_status", e.target.value)}
                  >
                    <option value="pending">Pending Installation</option>
                    <option value="active">Active</option>
                  </select>
                </div>
              )}

              <div className="col-span-12">
                <label className={label}>Installation Location</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Landmark or installation location"
                  value={form.installation_location}
                  onChange={(e) => set("installation_location", e.target.value)}
                />
              </div>
              <div className="col-span-12 sm:col-span-6">
                <label className={label}>Latitude</label>
                <input
                  type="number"
                  step="any"
                  className="form-control"
                  value={form.latitude}
                  onChange={(e) => set("latitude", e.target.value)}
                />
              </div>
              <div className="col-span-12 sm:col-span-6">
                <label className={label}>Longitude</label>
                <input
                  type="number"
                  step="any"
                  className="form-control"
                  value={form.longitude}
                  onChange={(e) => set("longitude", e.target.value)}
                />
              </div>
              <div className="col-span-12">
                <label className={label}>Notes</label>
                <textarea
                  className="form-control"
                  rows="2"
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="px-5 py-4 border-t border-slate-200 dark:border-darkmode-400 flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? (
                <>
                  <Lucide icon="Loader" className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Lucide icon="Check" className="w-4 h-4 mr-2" />
                  {editing ? "Update Subscriber" : "Save Subscriber"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SubscriberForm;
