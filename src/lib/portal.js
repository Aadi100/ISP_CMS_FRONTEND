// Reseller logins: profiles.reseller_id is set. Cached per signed-in user.
import { supabase } from "@/lib/supabase";

let cache = null;
supabase.auth.onAuthStateChange(() => {
  cache = null;
});

export function getResellerId() {
  if (cache) return cache;
  cache = (async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("profiles")
      .select("reseller_id")
      .eq("id", user.id)
      .maybeSingle();
    return data?.reseller_id ?? null;
  })().catch(() => null);
  return cache;
}
