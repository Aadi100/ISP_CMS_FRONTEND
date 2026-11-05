import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import classnames from "classnames";
import { Lucide } from "@/base-components";
import { supabase } from "@/lib/supabase";
import { can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { money, formatDate, formatDateTime, titleCase } from "@/lib/format";
import { billingDayText } from "./SubscriberForm";
import PackageSection from "./PackageSection";
import DiscountsTab from "./DiscountsTab";
import AddonsTab from "./AddonsTab";

const TABS = [
  ["overview", "Overview"],
  ["invoices", "Invoices"],
  ["payments", "Payments"],
  ["discounts", "Discounts"],
  ["addons", "Add-ons"],
  ["inventory", "Inventory & Installations"],
  ["tickets", "Tickets"],
  ["documents", "Documents"],
];

const DOC_TYPES = [
  "cnic_front",
  "cnic_back",
  "agreement",
  "utility_bill",
  "photo",
  "other",
];

const BADGE = {
  active: "bg-success/20 text-success",
  paid: "bg-success/20 text-success",
  completed: "bg-success/20 text-success",
  confirmed: "bg-success/20 text-success",
  resolved: "bg-success/20 text-success",
  closed: "bg-slate-200 text-slate-500",
  pending: "bg-pending/20 text-pending",
  planned: "bg-pending/20 text-pending",
  unpaid: "bg-pending/20 text-pending",
  open: "bg-pending/20 text-pending",
  partial: "bg-warning/20 text-warning",
  in_progress: "bg-warning/20 text-warning",
  assigned: "bg-warning/20 text-warning",
  suspended: "bg-warning/20 text-warning",
  overdue: "bg-danger/20 text-danger",
  terminated: "bg-danger/20 text-danger",
  rejected: "bg-danger/20 text-danger",
  cancelled: "bg-danger/20 text-danger",
  refunded: "bg-danger/20 text-danger",
};

function Badge({ value }) {
  return (
    <span
      className={classnames(
        "py-1 px-2 rounded-full text-xs font-medium whitespace-nowrap",
        BADGE[value] || "bg-slate-100 text-slate-500"
      )}
    >
      {value === "pending" ? "Pending" : titleCase(value)}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 break-words">{children || "—"}</div>
    </div>
  );
}

/** Loads rows for one tab when it is first shown. */
function useTabData(loader, deps) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    setError("");
    try {
      setRows(await loader());
    } catch (err) {
      setError(friendlyError(err));
      setRows([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    setRows(null);
    reload();
  }, [reload]);
  return { rows, error, reload };
}

function TableShell({ state, empty, headers, children }) {
  if (state.error)
    return (
      <div className="alert alert-danger show flex items-center">
        <Lucide icon="AlertCircle" className="w-5 h-5 mr-2" />
        {state.error}
      </div>
    );
  if (state.rows === null)
    return (
      <div className="p-8 text-center text-slate-500">
        <Lucide icon="Loader" className="w-6 h-6 mx-auto mb-2 animate-spin" />
        Loading...
      </div>
    );
  if (state.rows.length === 0)
    return <div className="p-8 text-center text-slate-500">{empty}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="table w-full">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} className="whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function InvoicesTab({ sub }) {
  const [open, setOpen] = useState(null);
  const state = useTabData(async () => {
    const { data, error } = await supabase
      .from("v_invoice_summary")
      .select(
        "id, invoice_number, invoice_type, billing_month, due_date, promised_date, amount, amount_paid, balance_due, payment_status, invoice_status"
      )
      .eq("subscriber_id", sub.id)
      .order("billing_month", { ascending: false })
      .limit(100);
    if (error) throw error;
    const list = data || [];
    // line_items is not exposed by the view; read it from the table.
    if (list.length) {
      const { data: li } = await supabase
        .from("invoices")
        .select("id, line_items")
        .in("id", list.map((i) => i.id));
      const map = Object.fromEntries((li || []).map((r) => [r.id, r.line_items]));
      list.forEach((i) => {
        i.line_items = map[i.id];
      });
    }
    return list;
  }, [sub.id]);
  return (
    <TableShell
      state={state}
      empty="No invoices for this subscriber yet."
      headers={["Invoice", "Month", "Due", "Promised", "Amount", "Paid", "Balance", "Status"]}
    >
      {(state.rows || []).flatMap((i) => {
        const items = Array.isArray(i.line_items) ? i.line_items : [];
        const row = (
          <tr
            key={i.id}
            className={items.length ? "cursor-pointer" : ""}
            onClick={() => items.length && setOpen(open === i.id ? null : i.id)}
          >
            <td className="whitespace-nowrap font-medium">
              {items.length > 0 && (
                <Lucide
                  icon={open === i.id ? "ChevronDown" : "ChevronRight"}
                  className="w-4 h-4 inline mr-1"
                />
              )}
              {i.invoice_number}
            </td>
            <td className="whitespace-nowrap">{formatDate(i.billing_month)}</td>
            <td className="whitespace-nowrap">{formatDate(i.due_date)}</td>
            <td className="whitespace-nowrap">{formatDate(i.promised_date)}</td>
            <td className="whitespace-nowrap">{money(i.amount)}</td>
            <td className="whitespace-nowrap">{money(i.amount_paid)}</td>
            <td className="whitespace-nowrap font-medium">{money(i.balance_due)}</td>
            <td>
              <Badge value={i.invoice_status === "cancelled" ? "cancelled" : i.payment_status} />
            </td>
          </tr>
        );
        if (open !== i.id || !items.length) return [row];
        return [
          row,
          <tr key={`${i.id}-items`}>
            <td colSpan={8} className="bg-slate-50 dark:bg-darkmode-700">
              {items.map((li, idx) => (
                <div key={idx} className="flex justify-between max-w-md text-sm py-0.5">
                  <span>{li.label}</span>
                  <span className={Number(li.amount) < 0 ? "text-success" : ""}>{money(li.amount)}</span>
                </div>
              ))}
            </td>
          </tr>,
        ];
      })}
    </TableShell>
  );
}

function PaymentsTab({ sub }) {
  const state = useTabData(async () => {
    const { data, error } = await supabase
      .from("v_payment_ledger")
      .select(
        "id, receipt_number, paid_at, invoice_number, method, amount, refunded_amount, status"
      )
      .eq("subscriber_id", sub.id)
      .order("paid_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data || [];
  }, [sub.id]);
  return (
    <>
      <div className="box p-4 mb-4 flex items-center">
        <Lucide icon="Wallet" className="w-6 h-6 mr-3 text-primary" />
        <div>
          <div className="text-xs text-slate-500">Advance credit balance</div>
          <div className="text-lg font-medium">{money(sub.credit_balance)}</div>
        </div>
      </div>
      <TableShell
        state={state}
        empty="No payments recorded yet."
        headers={["Receipt", "Date", "Invoice", "Method", "Amount", "Refunded", "Status"]}
      >
        {(state.rows || []).map((p) => (
          <tr key={p.id}>
            <td className="whitespace-nowrap font-medium">{p.receipt_number}</td>
            <td className="whitespace-nowrap">{formatDateTime(p.paid_at)}</td>
            <td className="whitespace-nowrap">{p.invoice_number || "Advance"}</td>
            <td className="whitespace-nowrap">{titleCase(p.method)}</td>
            <td className="whitespace-nowrap">{money(p.amount)}</td>
            <td className="whitespace-nowrap">
              {Number(p.refunded_amount) > 0 ? money(p.refunded_amount) : "—"}
            </td>
            <td>
              <Badge value={p.status} />
            </td>
          </tr>
        ))}
      </TableShell>
    </>
  );
}

function InventoryTab({ sub }) {
  const history = useTabData(async () => {
    const { data, error } = await supabase
      .from("v_subscriber_inventory_history")
      .select("*")
      .eq("subscriber_id", sub.id)
      .order("occurred_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data || [];
  }, [sub.id]);
  const installs = useTabData(async () => {
    const { data, error } = await supabase
      .from("v_installation_overview")
      .select(
        "id, installation_number, status, scheduled_at, completed_at, technician_name, materials_count, equipment_count, installation_fee"
      )
      .eq("subscriber_id", sub.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data || [];
  }, [sub.id]);
  return (
    <div className="space-y-6">
      <div>
        <div className="font-medium mb-2">Materials used and equipment (newest first)</div>
        <TableShell
          state={history}
          empty="No materials or equipment recorded for this subscriber."
          headers={["Date", "Type", "Item", "Qty", "Action", "Reference", "Technician"]}
        >
          {(history.rows || []).map((h, idx) => (
            <tr key={`${h.occurred_at}-${idx}`}>
              <td className="whitespace-nowrap">{formatDateTime(h.occurred_at)}</td>
              <td className="whitespace-nowrap">{titleCase(h.kind)}</td>
              <td>{h.item_name}</td>
              <td className="whitespace-nowrap">
                {Number(h.quantity)} {h.unit}
              </td>
              <td className="whitespace-nowrap">{titleCase(h.action)}</td>
              <td className="whitespace-nowrap">{h.reference || "—"}</td>
              <td className="whitespace-nowrap">{h.technician_name || "—"}</td>
            </tr>
          ))}
        </TableShell>
      </div>
      <div>
        <div className="font-medium mb-2">Installation jobs</div>
        <TableShell
          state={installs}
          empty="No installation jobs for this subscriber."
          headers={["Job", "Status", "Scheduled", "Completed", "Technician", "Materials", "Equipment", "Fee"]}
        >
          {(installs.rows || []).map((n) => (
            <tr key={n.id}>
              <td className="whitespace-nowrap font-medium">{n.installation_number}</td>
              <td>
                <Badge value={n.status} />
              </td>
              <td className="whitespace-nowrap">{formatDateTime(n.scheduled_at)}</td>
              <td className="whitespace-nowrap">{formatDateTime(n.completed_at)}</td>
              <td className="whitespace-nowrap">{n.technician_name || "—"}</td>
              <td>{n.materials_count}</td>
              <td>{n.equipment_count}</td>
              <td className="whitespace-nowrap">{money(n.installation_fee)}</td>
            </tr>
          ))}
        </TableShell>
      </div>
    </div>
  );
}

function TicketsTab({ sub }) {
  const state = useTabData(async () => {
    const { data, error } = await supabase
      .from("v_ticket_overview")
      .select("id, ticket_number, category, priority, status, technician_name, created_at")
      .eq("subscriber_id", sub.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data || [];
  }, [sub.id]);
  return (
    <TableShell
      state={state}
      empty="No tickets for this subscriber."
      headers={["Ticket", "Category", "Priority", "Status", "Technician", "Created"]}
    >
      {(state.rows || []).map((t) => (
        <tr key={t.id}>
          <td className="whitespace-nowrap font-medium">{t.ticket_number}</td>
          <td className="whitespace-nowrap">{titleCase(t.category)}</td>
          <td className="whitespace-nowrap">{titleCase(t.priority)}</td>
          <td>
            <Badge value={t.status} />
          </td>
          <td className="whitespace-nowrap">{t.technician_name || "—"}</td>
          <td className="whitespace-nowrap">{formatDateTime(t.created_at)}</td>
        </tr>
      ))}
    </TableShell>
  );
}

function DocumentsTab({ sub, session }) {
  const [docType, setDocType] = useState("cnic_front");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const canEdit = can(session, "subscribers", "edit");

  const state = useTabData(async () => {
    const { data, error } = await supabase
      .from("subscriber_documents")
      .select("id, doc_type, file_name, storage_path, created_at")
      .eq("subscriber_id", sub.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }, [sub.id]);

  const view = async (doc) => {
    setMsg("");
    const { data, error } = await supabase.storage
      .from("subscriber-documents")
      .createSignedUrl(doc.storage_path, 60);
    if (error) return setMsg(friendlyError(error));
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const upload = async () => {
    if (!file) return setMsg("Choose a file first.");
    setBusy(true);
    setMsg("");
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${session.orgId}/${sub.id}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from("subscriber-documents")
        .upload(path, file);
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("subscriber_documents").insert({
        subscriber_id: sub.id,
        doc_type: docType,
        file_name: file.name,
        storage_path: path,
      });
      if (insErr) {
        await supabase.storage.from("subscriber-documents").remove([path]);
        throw insErr;
      }
      setFile(null);
      await state.reload();
    } catch (err) {
      setMsg(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (doc) => {
    if (!window.confirm(`Delete ${doc.file_name}?`)) return;
    setBusy(true);
    setMsg("");
    try {
      const { error } = await supabase.from("subscriber_documents").delete().eq("id", doc.id);
      if (error) throw error;
      await supabase.storage.from("subscriber-documents").remove([doc.storage_path]);
      await state.reload();
    } catch (err) {
      setMsg(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {msg && (
        <div className="alert alert-danger show flex items-center mb-3">
          <Lucide icon="AlertCircle" className="w-5 h-5 mr-2" />
          {msg}
        </div>
      )}
      {canEdit && (
        <div className="flex flex-wrap items-end gap-2 mb-4">
          <div>
            <label className="text-xs text-slate-500">Type</label>
            <select
              className="form-select mt-1"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            >
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {titleCase(t)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">File</label>
            <input
              type="file"
              className="form-control mt-1"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !file}
            onClick={upload}
          >
            <Lucide icon="Upload" className="w-4 h-4 mr-2" />
            {busy ? "Working..." : "Upload"}
          </button>
        </div>
      )}
      <TableShell
        state={state}
        empty="No documents uploaded."
        headers={["Type", "File", "Uploaded", ""]}
      >
        {(state.rows || []).map((d) => (
          <tr key={d.id}>
            <td className="whitespace-nowrap">{titleCase(d.doc_type)}</td>
            <td>{d.file_name}</td>
            <td className="whitespace-nowrap">{formatDateTime(d.created_at)}</td>
            <td className="whitespace-nowrap text-right">
              <button type="button" className="btn btn-sm btn-outline-secondary mr-2" onClick={() => view(d)}>
                View
              </button>
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  disabled={busy}
                  onClick={() => remove(d)}
                >
                  Delete
                </button>
              )}
            </td>
          </tr>
        ))}
      </TableShell>
    </>
  );
}

function OverviewTab({ sub, session, onChanged }) {
  const [collector, setCollector] = useState("");
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("subscribers")
        .select("collector_id")
        .eq("id", sub.id)
        .maybeSingle();
      if (!data?.collector_id) return setCollector("");
      const { data: e } = await supabase
        .from("employees")
        .select("full_name")
        .eq("id", data.collector_id)
        .maybeSingle();
      setCollector(e?.full_name || "");
    })();
  }, [sub.id]);
  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 sm:col-span-6 lg:col-span-4">
        <Field label="Subscriber ID">{sub.subscriber_code}</Field>
      </div>
      <div className="col-span-12 sm:col-span-6 lg:col-span-4">
        <Field label="Phone">{sub.phone}</Field>
      </div>
      <div className="col-span-12 sm:col-span-6 lg:col-span-4">
        <Field label="Email">{sub.email}</Field>
      </div>
      <div className="col-span-12 sm:col-span-6 lg:col-span-4">
        <Field label="CNIC">{sub.cnic}</Field>
      </div>
      <div className="col-span-12 sm:col-span-6 lg:col-span-8">
        <Field label="Address">{sub.address}</Field>
      </div>
      <div className="col-span-12 sm:col-span-6 lg:col-span-4">
        <Field label="Area">{sub.area_name}</Field>
      </div>
      <div className="col-span-12 sm:col-span-6 lg:col-span-4">
        <Field label="Branch">{sub.branch_name}</Field>
      </div>
      <div className="col-span-12 sm:col-span-6 lg:col-span-4">
        <Field label="Reseller">{sub.reseller_name}</Field>
      </div>
      <div className="col-span-12 sm:col-span-6 lg:col-span-4">
        <Field label="Collector">{collector}</Field>
      </div>
      <div className="col-span-12 sm:col-span-6 lg:col-span-4">
        <Field label="Package">
          {sub.package_name
            ? `${sub.package_name} (${sub.package_download_speed}/${sub.package_upload_speed} Mbps)`
            : null}
        </Field>
      </div>
      <div className="col-span-12 sm:col-span-6 lg:col-span-4">
        <Field label="Monthly fee">{money(sub.monthly_fee)}</Field>
      </div>
      <div className="col-span-12 sm:col-span-6 lg:col-span-4">
        <Field label="Outstanding balance">{money(sub.outstanding_balance)}</Field>
      </div>
      <div className="col-span-12 sm:col-span-6 lg:col-span-4">
        <Field label="Advance credit">{money(sub.credit_balance)}</Field>
      </div>
      <div className="col-span-12 sm:col-span-6 lg:col-span-4">
        <Field label="Connection type">{titleCase(sub.connection_type)}</Field>
      </div>
      <div className="col-span-12 sm:col-span-6 lg:col-span-4">
        <Field label="PPPoE username">{sub.pppoe_username}</Field>
      </div>
      <div className="col-span-12 sm:col-span-6 lg:col-span-4">
        <Field label="Installation date">{formatDate(sub.installation_date)}</Field>
      </div>
      <div className="col-span-12 sm:col-span-6 lg:col-span-4">
        <Field label="Installation location">{sub.installation_location}</Field>
      </div>
      <div className="col-span-12 sm:col-span-6 lg:col-span-4">
        <Field label="Coordinates">
          {sub.latitude !== null && sub.longitude !== null
            ? `${sub.latitude}, ${sub.longitude}`
            : null}
        </Field>
      </div>
      <div className="col-span-12 sm:col-span-6 lg:col-span-4">
        <Field label="Activated">{formatDate(sub.activated_at)}</Field>
      </div>
      {sub.suspended_at && (
        <div className="col-span-12 sm:col-span-6 lg:col-span-4">
          <Field label="Suspended">{formatDate(sub.suspended_at)}</Field>
        </div>
      )}
      {sub.terminated_at && (
        <div className="col-span-12 sm:col-span-6 lg:col-span-4">
          <Field label="Terminated">{formatDate(sub.terminated_at)}</Field>
        </div>
      )}
      <div className="col-span-12">
        <Field label="Notes">{sub.notes}</Field>
      </div>
      <div className="col-span-12 text-sm text-slate-500">
        {sub.connection_status === "active" && sub.billing_anchor_date
          ? billingDayText(sub.billing_anchor_date)
          : "Billing happens every month on the activation date."}
      </div>
      <PackageSection sub={sub} session={session} onChanged={onChanged} />
    </div>
  );
}

function SubscriberDetail({ subscriber, session, onClose, onEdit, onChanged }) {
  const [tab, setTab] = useState("overview");
  const navigate = useNavigate();
  const canEdit = can(session, "subscribers", "edit");

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
      <div className="relative bg-white dark:bg-darkmode-600 w-full max-w-4xl h-full overflow-y-auto shadow-xl">
        <div className="flex items-start px-5 py-4 border-b border-slate-200 dark:border-darkmode-400">
          <div>
            <h3 className="text-lg font-medium">{subscriber.full_name}</h3>
            <div className="text-slate-500 text-xs mt-1 flex items-center gap-2">
              <span>{subscriber.subscriber_code}</span>
              <Badge value={subscriber.connection_status} />
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {canEdit && (
              <button type="button" className="btn btn-outline-secondary" onClick={() => onEdit(subscriber)}>
                <Lucide icon="Pencil" className="w-4 h-4 mr-2" />
                Edit
              </button>
            )}
            {can(session, "payments", "view") && (
              <button type="button" className="btn btn-outline-secondary" onClick={() => navigate("/payments")}>
                Payments page
              </button>
            )}
            {can(session, "inventory", "view") && (
              <button type="button" className="btn btn-outline-secondary" onClick={() => navigate("/inventory")}>
                Inventory page
              </button>
            )}
            <button type="button" onClick={onClose} className="text-slate-500 hover:text-danger ml-2">
              <Lucide icon="X" className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 px-5 pt-3 border-b border-slate-200 dark:border-darkmode-400">
          {TABS.map(([key, text]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={classnames("px-3 py-2 text-sm -mb-px border-b-2", {
                "border-primary text-primary font-medium": tab === key,
                "border-transparent text-slate-500 hover:text-slate-700": tab !== key,
              })}
            >
              {text}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === "overview" && <OverviewTab sub={subscriber} session={session} onChanged={onChanged} />}
          {tab === "invoices" && <InvoicesTab sub={subscriber} />}
          {tab === "payments" && <PaymentsTab sub={subscriber} />}
          {tab === "discounts" && <DiscountsTab sub={subscriber} session={session} />}
          {tab === "addons" && <AddonsTab sub={subscriber} session={session} />}
          {tab === "inventory" && <InventoryTab sub={subscriber} />}
          {tab === "tickets" && <TicketsTab sub={subscriber} />}
          {tab === "documents" && <DocumentsTab sub={subscriber} session={session} />}
        </div>
      </div>
    </div>
  );
}

export default SubscriberDetail;
