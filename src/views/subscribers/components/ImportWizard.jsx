import { useState } from "react";
import { Lucide } from "@/base-components";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/errors";
import {
  parseCsv,
  csvToImportRows,
  templateCsv,
  toCsv,
  downloadText,
  IMPORT_COLUMNS,
} from "./csv";

const CHUNK = 200;

/** Send rows in chunks; returns { total, ok, errors, results:[{row,status,message}] } with global row numbers. */
async function runImport(rows, dryRun, onProgress) {
  const out = { total: 0, ok: 0, errors: 0, results: [] };
  for (let off = 0; off < rows.length; off += CHUNK) {
    const chunk = rows.slice(off, off + CHUNK);
    const { data, error } = await supabase.rpc("import_subscribers", {
      p_rows: chunk,
      p_dry_run: dryRun,
    });
    if (error) throw error;
    out.total += data.total || 0;
    out.ok += data.ok || 0;
    out.errors += data.errors || 0;
    (data.results || []).forEach((r) => out.results.push({ ...r, row: off + r.row }));
    onProgress(Math.min(rows.length, off + CHUNK));
  }
  return out;
}

function ImportWizard({ onClose, onImported }) {
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [ignored, setIgnored] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dry, setDry] = useState(null);
  const [final, setFinal] = useState(null);

  const errorRows = (res) => (res?.results || []).filter((r) => r.status === "error");

  const pickFile = async (file) => {
    setError("");
    setDry(null);
    setFinal(null);
    setRows([]);
    if (!file) return;
    try {
      const parsed = csvToImportRows(parseCsv(await file.text()));
      if (parsed.missing.length) {
        throw new Error(`Required column(s) missing: ${parsed.missing.join(", ")}.`);
      }
      if (parsed.rows.length === 0) throw new Error("The file has no data rows.");
      setFileName(file.name);
      setRows(parsed.rows);
      setIgnored(parsed.ignored);
    } catch (err) {
      setFileName("");
      setError(friendlyError(err));
    }
  };

  const validate = async () => {
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      setDry(await runImport(rows, true, setProgress));
      setStep(2);
    } catch (err) {
      setError(friendlyError(err, "Validation failed."));
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    setBusy(true);
    setError("");
    setProgress(0);
    setStep(3);
    try {
      const res = await runImport(rows, false, setProgress);
      setFinal(res);
      onImported();
    } catch (err) {
      setError(friendlyError(err, "Import failed."));
    } finally {
      setBusy(false);
    }
  };

  const errorReport = (res) => {
    const lines = [["Row (excluding header)", "Message"]];
    errorRows(res).forEach((r) => lines.push([r.row + 1, r.message || ""]));
    downloadText("import-errors.csv", toCsv(lines));
  };

  const preview = rows.slice(0, 10);
  const previewCols = IMPORT_COLUMNS.filter((c) => rows.some((r) => r[c] !== undefined));
  const pct = rows.length ? Math.round((progress / rows.length) * 100) : 0;

  const ErrorTable = ({ res }) =>
    errorRows(res).length === 0 ? null : (
      <div className="mt-4">
        <div className="flex items-center mb-2">
          <div className="font-medium">Rows with errors</div>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary ml-auto"
            onClick={() => errorReport(res)}
          >
            <Lucide icon="Download" className="w-4 h-4 mr-1" />
            Download error report
          </button>
        </div>
        <div className="overflow-auto max-h-60 border border-slate-200 rounded">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Row</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {errorRows(res).map((r) => (
                <tr key={r.row}>
                  <td className="whitespace-nowrap">{r.row + 1}</td>
                  <td className="text-danger">{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white dark:bg-darkmode-600 rounded-md shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center px-5 py-4 border-b border-slate-200 dark:border-darkmode-400">
          <div>
            <h3 className="text-lg font-medium">Import customers</h3>
            <div className="text-slate-500 text-xs mt-1">
              Step {step} of 3 -{" "}
              {step === 1 ? "Choose file" : step === 2 ? "Check the data" : "Import"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="ml-auto text-slate-500 hover:text-danger"
          >
            <Lucide icon="X" className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          {error && (
            <div className="alert alert-danger show flex items-center mb-4">
              <Lucide icon="AlertCircle" className="w-5 h-5 mr-2 flex-none" />
              <span>{error}</span>
            </div>
          )}

          {step === 1 && (
            <>
              <p className="text-slate-600 mb-3">
                Upload a CSV file with one customer per row. Required columns:{" "}
                <b>full_name</b> and <b>phone</b>. Packages, branches and resellers are matched by
                name; missing areas are created. A positive <b>opening_balance</b> creates an
                unpaid invoice.
              </p>
              <button
                type="button"
                className="btn btn-outline-secondary mb-4"
                onClick={() => downloadText("subscribers-template.csv", templateCsv())}
              >
                <Lucide icon="Download" className="w-4 h-4 mr-2" />
                Download CSV template
              </button>
              <div>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="form-control"
                  onChange={(e) => pickFile(e.target.files?.[0])}
                />
              </div>
              {rows.length > 0 && (
                <div className="mt-4">
                  <div className="font-medium mb-1">
                    {fileName}: {rows.length} row{rows.length === 1 ? "" : "s"} found
                  </div>
                  {ignored.length > 0 && (
                    <div className="text-xs text-slate-500 mb-2">
                      Ignored columns: {ignored.join(", ")}
                    </div>
                  )}
                  <div className="text-xs text-slate-500 mb-1">Preview of the first 10 rows</div>
                  <div className="overflow-auto border border-slate-200 rounded">
                    <table className="table w-full">
                      <thead>
                        <tr>
                          <th>#</th>
                          {previewCols.map((c) => (
                            <th key={c} className="whitespace-nowrap">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((r, i) => (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            {previewCols.map((c) => (
                              <td key={c} className="whitespace-nowrap">
                                {r[c] ?? ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {step === 2 && dry && (
            <>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="box p-3">
                  <div className="text-xl font-medium">{dry.total}</div>
                  <div className="text-xs text-slate-500">Rows checked</div>
                </div>
                <div className="box p-3">
                  <div className="text-xl font-medium text-success">{dry.ok}</div>
                  <div className="text-xs text-slate-500">Valid</div>
                </div>
                <div className="box p-3">
                  <div className="text-xl font-medium text-danger">{dry.errors}</div>
                  <div className="text-xs text-slate-500">With errors</div>
                </div>
              </div>
              <div className="text-xs text-slate-500 mt-2">
                Nothing has been saved yet. Rows with errors will be skipped; the valid rows are
                saved.
              </div>
              <ErrorTable res={dry} />
            </>
          )}

          {step === 3 && (
            <>
              {busy && (
                <>
                  <div className="mb-2">Importing... {pct}%</div>
                  <div className="h-3 bg-slate-200 rounded overflow-hidden">
                    <div className="h-3 bg-primary" style={{ width: `${pct}%` }}></div>
                  </div>
                </>
              )}
              {final && (
                <>
                  <div className="alert alert-outline-success show flex items-center">
                    <Lucide icon="CheckCircle" className="w-5 h-5 mr-2" />
                    Imported {final.ok} customer{final.ok === 1 ? "" : "s"}
                    {final.errors > 0 ? `, skipped ${final.errors}` : ""}.
                  </div>
                  <ErrorTable res={final} />
                </>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-200 dark:border-darkmode-400 flex justify-end gap-2">
          {step === 1 && (
            <>
              <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || rows.length === 0}
                onClick={validate}
              >
                {busy ? `Checking... ${pct}%` : "Check data (dry run)"}
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!dry || dry.ok === 0}
                onClick={doImport}
              >
                Import {dry?.ok || 0} valid row{dry?.ok === 1 ? "" : "s"}
              </button>
            </>
          )}
          {step === 3 && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ImportWizard;
