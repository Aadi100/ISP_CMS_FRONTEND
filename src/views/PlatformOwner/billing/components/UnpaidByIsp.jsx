import { money, formatDate } from "@/lib/format";

/** Per-ISP view of unpaid SaaS bills. invoices = open (unpaid/partial/overdue) saas_invoices with organizations(name) */
export default function UnpaidByIsp({ invoices, loading }) {
  const today = new Date().toISOString().slice(0, 10);
  const map = {};
  invoices.forEach((i) => {
    const key = i.organization_id;
    map[key] = map[key] || { name: i.organizations?.name || "-", count: 0, balance: 0, overdue: 0, oldest: i.due_date };
    const bal = Number(i.amount) - Number(i.amount_paid);
    map[key].count += 1;
    map[key].balance += bal;
    if (i.status === "overdue" || i.due_date < today) map[key].overdue += bal;
    if (i.due_date < map[key].oldest) map[key].oldest = i.due_date;
  });
  const rows = Object.values(map).sort((a, b) => b.balance - a.balance);

  return (
    <div className="intro-y box p-5">
      <h3 className="text-base font-medium mb-4">Unpaid bills by ISP</h3>
      <div className="overflow-x-auto">
        <table className="table table-report">
          <thead>
            <tr><th>ISP</th><th>UNPAID BILLS</th><th>OUTSTANDING</th><th>OF WHICH OVERDUE</th><th>OLDEST DUE DATE</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" className="text-center">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan="5" className="text-center">No ISP has unpaid bills.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.name}>
                  <td className="font-medium">{r.name}</td>
                  <td>{r.count}</td>
                  <td>{money(r.balance)}</td>
                  <td className={r.overdue > 0 ? "text-danger" : ""}>{money(r.overdue)}</td>
                  <td>{formatDate(r.oldest)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
