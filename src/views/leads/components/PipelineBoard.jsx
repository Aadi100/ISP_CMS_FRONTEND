import classnames from "classnames";
import { STAGES, STAGE_TONE } from "./common";
import { formatDateTime, titleCase } from "@/lib/format";

export default function PipelineBoard({ leads, canEdit, busyId, onOpen, onMove }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {STAGES.map((stage) => {
        const items = leads.filter((l) => l.stage === stage);
        return (
          <div key={stage} className="w-64 flex-none">
            <div className={classnames("rounded-t-md px-3 py-2 text-sm font-medium flex justify-between", STAGE_TONE[stage])}>
              <span>{titleCase(stage)}</span>
              <span>{items.length}</span>
            </div>
            <div className="bg-slate-100 dark:bg-darkmode-700 rounded-b-md p-2 space-y-2 min-h-[8rem]">
              {items.length === 0 && <div className="text-xs text-slate-400 text-center py-4">No leads</div>}
              {items.map((l) => (
                <div key={l.id} className="box p-3 text-sm">
                  <button type="button" className="font-medium text-left hover:text-primary w-full truncate" onClick={() => onOpen(l.id)}>
                    {l.full_name}
                  </button>
                  <div className="text-xs text-slate-500">{l.lead_code} - {l.phone}</div>
                  <div className="text-xs mt-1">
                    {l.package_name || "No package"}
                    {l.area_name ? ` - ${l.area_name}` : ""}
                  </div>
                  <div className="text-xs text-slate-500">{titleCase(l.source)}{l.assigned_name ? ` - ${l.assigned_name}` : ""}</div>
                  {l.follow_up_at && (
                    <div className={classnames("text-xs mt-1", l.follow_up_overdue ? "text-danger font-medium" : "text-slate-500")}>
                      Follow-up: {formatDateTime(l.follow_up_at)}
                    </div>
                  )}
                  {canEdit && (
                    <select
                      className="form-select form-select-sm mt-2"
                      value={l.stage}
                      disabled={busyId === l.id}
                      onChange={(e) => onMove(l, e.target.value)}
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>{titleCase(s)}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
