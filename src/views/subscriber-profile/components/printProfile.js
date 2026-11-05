import { supabase } from "@/lib/supabase";
import { money, formatDate, titleCase } from "@/lib/format";
import { billingDayText } from "@/views/subscribers/components/SubscriberForm";

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Opens a clean printable summary (details, package, outstanding, last 5 invoices and payments). */
export async function printProfile(sub) {
  const w = window.open("", "_blank");
  if (!w) throw new Error("Please allow pop-ups to print the profile.");
  w.document.write("<p>Preparing...</p>");
  try {
    const [inv, pay] = await Promise.all([
      supabase
        .from("v_invoice_summary")
        .select("invoice_number, billing_month, due_date, amount, amount_paid, balance_due, payment_status")
        .eq("subscriber_id", sub.id)
        .order("billing_month", { ascending: false })
        .limit(5),
      supabase
        .from("v_payment_ledger")
        .select("receipt_number, paid_at, method, amount, refunded_amount")
        .eq("subscriber_id", sub.id)
        .order("paid_at", { ascending: false })
        .limit(5),
    ]);
    if (inv.error) throw inv.error;
    if (pay.error) throw pay.error;

    const row = (l, v) => `<tr><th>${esc(l)}</th><td>${esc(v)}</td></tr>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(sub.full_name)}</title>
<style>body{font-family:Arial,sans-serif;margin:24px;color:#222}h1{font-size:20px;margin:0}h2{font-size:15px;margin:22px 0 6px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:5px 8px;font-size:12px;text-align:left}th{background:#f3f3f3;width:30%}
.grid th{width:auto}</style></head><body>
<h1>${esc(sub.full_name)}</h1><div style="font-size:12px;color:#666">${esc(sub.subscriber_code)} - ${esc(titleCase(sub.connection_status))} - printed ${esc(formatDate(new Date().toISOString().slice(0, 10)))}</div>
<h2>Customer details</h2><table>
${row("Phone", sub.phone)}${row("E-mail", sub.email)}${row("CNIC", sub.cnic)}${row("Address", sub.address)}${row("Area", sub.area_name)}${row("Branch", sub.branch_name)}${row("Reseller", sub.reseller_name)}
</table>
<h2>Service</h2><table>
${row("Package", sub.package_name)}${row("Monthly fee", money(sub.monthly_fee))}${row("Billing", billingDayText(sub.billing_anchor_date))}${row("Outstanding balance", money(sub.outstanding_balance))}${row("Advance credit", money(sub.credit_balance))}
</table>
<h2>Last 5 invoices</h2><table class="grid"><tr><th>Invoice</th><th>Month</th><th>Due</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th></tr>
${(inv.data || []).map((i) => `<tr><td>${esc(i.invoice_number)}</td><td>${esc(formatDate(i.billing_month))}</td><td>${esc(formatDate(i.due_date))}</td><td>${esc(money(i.amount))}</td><td>${esc(money(i.amount_paid))}</td><td>${esc(money(i.balance_due))}</td><td>${esc(titleCase(i.payment_status))}</td></tr>`).join("") || '<tr><td colspan="7">No invoices</td></tr>'}
</table>
<h2>Last 5 payments</h2><table class="grid"><tr><th>Receipt</th><th>Date</th><th>Method</th><th>Amount</th><th>Refunded</th></tr>
${(pay.data || []).map((p) => `<tr><td>${esc(p.receipt_number)}</td><td>${esc(formatDate(p.paid_at))}</td><td>${esc(titleCase(p.method))}</td><td>${esc(money(p.amount))}</td><td>${esc(money(p.refunded_amount))}</td></tr>`).join("") || '<tr><td colspan="5">No payments</td></tr>'}
</table></body></html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  } catch (err) {
    w.close();
    throw err;
  }
}
