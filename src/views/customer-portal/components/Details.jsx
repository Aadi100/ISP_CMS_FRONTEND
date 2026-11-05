import { Link } from "react-router-dom";
import { Lucide } from "@/base-components";
import { formatDate } from "@/lib/format";

function Row({ label, value }) {
  return (
    <div className="py-3 border-b border-slate-200/60 dark:border-darkmode-400 last:border-0">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-medium">{value || "-"}</div>
    </div>
  );
}

export default function Details({ summary }) {
  const s = summary.subscriber || {};
  const phone = summary.isp?.phone;
  return (
    <div className="box p-5">
      <Row label="Name" value={s.name} />
      <Row label="Customer code" value={s.code} />
      <Row label="Phone" value={s.phone} />
      <Row label="E-mail" value={s.email} />
      <Row label="Address" value={s.address} />
      <Row label="Area" value={s.area} />
      <Row label="Connected since" value={s.connected_since ? formatDate(s.connected_since) : ""} />
      <div className="text-sm text-slate-500 mt-4">
        To change your details please contact {phone ? <a className="text-primary" href={`tel:${phone}`}>{phone}</a> : "your internet provider"}.
      </div>
      <Link to="/change-password" className="btn btn-outline-primary mt-4">
        <Lucide icon="Lock" className="w-4 h-4 mr-2" /> Change password
      </Link>
    </div>
  );
}
