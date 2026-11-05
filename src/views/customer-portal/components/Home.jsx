import { Lucide } from "@/base-components";
import classnames from "classnames";
import { money, formatDate } from "@/lib/format";
import { Badge, ordinal, methodText } from "./ui.jsx";

function Big({ label, value, sub, tone, icon }) {
  return (
    <div className={classnames("box p-5 border-l-4", tone === "danger" ? "border-danger" : tone === "success" ? "border-success" : "border-primary")}>
      <div className="flex items-center text-slate-500 text-sm">
        <Lucide icon={icon} className="w-4 h-4 mr-2" />
        {label}
      </div>
      <div className={classnames("text-3xl font-semibold mt-2", tone === "danger" && "text-danger")}>{value}</div>
      {sub && <div className={classnames("text-sm mt-1", tone === "danger" ? "text-danger" : "text-slate-500")}>{sub}</div>}
    </div>
  );
}

export default function Home({ summary }) {
  const sub = summary.subscriber || {};
  const isp = summary.isp || {};
  const overdue = Number(summary.overdue_count || 0);
  const outstanding = Number(summary.outstanding || 0);
  const credit = Number(summary.credit || 0);
  const lp = summary.last_payment;
  const waDigits = String(isp.whatsapp || "").replace(/\D/g, "");

  return (
    <div className="space-y-4">
      {sub.status === "suspended" && (
        <div className="alert alert-warning flex items-center" role="alert">
          <Lucide icon="AlertTriangle" className="w-5 h-5 mr-2 flex-none" />
          Your connection is suspended because of unpaid bills. Pay to restore it.
        </div>
      )}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-6 lg:col-span-3">
          <Big
            icon="Wallet"
            label="Amount due"
            value={money(outstanding)}
            tone={overdue > 0 ? "danger" : outstanding > 0 ? "primary" : "success"}
            sub={overdue > 0 ? `${overdue} invoice${overdue === 1 ? "" : "s"} overdue` : outstanding > 0 ? "Please pay before the due date" : "You are all paid up"}
          />
        </div>
        <div className="col-span-12 sm:col-span-6 lg:col-span-3">
          <Big icon="Calendar" label="Next due date" value={summary.next_due_date ? formatDate(summary.next_due_date) : "-"} sub={summary.next_due_date ? null : "Nothing due"} />
        </div>
        {credit > 0 && (
          <div className="col-span-12 sm:col-span-6 lg:col-span-3">
            <Big icon="PiggyBank" label="Advance credit" value={money(credit)} tone="success" sub="Used automatically on your next bill" />
          </div>
        )}
        <div className="col-span-12 sm:col-span-6 lg:col-span-3">
          <div className="box p-5 border-l-4 border-primary h-full">
            <div className="flex items-center text-slate-500 text-sm">
              <Lucide icon="Wifi" className="w-4 h-4 mr-2" />
              Connection
            </div>
            <div className="mt-3">
              <Badge value={sub.status} />
            </div>
            <div className="text-sm text-slate-500 mt-2">
              {Number(summary.open_tickets || 0)} open support request{Number(summary.open_tickets || 0) === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6">
          <div className="box p-5 h-full">
            <div className="font-medium text-base mb-3">My package</div>
            <div className="text-2xl font-semibold text-primary">{sub.package || "-"}</div>
            <div className="grid grid-cols-3 gap-3 mt-4 text-center">
              <div className="bg-slate-100 dark:bg-darkmode-400 rounded-md p-3">
                <div className="text-xl font-medium">{sub.download_speed ?? "-"}</div>
                <div className="text-xs text-slate-500">Download Mbps</div>
              </div>
              <div className="bg-slate-100 dark:bg-darkmode-400 rounded-md p-3">
                <div className="text-xl font-medium">{sub.upload_speed ?? "-"}</div>
                <div className="text-xs text-slate-500">Upload Mbps</div>
              </div>
              <div className="bg-slate-100 dark:bg-darkmode-400 rounded-md p-3">
                <div className="text-xl font-medium">{money(sub.monthly_fee || 0)}</div>
                <div className="text-xs text-slate-500">Per month</div>
              </div>
            </div>
            {sub.billing_day ? (
              <div className="text-sm text-slate-500 mt-3">Bill is issued on the {ordinal(sub.billing_day)} of every month.</div>
            ) : null}
          </div>
        </div>
        <div className="col-span-12 lg:col-span-6">
          <div className="box p-5 h-full">
            <div className="font-medium text-base mb-3">My last payment</div>
            {lp ? (
              <>
                <div className="text-2xl font-semibold text-success">{money(lp.amount)}</div>
                <div className="text-sm text-slate-500 mt-2">
                  {formatDate(lp.paid_at)} - {methodText(lp.method)}
                </div>
                {lp.receipt_number && <div className="text-sm text-slate-500">Receipt {lp.receipt_number}</div>}
              </>
            ) : (
              <div className="text-slate-500">No payments yet.</div>
            )}
          </div>
        </div>
      </div>

      <div className="box p-5">
        <div className="font-medium text-base mb-3">How to pay</div>
        {summary.payment_instructions ? (
          <div className="text-sm whitespace-pre-line">{summary.payment_instructions}</div>
        ) : (
          <div className="text-sm text-slate-500">Please contact us to learn how to pay your bill.</div>
        )}
        <div className="flex flex-wrap gap-2 mt-4">
          {isp.phone && (
            <a href={`tel:${isp.phone}`} className="btn btn-primary">
              <Lucide icon="Phone" className="w-4 h-4 mr-2" /> Call {isp.phone}
            </a>
          )}
          {waDigits && (
            <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noreferrer" className="btn btn-success text-white">
              <Lucide icon="MessageCircle" className="w-4 h-4 mr-2" /> WhatsApp
            </a>
          )}
          {isp.email && (
            <a href={`mailto:${isp.email}`} className="btn btn-outline-secondary">
              <Lucide icon="Mail" className="w-4 h-4 mr-2" /> {isp.email}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
