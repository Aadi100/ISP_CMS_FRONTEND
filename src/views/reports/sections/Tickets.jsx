import { fetchAll } from "../fetchAll";
import { useLoader, groupBy, startIso, endIso } from "../useLoader";
import { titleCase } from "@/lib/format";
import ReportTable from "../components/ReportTable";
import DataChart from "../components/DataChart";
import { Stat, ChartBox, Section } from "../components/ui";

const hoursBetween = (a, b) => (new Date(b) - new Date(a)) / 3600000;
const fmtHours = (h) => (h === null ? "—" : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} days`);

function Tickets({ filters, canExport }) {
  const state = useLoader(async () => {
    const rows = await fetchAll(
      "v_ticket_overview",
      "id,status,priority,category,technician_name,created_at,resolved_at",
      (q) => {
        if (filters.from) q = q.gte("created_at", startIso(filters.from));
        if (filters.to) q = q.lte("created_at", endIso(filters.to));
        if (filters.branchId) q = q.eq("branch_id", filters.branchId);
        return q;
      }
    );
    const stats = (keyFn) =>
      groupBy(
        rows,
        (r) => keyFn(r) || "Unassigned",
        (key) => ({ key, total: 0, resolved: 0, hours: 0 }),
        (g, r) => {
          g.total += 1;
          if (r.resolved_at) {
            g.resolved += 1;
            g.hours += hoursBetween(r.created_at, r.resolved_at);
          }
        }
      )
        .map((g) => ({ ...g, avg: g.resolved ? g.hours / g.resolved : null }))
        .sort((a, b) => b.total - a.total);

    const resolved = rows.filter((r) => r.resolved_at);
    const avg = resolved.length
      ? resolved.reduce((s, r) => s + hoursBetween(r.created_at, r.resolved_at), 0) / resolved.length
      : null;
    return {
      total: rows.length,
      open: rows.filter((r) => !["resolved", "closed"].includes(r.status)).length,
      avg,
      byStatus: stats((r) => r.status),
      byPriority: stats((r) => r.priority),
      byCategory: stats((r) => r.category),
      byTech: stats((r) => r.technician_name),
    };
  }, [filters.from, filters.to, filters.branchId]);

  const cols = (label, titled) => [
    { key: "key", label, render: (r) => (titled ? titleCase(r.key) : r.key), csv: (r) => (titled ? titleCase(r.key) : r.key) },
    { key: "total", label: "Tickets", align: "right" },
    { key: "resolved", label: "Resolved", align: "right" },
    { key: "avg", label: "Avg resolution", align: "right", render: (r) => fmtHours(r.avg), csv: (r) => (r.avg === null ? "" : r.avg.toFixed(1)) },
  ];

  return (
    <Section state={state}>
      {(d) => (
        <>
          <div className="col-span-12 sm:col-span-4">
            <Stat icon="LifeBuoy" label="Tickets opened" value={d.total.toLocaleString()} />
          </div>
          <div className="col-span-12 sm:col-span-4">
            <Stat icon="AlertCircle" color="text-danger" label="Still open" value={d.open.toLocaleString()} />
          </div>
          <div className="col-span-12 sm:col-span-4">
            <Stat icon="Clock" color="text-success" label="Average resolution time" value={fmtHours(d.avg)} />
          </div>

          <div className="col-span-12 lg:col-span-6">
            <ChartBox title="By status" empty={d.byStatus.length === 0}>
              <DataChart type="doughnut" labels={d.byStatus.map((s) => titleCase(s.key))} datasets={[{ data: d.byStatus.map((s) => s.total) }]} />
            </ChartBox>
          </div>
          <div className="col-span-12 lg:col-span-6">
            <ChartBox title="By category" empty={d.byCategory.length === 0}>
              <DataChart labels={d.byCategory.map((s) => titleCase(s.key))} datasets={[{ label: "Tickets", data: d.byCategory.map((s) => s.total) }]} />
            </ChartBox>
          </div>

          <div className="col-span-12 lg:col-span-6">
            <ReportTable title="By status" filename="tickets_by_status" canExport={canExport} rows={d.byStatus} columns={cols("Status", true)} />
          </div>
          <div className="col-span-12 lg:col-span-6">
            <ReportTable title="By priority" filename="tickets_by_priority" canExport={canExport} rows={d.byPriority} columns={cols("Priority", true)} />
          </div>
          <div className="col-span-12 lg:col-span-6">
            <ReportTable title="By category" filename="tickets_by_category" canExport={canExport} rows={d.byCategory} columns={cols("Category", true)} />
          </div>
          <div className="col-span-12 lg:col-span-6">
            <ReportTable title="By technician" filename="tickets_by_technician" canExport={canExport} rows={d.byTech} columns={cols("Technician", false)} />
          </div>
        </>
      )}
    </Section>
  );
}

export default Tickets;
