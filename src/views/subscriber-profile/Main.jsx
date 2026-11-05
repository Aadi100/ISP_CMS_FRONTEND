import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import classnames from "classnames";
import { Lucide } from "@/base-components";
import { supabase } from "@/lib/supabase";
import { getSession, can } from "@/lib/session";
import { friendlyError } from "@/lib/errors";
import { money } from "@/lib/format";
import {
  OverviewTab,
  InvoicesTab,
  PaymentsTab,
  InventoryTab,
  TicketsTab,
  DocumentsTab,
} from "@/views/subscribers/components/SubscriberDetail";
import DiscountsTab from "@/views/subscribers/components/DiscountsTab";
import AddonsTab from "@/views/subscribers/components/AddonsTab";
import { billingDayText } from "@/views/subscribers/components/SubscriberForm";
import { CreditPromisesTab, ActivityTab, PortalLoginTab } from "./components/ExtraTabs";
import { printProfile } from "./components/printProfile";

const STATUS_LABELS = {
  active: "Active",
  pending: "Pending Installation",
  suspended: "Suspended",
  terminated: "Terminated",
};
const STATUS_BADGE = {
  active: "bg-success/20 text-success",
  pending: "bg-pending/20 text-pending",
  suspended: "bg-warning/20 text-warning",
  terminated: "bg-danger/20 text-danger",
};

function Item({ label, children }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 break-words">{children || "-"}</div>
    </div>
  );
}

function Main() {
  const { id } = useParams();
  const [session, setSession] = useState(null);
  const [sub, setSub] = useState(undefined);
  const [collector, setCollector] = useState("");
  const [tab, setTab] = useState("overview");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const sess = await getSession();
      setSession(sess);
      const { data, error: err } = await supabase
        .from("v_subscriber_overview")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (err) throw err;
      setSub(data || null);
      if (data) {
        const { data: s } = await supabase
          .from("subscribers")
          .select("collector_id")
          .eq("id", id)
          .maybeSingle();
        if (s?.collector_id) {
          const { data: e } = await supabase
            .from("employees")
            .select("full_name")
            .eq("id", s.collector_id)
            .maybeSingle();
          setCollector(e?.full_name || "");
        } else setCollector("");
      }
    } catch (err) {
      setError(friendlyError(err, "Unable to load the customer."));
      setSub(null);
    }
  }, [id]);

  useEffect(() => {
    setSub(undefined);
    load();
  }, [load]);

  const isAdmin = session?.role === "isp_admin";
  const canEdit = can(session, "subscribers", "edit");
  const canPortal = isAdmin || can(session, "users_roles", "create");

  const changeStatus = async (status) => {
    if (
      status === "terminated" &&
      !window.confirm(`Terminate ${sub.full_name}? Invoices and history are kept.`)
    )
      return;
    setBusy(true);
    setError("");
    try {
      const { error: err } = await supabase
        .from("subscribers")
        .update({ connection_status: status })
        .eq("id", sub.id);
      if (err) throw err;
      await load();
    } catch (err) {
      setError(friendlyError(err, "Unable to update status."));
    } finally {
      setBusy(false);
    }
  };

  const print = async () => {
    setError("");
    try {
      await printProfile(sub);
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  if (sub === undefined) {
    return (
      <div className="box p-10 text-center text-slate-500">
        <Lucide icon="Loader" className="w-8 h-8 mx-auto mb-3 animate-spin" />
        Loading customer...
      </div>
    );
  }

  if (sub === null) {
    return (
      <div className="box p-10 text-center">
        {error && <div className="alert alert-danger show mb-4">{error}</div>}
        <div className="text-slate-500 mb-4">Customer not found.</div>
        <Link to="/subscribers" className="btn btn-primary">
          Back to customers
        </Link>
      </div>
    );
  }

  const tabs = [
    ["overview", "Overview"],
    ["invoices", "Invoices"],
    ["payments", "Payments"],
    ["credit", "Credit & promises"],
    ["tickets", "Tickets"],
    ["inventory", "Inventory & installations"],
    ["discounts", "Discounts"],
    ["addons", "Add-ons"],
    ["documents", "Documents"],
    ...(isAdmin ? [["activity", "Activity"]] : []),
    ...(canPortal ? [["portal", "Portal login"]] : []),
  ];

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 intro-y flex flex-wrap items-center gap-2">
        <Link to="/subscribers" className="btn btn-outline-secondary">
          <Lucide icon="ArrowLeft" className="w-4 h-4 mr-2" />
          Back to customers
        </Link>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={print}>
            <Lucide icon="Printer" className="w-4 h-4 mr-2" />
            Print profile
          </button>
          {can(session, "payments", "view") && (
            <Link to="/payments" className="btn btn-outline-secondary">
              Receive payment / Advance
            </Link>
          )}
          {can(session, "inventory", "view") && (
            <Link to="/inventory" className="btn btn-outline-secondary">
              Inventory
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="col-span-12">
          <div className="alert alert-danger show flex items-center">
            <Lucide icon="AlertCircle" className="w-5 h-5 mr-2" />
            <div className="flex-1">{error}</div>
            <button type="button" onClick={() => setError("")}>
              <Lucide icon="X" className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="col-span-12 intro-y box p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div>
            <div className="text-xl font-medium">{sub.full_name}</div>
            <div className="text-slate-500 text-sm mt-1 flex items-center gap-2">
              <span>{sub.subscriber_code}</span>
              <span
                className={classnames(
                  "py-1 px-2 rounded-full text-xs font-medium",
                  STATUS_BADGE[sub.connection_status]
                )}
              >
                {STATUS_LABELS[sub.connection_status] || sub.connection_status}
              </span>
            </div>
          </div>
          {canEdit && (
            <div className="sm:ml-auto flex flex-wrap gap-2">
              {sub.connection_status !== "active" && sub.connection_status !== "terminated" && (
                <button type="button" className="btn btn-success" disabled={busy} onClick={() => changeStatus("active")}>
                  Activate
                </button>
              )}
              {sub.connection_status === "terminated" && (
                <button type="button" className="btn btn-success" disabled={busy} onClick={() => changeStatus("active")}>
                  Reactivate
                </button>
              )}
              {sub.connection_status === "active" && (
                <button type="button" className="btn btn-warning" disabled={busy} onClick={() => changeStatus("suspended")}>
                  Suspend
                </button>
              )}
              {sub.connection_status !== "terminated" && (
                <button type="button" className="btn btn-outline-danger" disabled={busy} onClick={() => changeStatus("terminated")}>
                  Terminate
                </button>
              )}
            </div>
          )}
        </div>
        <div className="grid grid-cols-12 gap-4 mt-5">
          <div className="col-span-6 lg:col-span-3">
            <Item label="Package">{sub.package_name}</Item>
          </div>
          <div className="col-span-6 lg:col-span-3">
            <Item label="Monthly fee">{money(sub.monthly_fee)}</Item>
          </div>
          <div className="col-span-6 lg:col-span-3">
            <Item label="Billing day">
              {sub.connection_status === "active" ? billingDayText(sub.billing_anchor_date).replace("Billing day: ", "") : ""}
            </Item>
          </div>
          <div className="col-span-6 lg:col-span-3">
            <Item label="Area">{sub.area_name}</Item>
          </div>
          <div className="col-span-6 lg:col-span-3">
            <Item label="Branch">{sub.branch_name}</Item>
          </div>
          <div className="col-span-6 lg:col-span-3">
            <Item label="Collector">{collector}</Item>
          </div>
          <div className="col-span-6 lg:col-span-3">
            <Item label="Reseller">{sub.reseller_name}</Item>
          </div>
          <div className="col-span-6 lg:col-span-3">
            <Item label="Phone">{sub.phone}</Item>
          </div>
          <div className="col-span-6 lg:col-span-3">
            <Item label="E-mail">{sub.email}</Item>
          </div>
          <div className="col-span-12 lg:col-span-3">
            <Item label="Address">{sub.address}</Item>
          </div>
          <div className="col-span-6 lg:col-span-3">
            <div className="text-xs text-slate-500">Outstanding</div>
            <div className={classnames("mt-0.5 font-medium", { "text-danger": Number(sub.outstanding_balance) > 0 })}>
              {money(sub.outstanding_balance)}
            </div>
          </div>
          <div className="col-span-6 lg:col-span-3">
            <div className="text-xs text-slate-500">Advance credit</div>
            <div className={classnames("mt-0.5 font-medium", { "text-success": Number(sub.credit_balance) > 0 })}>
              {money(sub.credit_balance)}
            </div>
          </div>
        </div>
      </div>

      <div className="col-span-12 intro-y box">
        <div className="flex flex-wrap gap-1 px-5 pt-3 border-b border-slate-200 dark:border-darkmode-400">
          {tabs.map(([key, text]) => (
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
          {tab === "overview" && <OverviewTab sub={sub} session={session} onChanged={load} />}
          {tab === "invoices" && <InvoicesTab sub={sub} />}
          {tab === "payments" && <PaymentsTab sub={sub} />}
          {tab === "credit" && <CreditPromisesTab sub={sub} />}
          {tab === "tickets" && <TicketsTab sub={sub} />}
          {tab === "inventory" && <InventoryTab sub={sub} />}
          {tab === "discounts" && <DiscountsTab sub={sub} session={session} />}
          {tab === "addons" && <AddonsTab sub={sub} session={session} />}
          {tab === "documents" && <DocumentsTab sub={sub} session={session} />}
          {tab === "activity" && isAdmin && <ActivityTab sub={sub} />}
          {tab === "portal" && canPortal && <PortalLoginTab sub={sub} />}
        </div>
      </div>
    </div>
  );
}

export default Main;
