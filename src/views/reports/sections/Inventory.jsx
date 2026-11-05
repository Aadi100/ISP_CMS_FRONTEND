import { fetchAll } from "../fetchAll";
import { useLoader, num, groupBy, monthKey, monthLabel, startIso, endIso } from "../useLoader";
import { money, titleCase } from "@/lib/format";
import ReportTable from "../components/ReportTable";
import DataChart from "../components/DataChart";
import { Stat, ChartBox, Section, Badge } from "../components/ui";

function Inventory({ filters, canExport }) {
  const state = useLoader(async () => {
    const branch = (q) => (filters.branchId ? q.eq("branch_id", filters.branchId) : q);
    const [stock, moves, equipment, installs] = await Promise.all([
      fetchAll(
        "v_stock_overview",
        "id,item_code,name,category,unit,quantity_on_hand,reorder_level,unit_cost,stock_value,is_low,is_active,branch_name",
        (q) => branch(q)
      ),
      fetchAll(
        "v_stock_movements",
        "id,item_name,unit,quantity,unit_cost,created_at",
        (q) => {
          q = branch(q).eq("movement_type", "installation");
          if (filters.from) q = q.gte("created_at", startIso(filters.from));
          if (filters.to) q = q.lte("created_at", endIso(filters.to));
          return q;
        }
      ),
      fetchAll("v_equipment_overview", "id,status", (q) => branch(q)),
      fetchAll(
        "v_installation_overview",
        "id,technician_name,completed_at",
        (q) => {
          q = branch(q).eq("status", "completed");
          if (filters.from) q = q.gte("completed_at", startIso(filters.from));
          if (filters.to) q = q.lte("completed_at", endIso(filters.to));
          return q;
        }
      ),
    ]);

    const active = stock.filter((s) => s.is_active);
    const consumed = groupBy(
      moves,
      (r) => `${monthKey(r.created_at)}|${r.item_name}`,
      (k) => ({ key: k, month: k.split("|")[0], item: k.split("|")[1], unit: "", qty: 0, cost: 0 }),
      (g, r) => {
        g.unit = r.unit;
        g.qty += Math.abs(num(r.quantity));
        g.cost += Math.abs(num(r.quantity)) * num(r.unit_cost);
      }
    ).sort((a, b) => b.month.localeCompare(a.month) || a.item.localeCompare(b.item));

    const perMonth = groupBy(
      consumed,
      (r) => r.month,
      (key) => ({ key, cost: 0 }),
      (g, r) => (g.cost += r.cost)
    ).sort((a, b) => a.key.localeCompare(b.key));

    return {
      stock: active.sort((a, b) => num(b.stock_value) - num(a.stock_value)),
      low: active.filter((s) => s.is_low),
      value: active.reduce((s, r) => s + num(r.stock_value), 0),
      consumed,
      perMonth,
      equipment: groupBy(equipment, (r) => r.status, (key) => ({ key, total: 0 }), (g) => (g.total += 1)).sort((a, b) => b.total - a.total),
      equipmentTotal: equipment.length,
      installs: groupBy(installs, (r) => r.technician_name || "Unassigned", (key) => ({ key, total: 0 }), (g) => (g.total += 1)).sort((a, b) => b.total - a.total),
    };
  }, [filters.from, filters.to, filters.branchId]);

  return (
    <Section state={state}>
      {(d) => (
        <>
          <div className="col-span-12 sm:col-span-6 lg:col-span-3">
            <Stat icon="Package" label="Stock items" value={d.stock.length.toLocaleString()} />
          </div>
          <div className="col-span-12 sm:col-span-6 lg:col-span-3">
            <Stat icon="Wallet" color="text-success" label="Stock valuation" value={money(d.value)} />
          </div>
          <div className="col-span-12 sm:col-span-6 lg:col-span-3">
            <Stat icon="PackageX" color="text-warning" label="Low-stock items" value={d.low.length.toLocaleString()} />
          </div>
          <div className="col-span-12 sm:col-span-6 lg:col-span-3">
            <Stat icon="HardDrive" color="text-primary" label="Equipment units" value={d.equipmentTotal.toLocaleString()} />
          </div>

          <div className="col-span-12 lg:col-span-6">
            <ChartBox title="Materials consumed in installations (cost per month)" empty={d.perMonth.length === 0}>
              <DataChart labels={d.perMonth.map((m) => monthLabel(m.key))} datasets={[{ label: "Cost (PKR)", data: d.perMonth.map((m) => m.cost) }]} />
            </ChartBox>
          </div>
          <div className="col-span-12 lg:col-span-6">
            <ChartBox title="Equipment by status" empty={d.equipment.length === 0}>
              <DataChart type="doughnut" labels={d.equipment.map((e) => titleCase(e.key))} datasets={[{ data: d.equipment.map((e) => e.total) }]} />
            </ChartBox>
          </div>

          <div className="col-span-12">
            <ReportTable
              title="Stock valuation"
              filename="stock_valuation"
              canExport={canExport}
              rows={d.stock}
              empty="No stock items."
              columns={[
                { key: "item_code", label: "Code" },
                { key: "name", label: "Item" },
                { key: "category", label: "Category", render: (r) => titleCase(r.category), csv: (r) => r.category },
                { key: "branch_name", label: "Branch", render: (r) => r.branch_name || "Whole ISP", csv: (r) => r.branch_name || "" },
                { key: "quantity_on_hand", label: "On hand", align: "right", render: (r) => `${num(r.quantity_on_hand)} ${r.unit}`, csv: (r) => r.quantity_on_hand },
                { key: "unit_cost", label: "Unit cost", align: "right", render: (r) => money(r.unit_cost), csv: (r) => r.unit_cost },
                { key: "stock_value", label: "Value (PKR)", align: "right", render: (r) => money(r.stock_value), csv: (r) => r.stock_value },
              ]}
            />
          </div>
          <div className="col-span-12">
            <ReportTable
              title="Low stock"
              filename="low_stock"
              canExport={canExport}
              rows={d.low}
              empty="Nothing is at or below its reorder level."
              columns={[
                { key: "item_code", label: "Code" },
                { key: "name", label: "Item" },
                { key: "quantity_on_hand", label: "On hand", align: "right", render: (r) => `${num(r.quantity_on_hand)} ${r.unit}`, csv: (r) => r.quantity_on_hand },
                { key: "reorder_level", label: "Reorder level", align: "right" },
                { key: "flag", label: "", align: "center", render: () => <Badge tone="danger">Low</Badge>, csv: () => "low" },
              ]}
            />
          </div>
          <div className="col-span-12">
            <ReportTable
              title="Materials consumed per month (installations)"
              filename="materials_consumed"
              canExport={canExport}
              rows={d.consumed}
              empty="No materials were consumed in this period."
              columns={[
                { key: "month", label: "Month", render: (r) => monthLabel(r.month), csv: (r) => r.month },
                { key: "item", label: "Item" },
                { key: "qty", label: "Quantity", align: "right", render: (r) => `${r.qty} ${r.unit}`, csv: (r) => r.qty },
                { key: "cost", label: "Cost (PKR)", align: "right", render: (r) => money(r.cost), csv: (r) => r.cost },
              ]}
            />
          </div>
          <div className="col-span-12 lg:col-span-6">
            <ReportTable
              title="Equipment by status"
              filename="equipment_by_status"
              canExport={canExport}
              rows={d.equipment}
              columns={[
                { key: "key", label: "Status", render: (r) => titleCase(r.key), csv: (r) => r.key },
                { key: "total", label: "Units", align: "right" },
              ]}
            />
          </div>
          <div className="col-span-12 lg:col-span-6">
            <ReportTable
              title="Installations completed per technician"
              filename="installations_per_technician"
              canExport={canExport}
              rows={d.installs}
              empty="No installations were completed in this period."
              columns={[
                { key: "key", label: "Technician" },
                { key: "total", label: "Completed", align: "right" },
              ]}
            />
          </div>
        </>
      )}
    </Section>
  );
}

export default Inventory;
