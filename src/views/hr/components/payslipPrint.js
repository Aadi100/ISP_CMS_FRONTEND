import { money } from "@/lib/format";
import { printHtml, esc, orgHeaderHtml } from "@/views/payments/components/shared";

const monthText = (iso) =>
  new Date(`${String(iso).slice(0, 7)}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

const line = (label, value) => `<div class="row"><span>${esc(label)}</span><span>${esc(money(value))}</span></div>`;

/** Opens a clean printable payslip for one employee. Returns false if the pop-up was blocked. */
export function printPayslip(org, run, s) {
  const earnings = [
    ["Base salary", s.base_salary],
    ["Allowances", s.allowances],
    ["Bonus", s.bonus],
    ["Commission", s.commission],
  ];
  const deductions = [
    [`Absence deduction (${Number(s.absent_days || 0)} day(s))`, s.absent_deduction],
    ["Advance deduction", s.advance_deduction],
    ["Other deduction", s.other_deduction],
  ];
  const gross = earnings.reduce((t, [, v]) => t + Number(v || 0), 0);
  const ded = deductions.reduce((t, [, v]) => t + Number(v || 0), 0);
  const body = `${orgHeaderHtml(org, "Payslip", monthText(run.month))}
    <div class="grid">
      <div><div class="muted">Employee</div><b>${esc(s.full_name)}</b></div>
      <div><div class="muted">Employee code</div><b>${esc(s.employee_code || "-")}</b></div>
      <div><div class="muted">Department</div>${esc(s.department || "-")}</div>
      <div><div class="muted">Pay period</div>${esc(monthText(run.month))}</div>
    </div>
    <h3>Earnings</h3>${earnings.map(([l, v]) => line(l, v)).join("")}
    <div class="row total"><span>Gross earnings</span><span>${esc(money(gross))}</span></div>
    <h3>Deductions</h3>${deductions.map(([l, v]) => line(l, v)).join("")}
    <div class="row total"><span>Total deductions</span><span>${esc(money(ded))}</span></div>
    <div class="row total" style="font-size:18px;margin-top:16px"><span>Net pay</span><span>${esc(money(s.net))}</span></div>
    ${s.notes ? `<p class="muted">Notes: ${esc(s.notes)}</p>` : ""}
    <p class="muted" style="margin-top:32px">This is a computer generated payslip.</p>`;
  return printHtml(`Payslip - ${s.full_name} - ${monthText(run.month)}`, body);
}
