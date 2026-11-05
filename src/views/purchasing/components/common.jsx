import classnames from "classnames";
import { titleCase } from "@/lib/format";

export {
  Modal,
  Pagination,
  StatCard,
  ErrorBanner,
  useToast,
  useSession,
  todayISO,
  likeSafe,
  fetchAll,
  KV,
} from "@/views/payments/components/shared";

export const PO_STATUSES = ["draft", "ordered", "partial", "received", "cancelled"];
export const PAY_METHODS = ["cash", "bank_transfer", "online", "cheque", "jazzcash", "easypaisa"];
export const EQUIPMENT_TYPES = ["ONU", "Router", "Switch", "OLT", "Access Point", "Media Converter", "Modem", "Other"];

const PO_CLASSES = {
  draft: "bg-slate-200 text-slate-500 dark:bg-darkmode-300",
  ordered: "bg-primary/20 text-primary",
  partial: "bg-warning/20 text-warning",
  received: "bg-success/20 text-success",
  cancelled: "bg-danger/20 text-danger",
};

export function PoBadge({ status }) {
  return (
    <div
      className={classnames(
        "py-1 px-2 rounded-full text-xs font-medium inline-block whitespace-nowrap",
        PO_CLASSES[status] || "bg-slate-200 text-slate-500"
      )}
    >
      {titleCase(status)}
    </div>
  );
}

/** Branches for admins (not pinned to a branch). Returns [] for pinned users. */
export async function loadBranches(supabase, session) {
  if (!session || session.branchId) return [];
  const { data } = await supabase.from("branches").select("id,name").order("name");
  return data || [];
}
