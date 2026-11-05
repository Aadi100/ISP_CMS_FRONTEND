import { Lucide } from "@/base-components";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import TemplatesEditor from "./TemplatesEditor";
import QueueTables from "./QueueTables";

const REMINDER_FIELDS = ["reminder_days_before", "overdue_reminder_every_days", "max_overdue_reminders", "notifications"];
const KIND_TOGGLES = {
  invoice_reminder: "Invoice due / overdue reminders",
  payment_confirmation: "Payment received e-mails",
  ticket_updates: "Ticket updates",
  installation_updates: "Installation updates",
  low_inventory_alert: "Low inventory alert",
  system_notifications: "System notifications",
};

function RemindersTab({ st, setS, canEdit, isAdmin, saveSettings, saving }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [refresh, setRefresh] = useState(0);

  const num = (k) => (
    <input
      type="number"
      min="0"
      className="form-control box w-full"
      disabled={!canEdit}
      value={st[k] ?? ""}
      onChange={(e) => setS(k, e.target.value === "" ? "" : Number(e.target.value))}
    />
  );

  const runNow = async () => {
    setRunning(true);
    setResult(null);
    try {
      const { data: queued, error: e1 } = await supabase.rpc("enqueue_my_reminders");
      if (e1) throw e1;
      let text = `${queued ?? 0} reminder(s) queued.`;
      const { data, error: e2 } = await supabase.functions.invoke("process-notifications", { body: {} });
      if (e2) {
        text += " The sender (process-notifications) could not be reached, so they will be sent by the scheduled job once it is deployed.";
        setResult({ ok: false, text });
      } else {
        text += ` Processed ${data?.processed ?? 0}: ${data?.sent ?? 0} sent, ${data?.failed ?? 0} failed, ${data?.skipped ?? 0} skipped.`;
        setResult({ ok: true, text });
      }
    } catch (e) {
      setResult({ ok: false, text: friendlyError(e) });
    } finally {
      setRunning(false);
      setRefresh((k) => k + 1);
    }
  };

  return (
    <div className="space-y-6">
      <div className="intro-y box p-5">
        <div className="text-base font-medium mb-4">Reminder schedule</div>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 sm:col-span-4">
            <label className="text-xs text-slate-500">Remind this many days before due date</label>
            <div className="mt-1">{num("reminder_days_before")}</div>
          </div>
          <div className="col-span-12 sm:col-span-4">
            <label className="text-xs text-slate-500">Repeat overdue reminder every (days)</label>
            <div className="mt-1">{num("overdue_reminder_every_days")}</div>
          </div>
          <div className="col-span-12 sm:col-span-4">
            <label className="text-xs text-slate-500">Maximum overdue reminders</label>
            <div className="mt-1">{num("max_overdue_reminders")}</div>
          </div>
          <div className="col-span-12">
            <label className="text-xs text-slate-500">E-mail kinds switched on</label>
            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-2">
              {Object.entries(KIND_TOGGLES).map(([k, label]) => (
                <label key={k} className="flex items-center select-none">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    disabled={!canEdit}
                    checked={!!st.notifications?.[k]}
                    onChange={(e) => setS("notifications", { ...st.notifications, [k]: e.target.checked })}
                  />
                  <span className="ml-2 text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 justify-end mt-6">
          {canEdit && (
            <button type="button" className="btn btn-outline-secondary" disabled={running} onClick={runNow}>
              <Lucide icon="Send" className="w-4 h-4 mr-2" /> {running ? "Working..." : "Send reminders now"}
            </button>
          )}
          {canEdit && (
            <button type="button" className="btn btn-primary shadow-md" disabled={saving} onClick={() => saveSettings("reminders", "Reminder settings", REMINDER_FIELDS)}>
              <Lucide icon="CheckCircle2" className="w-4 h-4 mr-2" /> {saving ? "Saving..." : "Save"}
            </button>
          )}
        </div>
        {result && (
          <div className={`mt-3 text-sm p-3 rounded-md ${result.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>{result.text}</div>
        )}
      </div>

      <TemplatesEditor canEdit={canEdit && isAdmin} />
      <QueueTables refreshKey={refresh} />
    </div>
  );
}

export default RemindersTab;
