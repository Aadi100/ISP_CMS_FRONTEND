// Public platform switches (callable before sign-in). Cached ~30s, refreshed on focus.
import { supabase } from "@/lib/supabase";

const TTL = 30000;
let cache = null;
let cachedAt = 0;
let pending = null;
const listeners = new Set();

export function getPublicSettings({ force = false } = {}) {
  if (!force && cache && Date.now() - cachedAt < TTL) return Promise.resolve(cache);
  if (pending) return pending;
  pending = (async () => {
    try {
      const { data, error } = await supabase.rpc("get_public_settings");
      if (error || !data) throw error || new Error("no settings");
      cache = data;
      cachedAt = Date.now();
    } catch (e) {
      // On failure keep the last known value; default is permissive.
      if (!cache) cache = { allow_self_signup: true, maintenance_mode: false };
      cachedAt = Date.now() - TTL + 5000; // retry in ~5s
    }
    listeners.forEach((fn) => fn(cache));
    return cache;
  })().finally(() => {
    pending = null;
  });
  return pending;
}

if (typeof window !== "undefined") {
  window.addEventListener("focus", () => {
    getPublicSettings({ force: true });
  });
}

// React hook-style subscription helper.
export function subscribePublicSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
