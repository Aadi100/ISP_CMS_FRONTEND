// Small RFC-4180 CSV helpers (no dependencies).

/** Parse CSV text into an array of string arrays. Handles BOM, quotes, CRLF, "," or ";". */
export function parseCsv(text) {
  let src = String(text || "").replace(/^﻿/, "");
  // Pick the separator from the first line (outside quotes).
  const firstLine = src.split(/\r?\n/, 1)[0] || "";
  let inQ = false;
  let commas = 0;
  let semis = 0;
  for (const ch of firstLine) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch === ",") commas++;
    else if (!inQ && ch === ";") semis++;
  }
  const sep = semis > commas ? ";" : ",";

  const rows = [];
  let row = [];
  let cell = "";
  inQ = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQ = false;
      } else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

export function csvEscape(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
}

export function downloadText(filename, text) {
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const IMPORT_COLUMNS = [
  "full_name",
  "phone",
  "email",
  "cnic",
  "address",
  "area",
  "package",
  "monthly_fee",
  "connection_status",
  "connection_type",
  "pppoe_username",
  "installation_date",
  "billing_anchor_date",
  "branch",
  "reseller",
  "latitude",
  "longitude",
  "notes",
  "opening_balance",
];

const ALIASES = {
  name: "full_name",
  customer_name: "full_name",
  customer: "full_name",
  fullname: "full_name",
  mobile: "phone",
  mobile_number: "phone",
  phone_number: "phone",
  contact: "phone",
  plan: "package",
  package_name: "package",
  balance: "opening_balance",
  outstanding: "opening_balance",
  status: "connection_status",
  fee: "monthly_fee",
  price: "monthly_fee",
  pppoe: "pppoe_username",
  username: "pppoe_username",
  type: "connection_type",
  lat: "latitude",
  lng: "longitude",
  lon: "longitude",
  area_name: "area",
  branch_name: "branch",
  reseller_name: "reseller",
  cnic_number: "cnic",
  activation_date: "billing_anchor_date",
};

/** "Full Name" -> "full_name"; aliases resolved; unknown (e.g. speed) -> null (ignored). */
export function normalizeHeader(h) {
  const k = String(h || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, "_");
  if (IMPORT_COLUMNS.includes(k)) return k;
  return ALIASES[k] || null;
}

/** Turn parsed CSV into { rows: objects for the RPC, ignored: [header names], missing: [required] }. */
export function csvToImportRows(parsed) {
  if (parsed.length === 0) return { rows: [], ignored: [], missing: ["full_name", "phone"] };
  const headers = parsed[0].map(normalizeHeader);
  const ignored = parsed[0].filter((_, i) => !headers[i]).map((h) => String(h).trim()).filter(Boolean);
  const missing = ["full_name", "phone"].filter((c) => !headers.includes(c));
  const rows = parsed.slice(1).map((cells) => {
    const o = {};
    headers.forEach((key, i) => {
      if (!key) return;
      const v = (cells[i] ?? "").trim();
      if (v !== "" && o[key] === undefined) o[key] = v;
    });
    return o;
  });
  return { rows, ignored, missing };
}

export function templateCsv() {
  return toCsv([
    IMPORT_COLUMNS,
    [
      "Ali Khan", "0300-1234567", "ali@example.com", "42101-1234567-1", "House 12, Street 4",
      "Gulshan", "Basic 10 Mbps", "1500", "active", "fiber", "ali.khan", "2026-01-12", "", "",
      "", "", "", "", "0",
    ],
    [
      "Sara Ahmed", "0321-7654321", "", "", "Flat 3, Block B", "DHA", "Standard 20 Mbps", "",
      "pending", "wireless", "", "", "", "", "", "", "", "Opening balance from old system", "2500",
    ],
  ]);
}
