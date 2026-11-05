import { Lucide } from "@/base-components";
import classnames from "classnames";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getSession, can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import RemindersTab from "./components/RemindersTab";
import SubscriptionTab from "./components/SubscriptionTab";
import SupportTab from "./components/SupportTab";
import AuditTab from "./components/AuditTab";
import ExportTab from "./components/ExportTab";
import { AreasSection, BranchesSection, NotificationLogs } from "./components/ListSections";

const SECTIONS = [
  { key: "company", label: "Company Information", icon: "Users" },
  { key: "billing", label: "Billing", icon: "Wallet" },
  { key: "payment", label: "Payments", icon: "Download" },
  { key: "email", label: "E-mail", icon: "Key" },
  { key: "notifications", label: "Notifications", icon: "AlertCircle" },
  { key: "areas", label: "Areas", icon: "MapPin" },
  { key: "branches", label: "Branches", icon: "Package" },
  { key: "security", label: "Security", icon: "Shield" },
  { key: "system", label: "System & Thresholds", icon: "Sheet" },
  { key: "reminders", label: "Reminders", icon: "Bell" },
  { key: "support", label: "Support & SLA", icon: "AlertCircle" },
  { key: "subscription", label: "Subscription", icon: "CreditCard", admin: true },
  { key: "audit", label: "Audit log", icon: "Activity", admin: true },
  { key: "export", label: "Data export", icon: "Download", admin: true },
];

const COMPANY_FIELDS = [
  "name", "owner_name", "registration_number", "ntn", "strn", "email", "support_email",
  "phone", "whatsapp", "website", "address", "city", "province", "country",
];
const BILLING_FIELDS = [
  "payment_due_days", "grace_period_days", "late_fee_amount", "invoice_prefix", "receipt_prefix",
  "currency", "installation_charges", "reconnect_charges",
  "reconnect_fee_auto", "auto_suspend", "suspension_days", "allow_upgrade", "allow_downgrade",
];
const PAYMENT_FIELDS = ["payment_methods", "payment_confirmation_required", "receipt_auto_generation", "payment_instructions"];
const EMAIL_FIELDS = ["sender_name", "reply_to", "sender_email"];
const NOTIF_FIELDS = ["notifications"];
const SECURITY_FIELDS = [
  "password_expiry_days", "min_password_length", "two_factor_required",
  "session_timeout_minutes", "max_login_attempts",
];
const SYSTEM_FIELDS = [
  "timezone", "date_format", "time_format", "language", "theme", "rows_per_page",
  "low_stock_threshold", "low_wallet_threshold",
];

const PAYMENT_METHOD_LABELS = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  online: "Online",
  cheque: "Cheque",
  jazzcash: "JazzCash",
  easypaisa: "EasyPaisa",
};
const NOTIF_LABELS = {
  invoice_reminder: "Invoice Reminder",
  payment_confirmation: "Payment Confirmation",
  ticket_updates: "Ticket Updates",
  installation_updates: "Installation Updates",
  low_inventory_alert: "Low Inventory Alert",
  system_notifications: "System Notifications",
};

const PROVINCES = ["Sindh", "Punjab", "Khyber Pakhtunkhwa", "Balochistan", "Islamabad Capital Territory", "Gilgit-Baltistan", "Azad Kashmir"];
const CURRENCIES = ["PKR", "USD"];
const TIMEZONES = ["Asia/Karachi", "Asia/Dubai", "Asia/Riyadh", "Europe/London", "UTC"];
const DATE_FORMATS = ["DD-MM-YYYY", "MM-DD-YYYY", "YYYY-MM-DD"];
const TIME_FORMATS = ["12-hour", "24-hour"];
const LANGUAGES = ["English", "Urdu"];
const THEMES = ["Light", "Dark"];

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));

function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className={classnames("flex items-center select-none", disabled ? "opacity-60" : "cursor-pointer")}>
      <input type="checkbox" className="form-check-input" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="ml-2 text-sm">{label}</span>
    </label>
  );
}

function Field({ span = "col-span-12 sm:col-span-6", label, children }) {
  return (
    <div className={span}>
      <label className="text-xs text-slate-500">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function SectionCard({ title, children, onSave, saving, canSave, extra }) {
  return (
    <div className="intro-y box p-5">
      <div className="text-base font-medium mb-4">{title}</div>
      <div className="grid grid-cols-12 gap-4">{children}</div>
      {extra}
      {onSave && canSave && (
        <div className="flex justify-end mt-6">
          <button type="button" onClick={onSave} disabled={saving} className="btn btn-primary shadow-md">
            <Lucide icon="CheckCircle2" className="w-4 h-4 mr-2" /> {saving ? "Saving..." : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

function Main() {
  const [session, setSession] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [org, setOrg] = useState(null);
  const [st, setSt] = useState(null); // organization_settings row
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState("");
  const [saving, setSaving] = useState("");
  const [activeSection, setActiveSection] = useState("company");
  const [uploading, setUploading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, text }
  const [logKey, setLogKey] = useState(0);

  const canEdit = can(session, "settings", "edit");
  const isAdmin = session?.role === "isp_admin";

  const showBanner = (message) => {
    setBanner(message);
    window.clearTimeout(showBanner._t);
    showBanner._t = window.setTimeout(() => setBanner(""), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const s = await getSession();
      setSession(s);
      if (!s?.orgId) throw new Error("Your account is not connected to an ISP.");
      setOrgId(s.orgId);
      const [o, os] = await Promise.all([
        supabase.from("organizations").select("*").eq("id", s.orgId).maybeSingle(),
        supabase.from("organization_settings").select("*").eq("organization_id", s.orgId).maybeSingle(),
      ]);
      if (o.error) throw o.error;
      if (os.error) throw os.error;
      if (!o.data || !os.data) throw new Error("Settings for your ISP were not found.");
      setOrg(o.data);
      setSt(os.data);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setO = (k, v) => setOrg((p) => ({ ...p, [k]: v }));
  const setS = (k, v) => setSt((p) => ({ ...p, [k]: v }));
  const num = (v) => (v === "" ? "" : Number(v));

  const saveSettings = async (key, label, fields) => {
    setSaving(key);
    setError("");
    try {
      const payload = pick(st, fields);
      for (const k of Object.keys(payload)) {
        if (payload[k] === "") payload[k] = null;
      }
      const { data, error: err } = await supabase
        .from("organization_settings")
        .update(payload)
        .eq("organization_id", orgId)
        .select();
      if (err) throw err;
      if (!data?.length) throw new Error("You do not have permission to change these settings.");
      setSt(data[0]);
      showBanner(`${label} saved.`);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving("");
    }
  };

  const saveCompany = async () => {
    setSaving("company");
    setError("");
    try {
      if (!org.name?.trim()) throw new Error("ISP name is required.");
      const payload = pick(org, COMPANY_FIELDS);
      for (const k of Object.keys(payload)) {
        if (payload[k] === "") payload[k] = null;
      }
      payload.country = payload.country || "Pakistan";
      const { data, error: err } = await supabase.from("organizations").update(payload).eq("id", orgId).select();
      if (err) throw err;
      if (!data?.length) throw new Error("You do not have permission to change company information.");
      setOrg(data[0]);
      showBanner("Company information saved.");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving("");
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${orgId}/logo.${ext}`;
      const { error: upErr } = await supabase.storage.from("org-logos").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("org-logos").getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`;
      const { error: dbErr } = await supabase.from("organizations").update({ logo_url: url }).eq("id", orgId);
      if (dbErr) throw dbErr;
      setO("logo_url", url);
      showBanner("Company logo updated.");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setUploading(false);
    }
  };

  const sendTestEmail = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const to = session?.user?.email || session?.profile?.email;
      if (!to) throw new Error("Your account has no e-mail address.");
      const { data, error: err } = await supabase.functions.invoke("send-notification", {
        body: {
          to,
          subject: "Test e-mail",
          message: "This is a test e-mail from your ISP management system. If you can read this, e-mail sending works.",
        },
      });
      if (err) {
        let detail = err.message || "";
        try {
          const body = await err.context?.json?.();
          if (body?.error) detail = body.error;
        } catch (_) {
          /* ignore */
        }
        if (/not found|404|Failed to send a request|Failed to fetch/i.test(detail)) {
          throw new Error("The e-mail service (send-notification) is not deployed or not reachable yet. Ask the platform owner to deploy it and configure the mail provider.");
        }
        throw new Error(detail || "Sending failed.");
      }
      setTestResult({ ok: true, text: `Test e-mail ${data?.status || "sent"} to ${to}.` });
    } catch (e) {
      setTestResult({ ok: false, text: friendlyError(e) });
    } finally {
      setTesting(false);
      setLogKey((k) => k + 1);
    }
  };

  if (loading) {
    return (
      <div className="intro-y box p-10 text-center">
        <Lucide icon="Loader" className="w-8 h-8 mx-auto mb-3 animate-spin text-primary" />
        <div className="text-slate-500">Loading settings...</div>
      </div>
    );
  }
  if (!org || !st) {
    return (
      <div className="alert alert-danger show">{error || "Settings could not be loaded."}</div>
    );
  }

  const input = (obj, setter, key, extra = {}) => (
    <input
      className="form-control box w-full"
      disabled={!canEdit}
      value={obj[key] ?? ""}
      onChange={(e) => setter(key, extra.type === "number" ? num(e.target.value) : e.target.value)}
      {...extra}
    />
  );
  const select = (obj, setter, key, options, asNumber) => {
    const list = options.includes(obj[key]) || obj[key] == null ? options : [obj[key], ...options];
    return (
      <select className="form-select box w-full" disabled={!canEdit} value={obj[key] ?? ""} onChange={(e) => setter(key, asNumber ? Number(e.target.value) : e.target.value)}>
        {list.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  };

  const profileFields = [org.name, org.owner_name, org.email, org.phone, org.address, org.city];
  const profilePercent = Math.round((profileFields.filter(Boolean).length / profileFields.length) * 100);
  const notifOn = Object.values(st.notifications || {}).filter(Boolean).length;
  const notifTotal = Object.keys(NOTIF_LABELS).length;
  const securityStrong = st.two_factor_required && st.min_password_length >= 8;

  const sectionProps = (key) => ({ saving: saving === key, canSave: canEdit });

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 intro-y flex flex-col lg:flex-row lg:items-center">
        <div>
          <h2 className="text-lg font-medium">Settings</h2>
          <div className="text-slate-500 mt-1">Configure your ISP account, branding and business preferences.</div>
        </div>
        {!canEdit && <div className="lg:ml-auto mt-3 lg:mt-0 text-sm text-slate-500">You can view settings but not change them.</div>}
      </div>

      {banner && (
        <div className="col-span-12 intro-y">
          <div className="box p-3 px-4 bg-success/10 text-success text-sm flex items-center">
            <Lucide icon="CheckCircle2" className="w-4 h-4 mr-2 flex-none" />
            {banner}
          </div>
        </div>
      )}
      {error && (
        <div className="col-span-12 intro-y">
          <div className="alert alert-danger show flex items-center">
            <Lucide icon="AlertCircle" className="w-5 h-5 mr-2" />
            <span>{error}</span>
            <button type="button" className="ml-auto" onClick={() => setError("")}>
              <Lucide icon="X" className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Summary cards */}
      {[
        ["Users", "text-primary", `${profilePercent}%`, "Company Profile Complete"],
        ["Wallet", "text-success", st.invoice_prefix && st.receipt_prefix && st.currency ? "Configured" : "Incomplete", "Billing Configuration"],
        ["AlertCircle", "text-pending", `${notifOn}/${notifTotal}`, "Notifications Enabled"],
        ["Shield", "text-danger", securityStrong ? "Strong" : "Basic", "Security Status"],
      ].map(([icon, color, value, label]) => (
        <div key={label} className="col-span-12 sm:col-span-6 lg:col-span-3 intro-y">
          <div className="box p-5 flex items-center">
            <Lucide icon={icon} className={`w-8 h-8 mr-4 flex-none ${color}`} />
            <div>
              <div className="text-xl font-medium">{value}</div>
              <div className="text-slate-500 text-xs mt-0.5">{label}</div>
            </div>
          </div>
        </div>
      ))}

      <div className="col-span-12 intro-y">
        <div className="box p-4">
          <div className="flex flex-wrap gap-2">
            {SECTIONS.filter((x) => !x.admin || isAdmin).map((section) => (
              <button
                key={section.key}
                type="button"
                onClick={() => setActiveSection(section.key)}
                className={classnames(
                  "py-2 px-4 rounded-full text-sm font-medium inline-flex items-center whitespace-nowrap",
                  activeSection === section.key ? "bg-primary text-white" : "bg-slate-100 text-slate-600 dark:bg-darkmode-400 dark:text-slate-300"
                )}
              >
                <Lucide icon={section.icon} className="w-4 h-4 mr-2" />
                {section.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="col-span-12 mt-2">
        {/* Company */}
        {activeSection === "company" && (
          <SectionCard title="Company Information" onSave={saveCompany} {...sectionProps("company")}>
            <Field label="ISP Name">{input(org, setO, "name")}</Field>
            <Field label="Owner Name">{input(org, setO, "owner_name")}</Field>
            <Field label="Business Registration Number">{input(org, setO, "registration_number")}</Field>
            <Field label="NTN">{input(org, setO, "ntn")}</Field>
            <Field label="STRN">{input(org, setO, "strn")}</Field>
            <Field label="Company Email">{input(org, setO, "email", { type: "email" })}</Field>
            <Field label="Support Email">{input(org, setO, "support_email", { type: "email" })}</Field>
            <Field label="Phone Number">{input(org, setO, "phone")}</Field>
            <Field label="WhatsApp Number">{input(org, setO, "whatsapp")}</Field>
            <Field label="Website">{input(org, setO, "website")}</Field>
            <Field span="col-span-12" label="Company Address">{input(org, setO, "address")}</Field>
            <Field span="col-span-12 sm:col-span-4" label="City">{input(org, setO, "city")}</Field>
            <Field span="col-span-12 sm:col-span-4" label="Province">
              <select className="form-select box w-full" disabled={!canEdit} value={org.province ?? ""} onChange={(e) => setO("province", e.target.value)}>
                <option value="">Select province</option>
                {(org.province && !PROVINCES.includes(org.province) ? [org.province, ...PROVINCES] : PROVINCES).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </Field>
            <Field span="col-span-12 sm:col-span-4" label="Country">{input(org, setO, "country")}</Field>
            <Field span="col-span-12" label="Company Logo">
              <div className="flex items-center gap-4">
                {org.logo_url ? (
                  <img src={org.logo_url} alt="Company logo" className="w-16 h-16 rounded-md object-cover border border-slate-200 dark:border-darkmode-400" />
                ) : (
                  <div className="w-16 h-16 rounded-md bg-slate-100 dark:bg-darkmode-400 flex items-center justify-center text-slate-400">
                    <Lucide icon="Users" className="w-6 h-6" />
                  </div>
                )}
                {canEdit && (
                  <label className={classnames("btn btn-outline-secondary cursor-pointer", uploading && "opacity-60 pointer-events-none")}>
                    {uploading ? "Uploading..." : "Upload Logo"}
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleLogoUpload} />
                  </label>
                )}
                <span className="text-xs text-slate-500">Max 2 MB.</span>
              </div>
            </Field>
          </SectionCard>
        )}

        {/* Billing */}
        {activeSection === "billing" && (
          <SectionCard title="Billing" onSave={() => saveSettings("billing", "Billing settings", BILLING_FIELDS)} {...sectionProps("billing")}>
            <div className="col-span-12 box p-3 bg-primary/10 text-sm flex items-start">
              <Lucide icon="AlertCircle" className="w-4 h-4 mr-2 mt-0.5 flex-none text-primary" />
              Invoices are generated every month on each subscriber's own activation date.
            </div>
            <Field label="Payment Due (Days after invoice)">{input(st, setS, "payment_due_days", { type: "number", min: 0 })}</Field>
            <Field label="Grace Period (Days)">{input(st, setS, "grace_period_days", { type: "number", min: 0 })}</Field>
            <Field label="Late Fee Amount (PKR)">{input(st, setS, "late_fee_amount", { type: "number", min: 0 })}</Field>
            <Field label="Currency">{select(st, setS, "currency", CURRENCIES)}</Field>
            <Field label="Invoice Prefix">{input(st, setS, "invoice_prefix")}</Field>
            <Field label="Receipt Prefix">{input(st, setS, "receipt_prefix")}</Field>
            <Field label="Installation Charges (PKR)">{input(st, setS, "installation_charges", { type: "number", min: 0 })}</Field>
            <Field label="Reconnect Charges (PKR)">{input(st, setS, "reconnect_charges", { type: "number", min: 0 })}</Field>
            <Field span="col-span-12" label="Reconnection fee">
              <Toggle disabled={!canEdit} checked={st.reconnect_fee_auto} onChange={(v) => setS("reconnect_fee_auto", v)} label="Charge a reconnection fee automatically when a suspended customer is switched back on" />
              <div className="text-xs text-slate-500 mt-1">Uses the reconnect charges amount above (currently PKR {Number(st.reconnect_charges || 0).toLocaleString()}). Nothing is charged when it is 0.</div>
            </Field>
            <Field label="Auto Suspend Overdue Customers">
              <Toggle disabled={!canEdit} checked={st.auto_suspend} onChange={(v) => setS("auto_suspend", v)} label={st.auto_suspend ? "Enabled" : "Disabled"} />
            </Field>
            {st.auto_suspend && <Field label="Suspension Days (after due date)">{input(st, setS, "suspension_days", { type: "number", min: 0 })}</Field>}
            <Field label="Allow Package Upgrade">
              <Toggle disabled={!canEdit} checked={st.allow_upgrade} onChange={(v) => setS("allow_upgrade", v)} label={st.allow_upgrade ? "Allowed" : "Not Allowed"} />
            </Field>
            <Field label="Allow Package Downgrade">
              <Toggle disabled={!canEdit} checked={st.allow_downgrade} onChange={(v) => setS("allow_downgrade", v)} label={st.allow_downgrade ? "Allowed" : "Not Allowed"} />
            </Field>
          </SectionCard>
        )}

        {/* Payments */}
        {activeSection === "payment" && (
          <SectionCard title="Payments" onSave={() => saveSettings("payment", "Payment settings", PAYMENT_FIELDS)} {...sectionProps("payment")}>
            <Field span="col-span-12" label="Accepted Payment Methods">
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-1">
                {Object.keys(PAYMENT_METHOD_LABELS).map((m) => (
                  <Toggle
                    key={m}
                    disabled={!canEdit}
                    checked={st.payment_methods?.[m]}
                    onChange={(v) => setS("payment_methods", { ...st.payment_methods, [m]: v })}
                    label={PAYMENT_METHOD_LABELS[m]}
                  />
                ))}
              </div>
            </Field>
            <Field span="col-span-12" label="How customers pay (shown to customers in their portal under 'How to pay')">
              <textarea
                className="form-control box w-full"
                rows={4}
                disabled={!canEdit}
                value={st.payment_instructions ?? ""}
                onChange={(e) => setS("payment_instructions", e.target.value)}
                placeholder="Pay at our office, to our collector, or by bank transfer / JazzCash / Easypaisa to account ... Send the receipt on WhatsApp ..."
              ></textarea>
            </Field>
            <Field label="Payment Confirmation Required">
              <Toggle disabled={!canEdit} checked={st.payment_confirmation_required} onChange={(v) => setS("payment_confirmation_required", v)} label={st.payment_confirmation_required ? "Required" : "Not Required"} />
            </Field>
            <Field label="Receipt Auto Generation">
              <Toggle disabled={!canEdit} checked={st.receipt_auto_generation} onChange={(v) => setS("receipt_auto_generation", v)} label={st.receipt_auto_generation ? "Enabled" : "Disabled"} />
            </Field>
          </SectionCard>
        )}

        {/* E-mail */}
        {activeSection === "email" && (
          <div className="space-y-6">
            <SectionCard
              title="E-mail"
              onSave={() => saveSettings("email", "E-mail settings", EMAIL_FIELDS)}
              {...sectionProps("email")}
              extra={
                <div className="mt-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" className="btn btn-outline-secondary" disabled={testing} onClick={sendTestEmail}>
                      <Lucide icon="PlayCircle" className="w-4 h-4 mr-2" /> {testing ? "Sending..." : "Send test e-mail"}
                    </button>
                    <span className="text-xs text-slate-500">Sent to {session?.user?.email}</span>
                  </div>
                  {testResult && (
                    <div className={classnames("mt-3 text-sm p-3 rounded-md", testResult.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
                      {testResult.text}
                    </div>
                  )}
                </div>
              }
            >
              <div className="col-span-12 box p-3 bg-primary/10 text-sm flex items-start">
                <Lucide icon="AlertCircle" className="w-4 h-4 mr-2 mt-0.5 flex-none text-primary" />
                The mail provider (Resend or SMTP) and its credentials are configured by the platform owner as server secrets, not here. You only choose how your e-mails appear to subscribers.
              </div>
              <Field label="Sender Name (shown in From:)">{input(st, setS, "sender_name")}</Field>
              <Field label="Sender E-mail">{input(st, setS, "sender_email", { type: "email" })}</Field>
              <Field label="Reply-to E-mail">{input(st, setS, "reply_to", { type: "email" })}</Field>
            </SectionCard>
            {isAdmin && <NotificationLogs refreshKey={logKey} />}
          </div>
        )}

        {/* Notifications */}
        {activeSection === "notifications" && (
          <SectionCard title="Notifications (e-mail)" onSave={() => saveSettings("notifications", "Notification settings", NOTIF_FIELDS)} {...sectionProps("notifications")}>
            {Object.entries(NOTIF_LABELS).map(([k, label]) => (
              <Field key={k} label={label}>
                <Toggle
                  disabled={!canEdit}
                  checked={st.notifications?.[k]}
                  onChange={(v) => setS("notifications", { ...st.notifications, [k]: v })}
                  label={st.notifications?.[k] ? "Enabled" : "Disabled"}
                />
              </Field>
            ))}
          </SectionCard>
        )}

        {activeSection === "areas" && <AreasSection canEdit={canEdit} />}
        {activeSection === "branches" && <BranchesSection canEdit={canEdit} />}

        {/* Security */}
        {activeSection === "security" && (
          <SectionCard
            title="Security"
            onSave={() => {
              if (Number(st.min_password_length) < 6) return setError("Minimum password length must be at least 6.");
              saveSettings("security", "Security settings", SECURITY_FIELDS);
            }}
            {...sectionProps("security")}
          >
            <Field label="Password Expiry (Days, 0 = never)">{input(st, setS, "password_expiry_days", { type: "number", min: 0 })}</Field>
            <Field label="Minimum Password Length">{input(st, setS, "min_password_length", { type: "number", min: 6 })}</Field>
            <Field label="Two Factor Authentication Required">
              <Toggle disabled={!canEdit} checked={st.two_factor_required} onChange={(v) => setS("two_factor_required", v)} label={st.two_factor_required ? "Required" : "Not required"} />
            </Field>
            <Field label="Session Timeout (Minutes)">{input(st, setS, "session_timeout_minutes", { type: "number", min: 1 })}</Field>
            <Field label="Maximum Login Attempts">{input(st, setS, "max_login_attempts", { type: "number", min: 1 })}</Field>
          </SectionCard>
        )}

        {activeSection === "reminders" && (
          <RemindersTab st={st} setS={setS} canEdit={canEdit} isAdmin={isAdmin} saveSettings={saveSettings} saving={saving === "reminders"} />
        )}
        {activeSection === "support" && <SupportTab canEdit={canEdit} />}
        {activeSection === "subscription" && isAdmin && <SubscriptionTab />}
        {activeSection === "audit" && isAdmin && <AuditTab />}
        {activeSection === "export" && isAdmin && <ExportTab canEdit={canEdit} />}

        {/* System + thresholds */}
        {activeSection === "system" && (
          <SectionCard title="System Preferences & Thresholds" onSave={() => saveSettings("system", "System preferences", SYSTEM_FIELDS)} {...sectionProps("system")}>
            <Field label="Timezone">{select(st, setS, "timezone", TIMEZONES)}</Field>
            <Field label="Date Format">{select(st, setS, "date_format", DATE_FORMATS)}</Field>
            <Field label="Time Format">{select(st, setS, "time_format", TIME_FORMATS)}</Field>
            <Field label="Language">{select(st, setS, "language", LANGUAGES)}</Field>
            <Field label="Theme">{select(st, setS, "theme", THEMES)}</Field>
            <Field label="Rows Per Page">{select(st, setS, "rows_per_page", [10, 25, 50, 100], true)}</Field>
            <Field label="Low Stock Threshold (units)">{input(st, setS, "low_stock_threshold", { type: "number", min: 0 })}</Field>
            <Field label="Default Low Wallet Threshold (PKR)">{input(st, setS, "low_wallet_threshold", { type: "number", min: 0 })}</Field>
          </SectionCard>
        )}
      </div>
    </div>
  );
}

export default Main;
