import { fetchAll } from "../fetchAll";
import { useLoader, num } from "../useLoader";
import { money, titleCase } from "@/lib/format";
import ReportTable from "../components/ReportTable";
import { Stat, Section } from "../components/ui";

function Advances({ filters, canExport }) {
  const state = useLoader(async () => {
    const rows = await fetchAll(
      "v_subscriber_overview",
      "id,subscriber_code,full_name,phone,area_name,branch_name,connection_status,credit_balance",
      (q) => {
        q = q.gt("credit_balance", 0);
        if (filters.areaId) q = q.eq("area_id", filters.areaId);
        if (filters.branchId) q = q.eq("branch_id", filters.branchId);
        return q;
      }
    );
    rows.sort((a, b) => num(b.credit_balance) - num(a.credit_balance));
    return { rows, total: rows.reduce((s, r) => s + num(r.credit_balance), 0) };
  }, [filters.areaId, filters.branchId]);

  return (
    <Section state={state}>
      {(d) => (
        <>
          <div className="col-span-12 sm:col-span-6">
            <Stat icon="PiggyBank" color="text-success" label="Subscribers holding advance credit" value={d.rows.length.toLocaleString()} />
          </div>
          <div className="col-span-12 sm:col-span-6">
            <Stat icon="Wallet" color="text-primary" label="Total advance balance" value={money(d.total)} />
          </div>
          <div className="col-span-12">
            <ReportTable
              title="Advance balances"
              filename="advance_balances"
              canExport={canExport}
              rows={d.rows}
              empty="No subscriber holds an advance balance."
              columns={[
                { key: "subscriber_code", label: "Code" },
                { key: "full_name", label: "Subscriber" },
                { key: "phone", label: "Phone" },
                { key: "area_name", label: "Area" },
                { key: "branch_name", label: "Branch" },
                { key: "connection_status", label: "Status", render: (r) => titleCase(r.connection_status), csv: (r) => r.connection_status },
                { key: "credit_balance", label: "Advance (PKR)", align: "right", render: (r) => money(r.credit_balance), csv: (r) => r.credit_balance },
              ]}
            />
          </div>
        </>
      )}
    </Section>
  );
}

export default Advances;
