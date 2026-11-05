import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import { money, formatDate, formatDateTime, titleCase } from "@/lib/format";
import { Modal, ErrorBanner, StatusBadge } from "../../shared";

export default function InvoiceDetailModal({ invoice, onClose }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from("saas_payments")
          .select("id, amount, method, reference, notes, paid_at")
          .eq("saas_invoice_id", invoice.id)
          .order("paid_at", { ascending: false });
        if (err) throw err;
        setPayments(data || []);
      } catch (err) {
        setError(friendlyError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [invoice.id]);

  const balance = Number(invoice.amount) - Number(invoice.amount_paid);
  const Field = ({ label, children }) => (
    <div>
      <div className="text-slate-500 text-xs">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );

  return (
    <Modal title={`Invoice ${invoice.invoice_number}`} onClose={onClose} wide>
      <ErrorBanner message={error} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
        <Field label="ISP">{invoice.organizations?.name}</Field>
        <Field label="Plan">{invoice.saas_plans?.name || "-"}</Field>
        <Field label="Status"><StatusBadge status={invoice.status} /></Field>
        <Field label="Period">{formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}</Field>
        <Field label="Due date">{formatDate(invoice.due_date)}</Field>
        <Field label="Paid at">{formatDateTime(invoice.paid_at)}</Field>
        <Field label="Amount">{money(invoice.amount)}</Field>
        <Field label="Paid">{money(invoice.amount_paid)}</Field>
        <Field label="Balance">{money(invoice.status === "cancelled" ? 0 : balance)}</Field>
      </div>
      {invoice.notes && <div className="text-sm text-slate-600 mb-4">Notes: {invoice.notes}</div>}
      <h4 className="font-medium mb-2">Payments</h4>
      <div className="overflow-x-auto">
        <table className="table table-report">
          <thead>
            <tr><th>DATE</th><th>AMOUNT</th><th>METHOD</th><th>REFERENCE</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="4" className="text-center">Loading...</td></tr>
            ) : payments.length === 0 ? (
              <tr><td colSpan="4" className="text-center">No payments recorded.</td></tr>
            ) : (
              payments.map((p) => (
                <tr key={p.id}>
                  <td>{formatDateTime(p.paid_at)}</td>
                  <td>{money(p.amount)}</td>
                  <td>{titleCase(p.method)}</td>
                  <td>{p.reference || "-"}{p.notes ? ` (${p.notes})` : ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end mt-5">
        <button className="btn btn-primary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
