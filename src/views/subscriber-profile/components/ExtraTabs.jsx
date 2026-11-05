import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Lucide } from "@/base-components";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, formatDate, formatDateTime, titleCase } from "@/lib/format";
import {
  TableShell,
  useTabData,
} from "@/views/subscribers/components/SubscriberDetail";

/** Advance credit, credit applied to invoices, and promised payment dates. */
export function CreditPromisesTab({ sub }) {
  const promises = useTabData(async () => {
    const { data, error } = await supabase
      .from("v_invoice_summary")
      .select("id, invoice_number, due_date, promised_date, balance_due, payment_status")
      .eq("subscriber_id", sub.id)
      .not("promised_date", "is", null)
      .gt("balance_due", 0)
      .order("promised_date", { ascending: true })
      .limit(50);
    if (error) throw error;
    return data || [];
  }, [sub.id]);

  const credit = useTabData(async () => {
    const { data, error } = await supabase
      .from("v_payment_ledger")
      .select("id, receipt_number, paid_at, method, amount, refunded_amount, invoice_number, invoice_id, status")
      .eq("subscriber_id", sub.id)
      .or("invoice_id.is.null,method.eq.advance_credit")
      .order("paid_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data || [];
  }, [sub.id]);

  return (
    <div className="space-y-6">
      <div className="box p-4 flex items-center">
        <Lucide icon="Wallet" className="w-6 h-6 mr-3 text-primary" />
        <div>
          <div className="text-xs text-slate-500">Advance credit balance</div>
          <div className="text-lg font-medium">{money(sub.credit_balance)}</div>
        </div>
      </div>
      <div>
        <div className="font-medium mb-2">Advance payments and credit applied</div>
        <TableShell
          state={credit}
          empty="No advance payments or applied credit."
          headers={["Receipt", "Date", "Type", "Invoice", "Amount", "Refunded"]}
        >
          {(credit.rows || []).map((p) => (
            <tr key={p.id}>
              <td className="whitespace-nowrap font-medium">{p.receipt_number}</td>
              <td className="whitespace-nowrap">{formatDateTime(p.paid_at)}</td>
              <td>{p.method === "advance_credit" ? "Credit applied" : "Advance payment"}</td>
              <td>{p.invoice_number || "-"}</td>
              <td className="whitespace-nowrap">{money(p.amount)}</td>
              <td>{Number(p.refunded_amount) > 0 ? money(p.refunded_amount) : "-"}</td>
            </tr>
          ))}
        </TableShell>
      </div>
      <div>
        <div className="font-medium mb-2">Payment promises (open balance with a promised date)</div>
        <TableShell
          state={promises}
          empty="No open promises."
          headers={["Invoice", "Due", "Promised for", "Balance", "Status"]}
        >
          {(promises.rows || []).map((i) => (
            <tr key={i.id}>
              <td className="whitespace-nowrap font-medium">{i.invoice_number}</td>
              <td className="whitespace-nowrap">{formatDate(i.due_date)}</td>
              <td className="whitespace-nowrap">{formatDate(i.promised_date)}</td>
              <td className="whitespace-nowrap">{money(i.balance_due)}</td>
              <td>{titleCase(i.payment_status)}</td>
            </tr>
          ))}
        </TableShell>
      </div>
      <div className="text-xs text-slate-500">
        Promises and advance payments are recorded on the{" "}
        <Link to="/payments" className="text-primary">
          Payments page
        </Link>
        .
      </div>
    </div>
  );
}

/** Audit trail for this subscriber (ISP admin only). */
export function ActivityTab({ sub }) {
  const state = useTabData(async () => {
    const { data, error } = await supabase
      .from("v_audit_log")
      .select("id, action, actor_name, actor_email, created_at, old_data, new_data")
      .eq("table_name", "subscribers")
      .eq("record_id", sub.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data || [];
  }, [sub.id]);

  const changed = (r) => {
    if (r.action !== "UPDATE" || !r.old_data || !r.new_data) return titleCase(r.action);
    const keys = Object.keys(r.new_data).filter(
      (k) =>
        k !== "updated_at" &&
        JSON.stringify(r.new_data[k]) !== JSON.stringify(r.old_data[k])
    );
    return keys.length ? keys.map(titleCase).join(", ") : "Updated";
  };

  return (
    <TableShell
      state={state}
      empty="No recorded activity."
      headers={["When", "Action", "Changed", "By"]}
    >
      {(state.rows || []).map((r) => (
        <tr key={r.id}>
          <td className="whitespace-nowrap">{formatDateTime(r.created_at)}</td>
          <td>{titleCase(r.action.toLowerCase())}</td>
          <td>{changed(r)}</td>
          <td className="whitespace-nowrap">{r.actor_name || r.actor_email || "System"}</td>
        </tr>
      ))}
    </TableShell>
  );
}

async function functionErrorText(error) {
  try {
    const body = await error.context.json();
    return body?.error || body?.message || error.message;
  } catch {
    return error.message;
  }
}

/** Customer portal login: show the existing one or invite a new one. */
export function PortalLoginTab({ sub }) {
  const [login, setLogin] = useState(undefined);
  const [roleId, setRoleId] = useState(null);
  const [email, setEmail] = useState(sub.email || "");
  const [name, setName] = useState(sub.full_name || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const load = async () => {
    const { data, error: err } = await supabase
      .from("profiles")
      .select("id, email, full_name, status")
      .eq("subscriber_id", sub.id)
      .maybeSingle();
    if (err) {
      setError(friendlyError(err));
      setLogin(null);
    } else setLogin(data);
  };

  useEffect(() => {
    load();
    supabase
      .from("roles")
      .select("id")
      .eq("name", "Customer")
      .maybeSingle()
      .then(({ data }) => setRoleId(data?.id || null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub.id]);

  const create = async () => {
    setError("");
    setDone("");
    if (!email.trim()) return setError("E-mail is required.");
    if (!roleId) return setError("The 'Customer' role was not found for this ISP.");
    setBusy(true);
    try {
      const { error: err } = await supabase.functions.invoke("invite-employee", {
        body: {
          email: email.trim(),
          full_name: name.trim(),
          role: "isp_staff",
          role_id: roleId,
          subscriber_id: sub.id,
        },
      });
      if (err) throw new Error(await functionErrorText(err));
      setDone(`Invitation sent to ${email.trim()}.`);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="alert alert-outline-primary show flex items-start text-sm mb-4">
        <Lucide icon="Info" className="w-5 h-5 mr-2 flex-none" />
        The customer receives an e-mail to set a password and can then see their own bills,
        payments and tickets at /customer-portal.
      </div>
      {error && <div className="alert alert-danger show mb-3">{error}</div>}
      {done && <div className="alert alert-outline-success show mb-3">{done}</div>}
      {login === undefined ? (
        <div className="text-slate-500">Loading...</div>
      ) : login ? (
        <div className="box p-4">
          <div className="text-xs text-slate-500">Existing portal login</div>
          <div className="font-medium mt-1">{login.email}</div>
          <div className="text-sm text-slate-500 mt-1">Status: {titleCase(login.status)}</div>
        </div>
      ) : (
        <div className="box p-4 space-y-3">
          <div className="font-medium">Create customer portal login</div>
          <div>
            <label className="form-label">E-mail</label>
            <input type="email" className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Name</label>
            <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={create}>
            {busy ? "Sending..." : "Create portal login"}
          </button>
        </div>
      )}
    </div>
  );
}
