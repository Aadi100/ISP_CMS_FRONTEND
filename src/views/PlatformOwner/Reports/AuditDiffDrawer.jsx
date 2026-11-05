import { formatDateTime, titleCase } from "@/lib/format";

const show = (v) => {
  if (v === null || v === undefined) return "-";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

export default function AuditDiffDrawer({ entry, onClose }) {
  const oldData = entry.old_data || {};
  const newData = entry.new_data || {};
  const keys = [...new Set([...Object.keys(oldData), ...Object.keys(newData)])].sort();
  const changed = (k) => JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]);
  const rows = entry.action === "UPDATE" ? keys : keys;
  const changedCount = keys.filter(changed).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black bg-opacity-50" onClick={onClose}>
      <div className="bg-white dark:bg-darkmode-600 w-full max-w-2xl h-full overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-medium">
            {entry.action} on {titleCase(entry.table_name)}
          </h3>
          <button className="text-slate-500 text-xl" onClick={onClose}>×</button>
        </div>
        <div className="text-sm text-slate-600 mb-4 space-y-1">
          <div>When: {formatDateTime(entry.created_at)}</div>
          <div>Who: {entry.actor_name || entry.actor_email || "System"}</div>
          <div>ISP: {entry.organization_name || "Platform"}</div>
          <div className="break-all">Record: {entry.record_id || "-"}</div>
          {entry.action === "UPDATE" && <div>{changedCount} field(s) changed (highlighted).</div>}
        </div>
        {keys.length === 0 ? (
          <div className="text-slate-500">No data was stored for this event.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-report">
              <thead>
                <tr><th>FIELD</th><th>OLD</th><th>NEW</th></tr>
              </thead>
              <tbody>
                {rows.map((k) => {
                  const hl = entry.action === "UPDATE" && changed(k);
                  return (
                    <tr key={k} className={hl ? "bg-warning/20" : ""}>
                      <td className={hl ? "font-medium" : ""}>{k}</td>
                      <td className="break-all text-xs">{show(oldData[k])}</td>
                      <td className="break-all text-xs">{show(newData[k])}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
