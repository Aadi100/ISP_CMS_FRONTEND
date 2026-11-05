// Portal logins: profiles.reseller_id / profiles.subscriber_id. Cached per signed-in user.
import { supabase } from "@/lib/supabase";

let cache = null;
supabase.auth.onAuthStateChange(() => {
  cache = null;
});

export function getPortalContext() {
  if (cache) return cache;
  cache = (async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { resellerId: null, subscriberId: null };
    const { data } = await supabase
      .from("profiles")
      .select("reseller_id, subscriber_id")
      .eq("id", user.id)
      .maybeSingle();
    return {
      resellerId: data?.reseller_id ?? null,
      subscriberId: data?.subscriber_id ?? null,
    };
  })().catch(() => ({ resellerId: null, subscriberId: null }));
  return cache;
}

export async function getResellerId() {
  return (await getPortalContext()).resellerId;
}
