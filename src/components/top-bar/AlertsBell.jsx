import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Lucide } from "@/base-components";
import { getMyAlerts } from "@/lib/alerts";
import { friendlyError } from "@/lib/errors";

const SEV = {
  critical: { icon: "AlertOctagon", cls: "text-danger", label: "Critical" },
  warning: { icon: "AlertTriangle", cls: "text-warning", label: "Warning" },
  info: { icon: "Info", cls: "text-primary", label: "Info" },
};

function AlertsBell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const boxRef = useRef(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      setItems(await getMyAlerts({ force }));
      setError("");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [location.pathname, load]);

  useEffect(() => {
    const timer = setInterval(() => load(true), 120000);
    const onFocus = () => load(true);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const sevOf = (i) => (SEV[i.severity] ? i.severity : "info");
  const critical = items.filter((i) => sevOf(i) === "critical");
  const sum = (list) => list.reduce((n, i) => n + Number(i.count || 0), 0);
  const badge = critical.length ? sum(critical) : sum(items);

  return (
    <div className="intro-x relative mr-4 sm:mr-6" ref={boxRef}>
      <div
        role="button"
        className="notification cursor-pointer relative"
        onClick={() => setOpen((o) => !o)}
      >
        <Lucide icon="Bell" className="notification__icon dark:text-slate-500" />
        {badge > 0 && (
          <span
            className={
              "absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] leading-[18px] text-center " +
              (critical.length ? "bg-danger" : "bg-warning")
            }
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </div>

      {open && (
        <div className="absolute right-0 mt-3 w-72 sm:w-80 max-h-96 overflow-y-auto box p-4 z-[60] text-slate-700 dark:text-slate-300">
          <div className="flex items-center mb-3">
            <div className="font-medium mr-auto">Notifications</div>
            <button
              type="button"
              className="btn btn-outline-secondary py-1 px-2 text-xs"
              disabled={loading}
              onClick={() => load(true)}
            >
              {loading ? "..." : "Refresh"}
            </button>
          </div>
          {error && <div className="text-danger text-xs mb-2">{error}</div>}
          {!error && items.length === 0 && (
            <div className="text-slate-500 text-sm py-4">
              Nothing needs your attention
            </div>
          )}
          {["critical", "warning", "info"].map((sev) => {
            const group = items.filter((i) => sevOf(i) === sev);
            if (!group.length) return null;
            return (
              <div key={sev} className="mb-3">
                <div className="text-xs uppercase text-slate-500 mb-1">{SEV[sev].label}</div>
                {group.map((a, i) => (
                  <div
                    key={a.title + i}
                    className="flex items-center py-1.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-darkmode-400 rounded px-1"
                    onClick={() => {
                      setOpen(false);
                      if (a.link) navigate(a.link);
                    }}
                  >
                    <Lucide icon={SEV[sev].icon} className={"w-4 h-4 mr-2 " + SEV[sev].cls} />
                    <div className="text-sm">
                      {a.count} {a.title}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AlertsBell;
