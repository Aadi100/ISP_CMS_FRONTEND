// Bell alerts (rpc get_my_alerts). Cached briefly; the bell refreshes every 2 minutes.
import { supabase } from "@/lib/supabase";

const TTL = 30000;
let cache = null;
let cachedAt = 0;
let pending = null;

supabase.auth.onAuthStateChange(() => {
  cache = null;
  cachedAt = 0;
});

export function getMyAlerts({ force = false } = {}) {
  if (!force && cache && Date.now() - cachedAt < TTL) return Promise.resolve(cache);
  if (pending) return pending;
  pending = (async () => {
    const { data, error } = await supabase.rpc("get_my_alerts");
    if (error) throw error;
    cache = Array.isArray(data) ? data : [];
    cachedAt = Date.now();
    return cache;
  })().finally(() => {
    pending = null;
  });
  return pending;
}
