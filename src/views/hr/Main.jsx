import { useState } from "react";
import classnames from "classnames";
import { Lucide } from "@/base-components";
import { can } from "@/lib/session";
import { useSession } from "@/views/payments/components/shared";
import AttendanceTab from "./components/AttendanceTab";
import LeaveTab from "./components/LeaveTab";
import AdvancesTab from "./components/AdvancesTab";
import PayrollTab from "./components/PayrollTab";
import ScheduleTab from "./components/ScheduleTab";
import { useEmployees } from "./components/common";

const TABS = [
  { key: "attendance", label: "Attendance", icon: "Calendar" },
  { key: "leave", label: "Leave", icon: "Plane" },
  { key: "advances", label: "Advances", icon: "Wallet" },
  { key: "payroll", label: "Payroll", icon: "Banknote" },
  { key: "schedule", label: "Schedule", icon: "Calendar" },
];

function Main() {
  const session = useSession();
  const employees = useEmployees();
  const [tab, setTab] = useState("attendance");

  if (!session) return <div className="intro-y mt-8 text-slate-500">Loading...</div>;
  if (!can(session, "hr", "view")) {
    return (
      <div className="intro-y box p-8 mt-8 text-center text-slate-500">You do not have access to HR &amp; Payroll.</div>
    );
  }

  const perms = {
    create: can(session, "hr", "create"),
    edit: can(session, "hr", "edit"),
    delete: can(session, "hr", "delete"),
  };
  const props = { employees, perms, session };

  return (
    <>
      <div className="intro-y flex items-center mt-8">
        <h2 className="text-lg font-medium mr-auto">HR &amp; Payroll</h2>
      </div>
      <div className="intro-y mt-5 flex flex-wrap gap-1 border-b border-slate-200/60 dark:border-darkmode-400">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={classnames(
              "flex items-center px-4 py-2 text-sm -mb-px border-b-2",
              tab === t.key
                ? "border-primary text-primary font-medium"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            <Lucide icon={t.icon} className="w-4 h-4 mr-2" />
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {tab === "attendance" && <AttendanceTab {...props} />}
        {tab === "leave" && <LeaveTab {...props} />}
        {tab === "advances" && <AdvancesTab {...props} />}
        {tab === "payroll" && <PayrollTab {...props} />}
        {tab === "schedule" && <ScheduleTab {...props} />}
      </div>
    </>
  );
}

export default Main;
