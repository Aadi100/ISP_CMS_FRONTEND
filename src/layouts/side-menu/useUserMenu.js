import { useEffect, useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import { sideMenu } from "@/stores/side-menu";
import { getSession, can } from "@/lib/session";
import { getPortalContext } from "@/lib/portal";

const EMPTY = [];

// Menu entries the signed-in user may see (empty while the session loads).
export default function useUserMenu() {
  const store = useRecoilValue(sideMenu);
  const [session, setSession] = useState(undefined);
  const [portal, setPortal] = useState(undefined);

  useEffect(() => {
    let alive = true;
    getSession().then((s) => alive && setSession(s));
    getPortalContext().then((r) => alive && setPortal(r));
    return () => {
      alive = false;
    };
  }, []);

  return useMemo(() => {
    if (!session) return EMPTY;
    if (session.role === "platform_admin") return store.platformOwnerMenu;
    if (portal === undefined) return EMPTY;
    if (portal.subscriberId) return store.customerMenu;
    if (portal.resellerId) return store.resellerMenu;
    return store.ispMenu.filter(
      (item) => !item.module || can(session, item.module, "view")
    );
  }, [session, store, portal]);
}
