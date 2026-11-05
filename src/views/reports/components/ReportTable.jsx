import { useState } from "react";
import { Lucide } from "@/base-components";
import classnames from "classnames";
import { downloadCsv } from "../csv";

const alignCls = (a) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "");

/**
 * columns: [{ key, label, align?, render?(row), csv?(row) }]
 * Client-side pagination; Export CSV (all rows) when canExport.
 */
function ReportTable({
  title,
  columns,
  rows,
  filename,
  canExport,
  pageSize = 10,
  empty = "No data for the selected filters.",
}) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const cur = Math.min(page, pages);
  const slice = rows.slice((cur - 1) * pageSize, cur * pageSize);

  return (
    <div className="box p-5 intro-y">
      <div className="flex items-center mb-4">
        <div className="font-medium text-base truncate mr-4">{title}</div>
        <div className="ml-auto text-slate-500 text-xs mr-3 whitespace-nowrap">
          {rows.length} row{rows.length === 1 ? "" : "s"}
        </div>
        {canExport && (
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            disabled={rows.length === 0}
            onClick={() => downloadCsv(filename, columns, rows)}
          >
            <Lucide icon="Download" className="w-4 h-4 mr-1" /> Export CSV
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="text-center text-slate-500 py-8">{empty}</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="table table-report w-full">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} className={classnames("whitespace-nowrap", alignCls(c.align))}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slice.map((r, i) => (
                  <tr key={r.id ?? r.key ?? i} className="intro-x">
                    {columns.map((c) => (
                      <td key={c.key} className={classnames("whitespace-nowrap", alignCls(c.align))}>
                        {c.render ? c.render(r) : r[c.key] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center mt-4 text-sm">
              <div className="text-slate-500">
                Page {cur} of {pages}
              </div>
              <div className="ml-auto flex gap-2">
                <button type="button" className="btn btn-outline-secondary btn-sm" disabled={cur === 1} onClick={() => setPage(cur - 1)}>
                  ‹ Prev
                </button>
                <button type="button" className="btn btn-outline-secondary btn-sm" disabled={cur === pages} onClick={() => setPage(cur + 1)}>
                  Next ›
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ReportTable;
