import { supabase } from "@/lib/supabase";

// Pages through a table/view 1000 rows at a time (the API caps one response at 1000).
export async function fetchAll(table, select, apply = (q) => q, order = "id") {
  const size = 1000;
  const out = [];
  for (let from = 0; from < 500000; from += size) {
    let q = supabase.from(table).select(select);
    q = apply(q);
    q = q.order(order, { ascending: true }).range(from, from + size - 1);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < size) break;
  }
  return out;
}
