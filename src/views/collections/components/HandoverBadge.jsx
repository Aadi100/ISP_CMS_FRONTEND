import classnames from "classnames";
import { titleCase } from "@/lib/format";

const CLS = {
  pending: "bg-pending/20 text-pending",
  confirmed: "bg-success/20 text-success",
  rejected: "bg-danger/20 text-danger",
};

export function HandoverBadge({ status }) {
  return (
    <div
      className={classnames(
        "py-1 px-2 rounded-full text-xs font-medium inline-block whitespace-nowrap",
        CLS[status] || "bg-slate-200 text-slate-500"
      )}
    >
      {titleCase(status)}
    </div>
  );
}
