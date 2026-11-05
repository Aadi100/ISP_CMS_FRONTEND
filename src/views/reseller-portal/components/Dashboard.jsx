import { Lucide } from "@/base-components";
import { money } from "@/lib/format";
import { StatCard } from "@/views/payments/components/shared";

export default function Dashboard({ summary }) {
  const low = Number(summary.wallet_balance) < Number(summary.low_wallet_threshold);
  return (
    <div>
      {low && (
        <div className="alert alert-danger flex items-center mb-4" role="alert">
          <Lucide icon="AlertTriangle" className="w-5 h-5 mr-2 flex-none" />
          <span className="text-sm">
            Low wallet: your balance ({money(summary.wallet_balance)}) is below {money(summary.low_wallet_threshold)}.
            Request a top-up from the Wallet tab.
          </span>
        </div>
      )}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-6 xl:col-span-4">
          <StatCard
            icon="Wallet"
            tone={low ? "text-danger" : "text-success"}
            value={money(summary.wallet_balance)}
            label="Wallet balance"
            hint={low ? "Low wallet" : `Low-balance alert below ${money(summary.low_wallet_threshold)}`}
          />
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-4">
          <StatCard icon="Users" value={summary.customers} label="Active customers" />
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-4">
          <StatCard icon="FileText" tone="text-warning" value={money(summary.outstanding)} label="Outstanding from customers" />
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-4">
          <StatCard icon="TrendingUp" tone="text-success" value={money(summary.collected_month)} label="Collected this month" />
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-4">
          <StatCard
            icon="Percent"
            tone="text-pending"
            value={money(summary.commission_accrued)}
            label="Commission accrued"
            hint={`Paid so far: ${money(summary.commission_paid)} (${summary.commission_percent}%)`}
          />
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-4">
          <StatCard icon="Clock" tone="text-pending" value={summary.pending_topups} label="Pending top-up requests" />
        </div>
      </div>
    </div>
  );
}
