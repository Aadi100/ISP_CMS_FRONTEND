import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { ErrorBanner, InfoBanner } from "../shared";
import EmailDeliveryCard from "./EmailDeliveryCard";
import BackupsCard from "./BackupsCard";

const EMPTY = {
  platform_name: "",
  support_email: "",
  support_phone: "",
  default_currency: "PKR",
  default_billing_cycle: "monthly",
  timezone: "Asia/Karachi",
  maintenance_mode: false,
  allow_self_signup: true,
  trial_days: 14,
  saas_invoice_due_days: 7,
  saas_grace_days: 7,
};

function Main() {
  const [rowId, setRowId] = useState(null);
  const [settings, setSettings] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: err } = await supabase.from("platform_settings").select("*").limit(1).maybeSingle();
      if (err) throw err;
      if (data) {
        setRowId(data.id);
        setSettings({
          platform_name: data.platform_name || "",
          support_email: data.support_email || "",
          support_phone: data.support_phone || "",
          default_currency: data.default_currency || "PKR",
          default_billing_cycle: data.default_billing_cycle || "monthly",
          timezone: data.timezone || "Asia/Karachi",
          maintenance_mode: Boolean(data.maintenance_mode),
          allow_self_signup: Boolean(data.allow_self_signup),
          trial_days: data.trial_days ?? 14,
          saas_invoice_due_days: data.saas_invoice_due_days ?? 7,
          saas_grace_days: data.saas_grace_days ?? 7,
        });
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const change = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings((s) => ({ ...s, [name]: type === "checkbox" ? checked : value }));
  };

  const save = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!settings.platform_name.trim()) return setError("Platform name is required.");
    const trial = Number(settings.trial_days);
    if (!Number.isInteger(trial) || trial < 0) return setError("Trial days must be a whole number, 0 or more.");
    const dueDays = Number(settings.saas_invoice_due_days);
    const graceDays = Number(settings.saas_grace_days);
    if (!Number.isInteger(dueDays) || dueDays < 0) return setError("Invoice due days must be a whole number, 0 or more.");
    if (!Number.isInteger(graceDays) || graceDays < 0) return setError("Grace days must be a whole number, 0 or more.");
    setSaving(true);
    try {
      const payload = {
        saas_invoice_due_days: dueDays,
        saas_grace_days: graceDays,
        platform_name: settings.platform_name.trim(),
        support_email: settings.support_email.trim() || null,
        support_phone: settings.support_phone.trim() || null,
        default_currency: settings.default_currency.trim() || "PKR",
        default_billing_cycle: settings.default_billing_cycle,
        timezone: settings.timezone.trim() || "Asia/Karachi",
        maintenance_mode: settings.maintenance_mode,
        allow_self_signup: settings.allow_self_signup,
        trial_days: trial,
      };
      // singleton table: update the one row, or create it if it is missing
      const { error: err } = rowId
        ? await supabase.from("platform_settings").update(payload).eq("id", rowId)
        : await supabase.from("platform_settings").insert([{ ...payload, singleton: true }]);
      if (err) throw err;
      setMessage("Platform settings saved.");
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-5">
      <div className="intro-y flex items-center h-10 mb-5">
        <h2 className="text-lg font-medium truncate">Platform Settings</h2>
      </div>

      <ErrorBanner message={error} onClose={() => setError("")} />
      <InfoBanner message={message} onClose={() => setMessage("")} />

      <div className="grid grid-cols-12 gap-6">
        <form onSubmit={save} className="intro-y col-span-12 lg:col-span-8">
          <div className="box p-5">
            {loading ? (
              <div className="text-slate-500">Loading settings...</div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Platform name</label>
                    <input name="platform_name" className="form-control" value={settings.platform_name} onChange={change} />
                  </div>
                  <div>
                    <label className="form-label">Support e-mail</label>
                    <input type="email" name="support_email" className="form-control" value={settings.support_email} onChange={change} />
                  </div>
                  <div>
                    <label className="form-label">Support phone</label>
                    <input name="support_phone" className="form-control" value={settings.support_phone} onChange={change} />
                  </div>
                  <div>
                    <label className="form-label">Default currency</label>
                    <input name="default_currency" className="form-control" value={settings.default_currency} onChange={change} />
                  </div>
                  <div>
                    <label className="form-label">Default billing cycle</label>
                    <select name="default_billing_cycle" className="form-select" value={settings.default_billing_cycle} onChange={change}>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Timezone</label>
                    <input name="timezone" className="form-control" value={settings.timezone} onChange={change} />
                  </div>
                  <div>
                    <label className="form-label">Trial days</label>
                    <input type="number" min="0" name="trial_days" className="form-control" value={settings.trial_days} onChange={change} />
                    <div className="text-slate-500 text-xs mt-1">
                      Length of the free trial given to a newly created ISP. 0 = no trial (the subscription starts
                      active).
                    </div>
                  </div>
                  <div>
                    <label className="form-label">SaaS invoice due days</label>
                    <input type="number" min="0" name="saas_invoice_due_days" className="form-control" value={settings.saas_invoice_due_days} onChange={change} />
                    <div className="text-slate-500 text-xs mt-1">
                      How many days after an invoice is issued the ISP has to pay it.
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Grace period (days)</label>
                    <input type="number" min="0" name="saas_grace_days" className="form-control" value={settings.saas_grace_days} onChange={change} />
                    <div className="text-slate-500 text-xs mt-1">
                      An ISP whose bill is overdue by more than the grace period is automatically set to expired =
                      read-only (no new customers or invoices) until the bill is paid.
                    </div>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  <label className="flex items-start gap-3">
                    <input type="checkbox" name="allow_self_signup" className="form-check-input mt-1" checked={settings.allow_self_signup} onChange={change} />
                    <span>
                      <span className="font-medium">Allow self sign-up</span>
                      <span className="block text-slate-500 text-xs">
                        On = anyone can register a new ISP from the sign-up page. Off = invite-only: ISPs can only be
                        created by you from the Organizations page.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3">
                    <input type="checkbox" name="maintenance_mode" className="form-check-input mt-1" checked={settings.maintenance_mode} onChange={change} />
                    <span>
                      <span className="font-medium">Maintenance mode</span>
                      <span className="block text-slate-500 text-xs">
                        Flags the platform as under maintenance for the applications that honour this setting.
                      </span>
                    </span>
                  </label>
                </div>

                <div className="flex justify-end mt-6">
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? "Saving..." : "Save settings"}
                  </button>
                </div>
              </>
            )}
          </div>
        </form>

        <div className="intro-y col-span-12 lg:col-span-8">
          <EmailDeliveryCard />
          <div className="mt-6">
            <BackupsCard />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Main;
