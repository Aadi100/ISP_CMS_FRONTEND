import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, formatDate } from "@/lib/format";
import { InvoicePaymentBadge } from "@/views/payments/components/shared";

export default function CustomerCard({ customer, reloadKey, onCollect, onAdvance, onError }) {
  const [open, setOpen] = useState(false);
  const [invoices, setInvoices] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("v_invoice_summary")
      .select("id,invoice_number,subscriber_name,balance_due,amount,due_date,payment_status,billing_month")
      .eq("subscriber_id", customer.id)
      .neq("invoice_status", "cancelled")
      .gt("balance_due", 0)
      .order("due_date");
    if (error) onError(friendlyError(error));
    else setInvoices(data || []);
  }, [customer.id, onError]);

  useEffect(() => {
    if (open) load();
  }, [open, load, reloadKey]);

  return (
    <div className="box p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{customer.full_name}</div>
          <div className="text-xs text-slate-500">
            {customer.subscriber_code} - {customer.phone}
          </div>
          <div className="text-xs text-slate-500 truncate">{[customer.address, customer.area_name].filter(Boolean).join(", ")}</div>
        </div>
        <div className="text-right flex-none">
          <div className={Number(customer.outstanding_balance) > 0 ? "font-medium text-danger" : "font-medium"}>
            {money(customer.outstanding_balance)}
          </div>
          <div className="text-xs text-slate-500">outstanding</div>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setOpen(!open)}>
          {open ? "Hide invoices" : "Unpaid invoices"}
        </button>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => onAdvance(customer)}>
          Advance
        </button>
      </div>
      {open && (
        <div className="mt-3 border-t border-slate-200/60 dark:border-darkmode-400 pt-2">
          {invoices === null && <div className="text-sm text-slate-500 py-2">Loading...</div>}
          {invoices && invoices.length === 0 && <div className="text-sm text-slate-500 py-2">No unpaid invoices.</div>}
          {invoices &&
            invoices.map((inv) => (
              <div key={inv.id} className="flex items-center gap-2 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{inv.invoice_number}</div>
                  <div className="text-xs text-slate-500">Due {formatDate(inv.due_date)}</div>
                </div>
                <InvoicePaymentBadge status={inv.payment_status} />
                <div className="text-right w-24 flex-none">{money(inv.balance_due)}</div>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => onCollect(inv)}>
                  Collect
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
