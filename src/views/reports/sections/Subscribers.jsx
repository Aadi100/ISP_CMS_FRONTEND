import { fetchAll } from "../fetchAll";
import { useLoader, groupBy, monthKey, monthLabel, startIso, endIso } from "../useLoader";
import { titleCase } from "@/lib/format";
import ReportTable from "../components/ReportTable";
import DataChart from "../components/DataChart";
import { Stat, ChartBox, Section } from "../components/ui";

function Subscribers({ filters, canExport }) {
  const state = useLoader(async () => {
    const rows = await fetchAll(
      "v_subscriber_overview",
      "id,connection_status,package_name,area_name,branch_name,created_at,terminated_at",
      (q) => {
        if (filters.areaId) q = q.eq("area_id", filters.areaId);
        if (filters.branchId) q = q.eq("branch_id", filters.branchId);
        return q;
      }
    );

    const dist = (keyFn) =>
      groupBy(
        rows,
        (r) => keyFn(r) || "Unassigned",
        (key) => ({ key, total: 0, active: 0 }),
        (g, r) => {
          g.total += 1;
          if (r.connection_status === "active") g.active += 1;
        }
      ).sort((a, b) => b.total - a.total);

    const inRange = (v) =>
      v && (!filters.from || v >= startIso(filters.from)) && (!filters.to || v <= endIso(filters.to));
    const monthly = new Map();
    const bump = (v, field) => {
      const k = monthKey(v);
      if (!monthly.has(k)) monthly.set(k, { key: k, created: 0, terminated: 0 });
      monthly.get(k)[field] += 1;
    };
    rows.forEach((r) => {
      if (inRange(r.created_at)) bump(r.created_at, "created");
      if (inRange(r.terminated_at)) bump(r.terminated_at, "terminated");
    });

    return {
      total: rows.length,
      active: rows.filter((r) => r.connection_status === "active").length,
      byStatus: groupBy(rows, (r) => r.connection_status, (key) => ({ key, total: 0 }), (g) => (g.total += 1)),
      byPackage: dist((r) => r.package_name),
      byArea: dist((r) => r.area_name),
      byBranch: dist((r) => r.branch_name || "Whole ISP"),
      monthly: [...monthly.values()].sort((a, b) => a.key.localeCompare(b.key)),
    };
  }, [filters.from, filters.to, filters.areaId, filters.branchId]);

  const distCols = (label) => [
    { key: "key", label },
    { key: "total", label: "Subscribers", align: "right" },
    { key: "active", label: "Active", align: "right" },
  ];

  return (
    <Section state={state}>
      {(d) => (
        <>
          <div className="col-span-12 sm:col-span-6">
            <Stat icon="Users" label="Subscribers (current)" value={d.total.toLocaleString()} />
          </div>
          <div className="col-span-12 sm:col-span-6">
            <Stat icon="CheckSquare" color="text-success" label="Active" value={d.active.toLocaleString()} />
          </div>

          <div className="col-span-12 lg:col-span-5">
            <ChartBox title="By status" empty={d.byStatus.length === 0}>
              <DataChart
                type="doughnut"
                labels={d.byStatus.map((s) => titleCase(s.key))}
                datasets={[{ data: d.byStatus.map((s) => s.total) }]}
              />
            </ChartBox>
          </div>
          <div className="col-span-12 lg:col-span-7">
            <ChartBox title="New vs terminated per month (selected dates)" empty={d.monthly.length === 0}>
              <DataChart
                labels={d.monthly.map((m) => monthLabel(m.key))}
                datasets={[
                  { label: "New", data: d.monthly.map((m) => m.created) },
                  { label: "Terminated", data: d.monthly.map((m) => m.terminated) },
                ]}
              />
            </ChartBox>
          </div>

          <div className="col-span-12 lg:col-span-6">
            <ReportTable
              title="By status"
              filename="subscribers_by_status"
              canExport={canExport}
              rows={d.byStatus}
              columns={[
                { key: "key", label: "Status", render: (r) => titleCase(r.key), csv: (r) => r.key },
                { key: "total", label: "Subscribers", align: "right" },
              ]}
            />
          </div>
          <div className="col-span-12 lg:col-span-6">
            <ReportTable
              title="New vs terminated per month"
              filename="subscribers_new_vs_terminated"
              canExport={canExport}
              rows={d.monthly}
              columns={[
                { key: "key", label: "Month", render: (r) => monthLabel(r.key), csv: (r) => r.key },
                { key: "created", label: "New", align: "right" },
                { key: "terminated", label: "Terminated", align: "right" },
              ]}
            />
          </div>
          <div className="col-span-12 lg:col-span-6">
            <ReportTable title="By package" filename="subscribers_by_package" canExport={canExport} rows={d.byPackage} columns={distCols("Package")} />
          </div>
          <div className="col-span-12 lg:col-span-6">
            <ReportTable title="By area" filename="subscribers_by_area" canExport={canExport} rows={d.byArea} columns={distCols("Area")} />
          </div>
          <div className="col-span-12">
            <ReportTable title="By branch" filename="subscribers_by_branch" canExport={canExport} rows={d.byBranch} columns={distCols("Branch")} />
          </div>
        </>
      )}
    </Section>
  );
}

export default Subscribers;
