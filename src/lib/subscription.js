// The signed-in ISP's SaaS subscription (rpc get_my_subscription). Cached ~60s.
import { supabase } from "@/lib/supabase";

const TTL = 60000;
let cache = null;
let cachedAt = 0;
let pending = null;
const listeners = new Set();

supabase.auth.onAuthStateChange(() => {
  cache = null;
  cachedAt = 0;
});

export function getMySubscription({ force = false } = {}) {
  if (!force && cache && Date.now() - cachedAt < TTL) return Promise.resolve(cache);
  if (pending) return pending;
  pending = (async () => {
    try {
      const { data, error } = await supabase.rpc("get_my_subscription");
      if (error) throw error;
      cache = data || null;
      cachedAt = Date.now();
    } catch (e) {
      // keep the last known value; retry soon
      cachedAt = Date.now() - TTL + 5000;
    }
    listeners.forEach((fn) => fn(cache));
    return cache;
  })().finally(() => {
    pending = null;
  });
  return pending;
}

export function subscribeSubscription(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function refresh() {
  if (document.visibilityState === "hidden") return;
  if (cache || pending) getMySubscription({ force: true });
}

if (typeof window !== "undefined") {
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);
}
