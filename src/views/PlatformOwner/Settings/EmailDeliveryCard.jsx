import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { ErrorBanner, InfoBanner, edgeError } from "../shared";

const EMPTY = {
  primary_provider: "resend",
  resend_enabled: false,
  resend_from: "",
  has_resend_key: false,
  smtp_enabled: false,
  smtp_host: "",
  smtp_port: 587,
  smtp_secure: false,
  smtp_user: "",
  smtp_from: "",
  has_smtp_pass: false,
  updated_at: null,
};

function Switch({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" className="form-check-input" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="font-medium">{label}</span>
    </label>
  );
}

function EmailDeliveryCard() {
  const [saved, setSaved] = useState(EMPTY);
  const [form, setForm] = useState(EMPTY);
  const [resendKey, setResendKey] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [clearResend, setClearResend] = useState(false);
  const [clearSmtp, setClearSmtp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [to, setTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState("");
  const [testOk, setTestOk] = useState("");

  const apply = (s) => {
    const next = { ...EMPTY, ...s };
    setSaved(next);
    setForm(next);
    setResendKey("");
    setSmtpPass("");
    setClearResend(false);
    setClearSmtp(false);
  };

  useEffect(() => {
    (async () => {
      try {
        const { data, error: err } = await supabase.rpc("get_email_settings");
        if (err) throw err;
        apply(data || {});
      } catch (err) {
        setError(friendlyError(err));
      } finally {
        setLoading(false);
      }
    })();
    getSession().then((s) => setTo(s?.profile?.email || s?.user?.email || ""));
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    const p = {};
    const keys = [
      "primary_provider",
      "resend_enabled",
      "resend_from",
      "smtp_enabled",
      "smtp_host",
      "smtp_secure",
      "smtp_user",
      "smtp_from",
    ];
    keys.forEach((k) => {
      if (form[k] !== saved[k]) p[k] = form[k];
    });
    if (Number(form.smtp_port) !== Number(saved.smtp_port)) p.smtp_port = Number(form.smtp_port);
    if (resendKey) p.resend_api_key = resendKey;
    if (smtpPass) p.smtp_pass = smtpPass;
    if (clearResend) p.clear_resend_key = true;
    if (clearSmtp) p.clear_smtp_pass = true;
    if (Object.keys(p).length === 0) {
      setNotice("Nothing to save.");
      return;
    }
    setSaving(true);
    try {
      const { data, error: err } = await supabase.rpc("save_email_settings", { p_settings: p });
      if (err) throw err;
      apply(data || {});
      setNotice("E-mail settings saved.");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTestError("");
    setTestOk("");
    if (!to.trim()) return setTestError("Enter a recipient e-mail.");
    setTesting(true);
    try {
      const { data, error: err } = await supabase.functions.invoke("send-notification", {
        body: { to: to.trim(), subject: "Test e-mail", message: "This is a test from your ISP CMS platform." },
      });
      if (err) {
        setTestError(await edgeError(err, friendlyError));
        return;
      }
      if (data?.error) {
        setTestError(data.error);
        return;
      }
      setTestOk(`Sent via ${data?.provider || data?.via || "the configured provider"} to ${to.trim()}.`);
    } catch (err) {
      setTestError(friendlyError(err));
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="box p-5 text-slate-500">Loading e-mail settings...</div>;
  }

  return (
    <div className="space-y-5">
      <form onSubmit={save} className="space-y-5">
        <div className="box p-5">
          <h3 className="text-base font-medium mb-2">E-mail delivery</h3>
          <div className="text-sm text-slate-600 mb-4">
            E-mail only (invitations, invoices, reminders) - there is no SMS. Secrets are write-only: they are never
            shown again after saving. If nothing is switched on here, the server-side secrets (
            <code>EMAIL_PROVIDER</code>, <code>RESEND_API_KEY</code>, <code>SMTP_*</code>) are used as a fallback.
          </div>
          <ErrorBanner message={error} onClose={() => setError("")} />
          <InfoBanner message={notice} onClose={() => setNotice("")} />

          <label className="form-label">Primary provider</label>
          <select
            className="form-select"
            value={form.primary_provider}
            onChange={(e) => set("primary_provider", e.target.value)}
          >
            <option value="resend">Resend</option>
            <option value="smtp">Custom SMTP</option>
          </select>
          <div className="text-slate-500 text-xs mt-1">
            The primary provider is tried first; the other one, if enabled, is the automatic fallback. If both are off,
            e-mail is disabled.
          </div>
          {saved.updated_at && (
            <div className="text-slate-500 text-xs mt-2">Last updated {formatDateTime(saved.updated_at)}</div>
          )}
        </div>

        <div className="box p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-medium">Resend</h3>
            <Switch checked={form.resend_enabled} onChange={(v) => set("resend_enabled", v)} label={form.resend_enabled ? "On" : "Off"} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">API key</label>
              <input
                type="password"
                autoComplete="new-password"
                className="form-control"
                placeholder={saved.has_resend_key ? "saved - leave empty to keep" : "re_..."}
                value={resendKey}
                onChange={(e) => setResendKey(e.target.value)}
              />
              {saved.has_resend_key && (
                <label className="flex items-center gap-2 text-xs mt-1">
                  <input type="checkbox" className="form-check-input" checked={clearResend} onChange={(e) => setClearResend(e.target.checked)} />
                  Remove the saved key
                </label>
              )}
            </div>
            <div>
              <label className="form-label">From address</label>
              <input
                className="form-control"
                placeholder="ISP CMS <billing@yourdomain.com>"
                value={form.resend_from}
                onChange={(e) => set("resend_from", e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="box p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-medium">Custom SMTP</h3>
            <Switch checked={form.smtp_enabled} onChange={(v) => set("smtp_enabled", v)} label={form.smtp_enabled ? "On" : "Off"} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">Host</label>
              <input className="form-control" placeholder="smtp.example.com" value={form.smtp_host} onChange={(e) => set("smtp_host", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Port</label>
              <input type="number" min="1" className="form-control" value={form.smtp_port} onChange={(e) => set("smtp_port", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Switch checked={form.smtp_secure} onChange={(v) => set("smtp_secure", v)} label="Use SSL/TLS (port 465)" />
              <div className="text-slate-500 text-xs mt-1">Off = STARTTLS (usually port 587).</div>
            </div>
            <div>
              <label className="form-label">Username</label>
              <input autoComplete="off" className="form-control" value={form.smtp_user} onChange={(e) => set("smtp_user", e.target.value)} />
            </div>
            <div>
              <label className="form-label">Password</label>
              <input
                type="password"
                autoComplete="new-password"
                className="form-control"
                placeholder={saved.has_smtp_pass ? "saved - leave empty to keep" : ""}
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
              />
              {saved.has_smtp_pass && (
                <label className="flex items-center gap-2 text-xs mt-1">
                  <input type="checkbox" className="form-check-input" checked={clearSmtp} onChange={(e) => setClearSmtp(e.target.checked)} />
                  Remove the saved password
                </label>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="form-label">From address</label>
              <input
                className="form-control"
                placeholder="ISP CMS <billing@yourdomain.com>"
                value={form.smtp_from}
                onChange={(e) => set("smtp_from", e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save e-mail settings"}
          </button>
        </div>
      </form>

      <div className="box p-5">
        <h3 className="text-base font-medium mb-2">Send test e-mail</h3>
        <div className="text-slate-500 text-xs mb-3">Save your settings first, then send a test to check delivery.</div>
        <ErrorBanner message={testError} onClose={() => setTestError("")} />
        <InfoBanner message={testOk} onClose={() => setTestOk("")} />
        <div className="flex flex-col sm:flex-row gap-3">
          <input type="email" className="form-control" placeholder="recipient@example.com" value={to} onChange={(e) => setTo(e.target.value)} />
          <button type="button" className="btn btn-outline-primary whitespace-nowrap" disabled={testing} onClick={sendTest}>
            {testing ? "Sending..." : "Send test e-mail"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default EmailDeliveryCard;
