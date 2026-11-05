// Who is signed in, which ISP / branch they belong to and what they may do.
// Cached for the page's lifetime; cleared automatically on sign-in/out.
import { supabase } from "@/lib/supabase";

let cache = null;
let pending = null;

supabase.auth.onAuthStateChange(() => {
  cache = null;
  pending = null;
});

export function clearSession() {
  cache = null;
  pending = null;
}

/**
 * @returns {Promise<null | {
 *   user: object, profile: object, orgId: string|null, branchId: string|null,
 *   role: "platform_admin"|"isp_admin"|"isp_staff", permissions: object|null
 * }>}
 */
export function getSession({ force = false } = {}) {
  if (force) clearSession();
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;

  pending = (async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, role_id, organization_id, branch_id, status")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile) return null;

    let permissions = null;
    if (profile.role === "isp_staff" && profile.role_id) {
      const { data } = await supabase
        .from("roles")
        .select("permissions")
        .eq("id", profile.role_id)
        .maybeSingle();
      permissions = data?.permissions ?? null;
    }

    cache = {
      user,
      profile,
      orgId: profile.organization_id ?? null,
      branchId: profile.branch_id ?? null,
      role: profile.role,
      permissions,
    };
    return cache;
  })().finally(() => {
    pending = null;
  });

  return pending;
}

/**
 * Does the signed-in user hold <action> on <module>?
 * modules: dashboard subscribers packages billing payments invoices resellers tickets
 *          inventory network employees users_roles reports settings
 * actions: view create edit delete export
 * ISP admins can do everything inside their ISP. This only hides buttons - the
 * database enforces the real rules.
 */
export function can(session, module, action = "view") {
  if (!session?.profile) return false;
  if (session.role === "isp_admin") return true;
  if (session.role !== "isp_staff") return false;
  return Boolean(session.permissions?.[module]?.[action]);
}
