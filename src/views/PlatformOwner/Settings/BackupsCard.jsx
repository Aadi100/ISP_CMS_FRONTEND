import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatDateTime } from "@/lib/format";

export default function BackupsCard() {
  const [last, setLast] = useState(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("v_audit_log")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) setNote("Could not read the audit log.");
      else setLast(data?.created_at || null);
    })();
  }, []);

  return (
    <div className="box p-5">
      <h3 className="text-base font-medium mb-2">Backups &amp; recovery</h3>
      <div className="text-sm text-slate-600 space-y-3">
        <p>
          Supabase takes <b>daily backups</b> automatically on paid plans. For finer recovery enable{" "}
          <b>Point-in-Time Recovery (PITR)</b> in the Supabase dashboard under Database &rarr; Backups &rarr; Point in
          Time (an add-on on paid plans). No credentials are stored in this application.
        </p>
        <div>
          <div className="font-medium mb-1">Restore procedure</div>
          <ol className="list-decimal ml-5 space-y-1">
            <li>Put the platform in maintenance mode (setting above) and tell ISPs a restore is under way.</li>
            <li>In the Supabase dashboard open Database &rarr; Backups and choose the backup or PITR timestamp.</li>
            <li>Start the restore and wait until the project is healthy again.</li>
            <li>Check the data: organizations, subscriptions, SaaS invoices, and the last audit event below.</li>
            <li>Switch maintenance mode off and announce that service is back.</li>
          </ol>
        </div>
        <p>
          Full instructions: <code>backend/BACKUP_RESTORE.md</code> in the project repository.
        </p>
        <div className="border-t pt-3">
          <span className="text-slate-500">Last audit event: </span>
          <b>{last ? formatDateTime(last) : note || "none recorded yet"}</b>
          <div className="text-slate-500 text-xs">A recent timestamp shows the database is alive and being written to.</div>
        </div>
      </div>
    </div>
  );
}
