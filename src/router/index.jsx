import { useEffect, useState } from "react";
import { Navigate, useLocation, useRoutes } from "react-router-dom";

import { supabase } from "@/lib/supabase";
import { getPublicSettings, subscribePublicSettings } from "@/lib/platform";
import { getMySubscription, subscribeSubscription } from "@/lib/subscription";
import { Link } from "react-router-dom";
import { getResellerId } from "@/lib/portal";
import { getSession, clearSession, can } from "@/lib/session";
import { ispMenu, routeModules } from "@/stores/side-menu";

// AUTH
import ForgotPassword from "../views/Auth/ForgotPassword/Main";
import EmailVerified from "../views/Auth/EmailVerified/Main";
import ResetPassword from "../views/Auth/ResetPassword/Main";
import Login from "../views/login/Main";
import Register from "../views/register/Main";

// PLATFORM OWNER
import PlatformOwner from "../views/PlatformOwner/Main";
import Organizations from "../views/PlatformOwner/Organizations/Main";
import Subscriptions from "../views/PlatformOwner/Subscriptions/Main";
import PlatformBilling from "../views/PlatformOwner/billing/Main";
import UsersRoles from "../views/PlatformOwner/UsersRoles/Main";
import PlatformReports from "../views/PlatformOwner/Reports/Main";
import PlatformSettings from "../views/PlatformOwner/Settings/Main";

// LAYOUT
import SideMenu from "../layouts/side-menu/Main";

// ISP PAGES
import DashboardOverview2 from "../views/dashboard-overview-2/Main";
import Subscribers from "../views/subscribers/Main";
import Packages from "../views/packages/Main";
import Billing from "../views/billing/Main";
import Payments from "../views/payments/Main";
import Invoices from "../views/invoices/Main";
import Resellers from "../views/resellers/Main";
import Support from "../views/support/Main";
import Inventory from "../views/inventory/Main";
import Network from "../views/network/Main";
import Employees from "../views/employees/Main";
import Roles from "../views/roles/Main";
import Reports from "../views/reports/Main";
import Settings from "../views/settings/Main";
import Accounting from "../views/accounting/Main";
import Collections from "../views/collections/Main";
import Leads from "../views/leads/Main";
import HR from "../views/hr/Main";
import Purchasing from "../views/purchasing/Main";
import ResellerPortal from "../views/reseller-portal/Main";
import UpdateProfile from "../views/update-profile/Main";
import ChangePassword from "../views/change-password/Main";

// OTHER
import ErrorPage from "../views/error-page/Main";


// =====================================================
// PROTECTED ROUTE (sign-in + role + permission guard)
// =====================================================

const ALWAYS_ALLOWED = ["/update-profile", "/change-password"];

function normalizePath(pathname) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function firstAllowedPath(session) {
  if (session.role === "platform_admin") return "/platform-owner";
  const entry = ispMenu.find(
    (item) => !item.module || can(session, item.module, "view")
  );
  return entry ? entry.pathname : null;
}

function ProtectedRoute({ children }) {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [maintenance, setMaintenance] = useState(false);
  const [sub, setSub] = useState(null);
  const [resellerId, setResellerId] = useState(undefined);

  useEffect(() => {
    let mounted = true;
    getPublicSettings().then((st) => mounted && setMaintenance(!!st?.maintenance_mode));
    const unsub = subscribePublicSettings((st) => mounted && setMaintenance(!!st?.maintenance_mode));

    getSession().then(async (s) => {
      if (!mounted) return;
      if (s?.profile?.status === "disabled") {
        await supabase.auth.signOut();
        clearSession();
        s = null;
      }
      if (mounted) {
        setSession(s);
        setLoading(false);
      }
      if (s && s.role !== "platform_admin") {
        getResellerId().then((r) => mounted && setResellerId(r));
        getMySubscription().then((x) => mounted && setSub(x));
      }
    });
    const unsubSub = subscribeSubscription((x) => mounted && setSub(x));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (mounted && event === "SIGNED_OUT") {
        setSession(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      unsub();
      unsubSub();
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (maintenance && session.role !== "platform_admin") {
    return <Maintenance />;
  }

  const isIsp = session.role !== "platform_admin";
  if (isIsp && sub && ["suspended", "inactive"].includes(sub.organization_status)) {
    return <Suspended />;
  }

  const path = normalizePath(location.pathname);

  // Platform owner: only /platform-owner/* and the profile pages.
  if (session.role === "platform_admin") {
    if (
      path === "/platform-owner" ||
      path.startsWith("/platform-owner/") ||
      ALWAYS_ALLOWED.includes(path)
    ) {
      return (
        <>
          {maintenance && (
            <div className="bg-warning text-slate-900 text-center text-sm font-medium py-2 px-4 relative z-[60]">
              Maintenance mode is ON - ISP users are blocked
            </div>
          )}
          {children}
        </>
      );
    }
    return <Navigate to="/platform-owner" replace />;
  }

  // ISP users: never /platform-owner/*; every page needs `view` on its module.
  if (path === "/platform-owner" || path.startsWith("/platform-owner/")) {
    const target = firstAllowedPath(session);
    return target ? <Navigate to={target} replace /> : <NoAccess />;
  }

  const withBanners = (el) => (
    <>
      <SubscriptionBanners sub={sub} isAdmin={session.role === "isp_admin"} />
      {el}
    </>
  );

  if (ALWAYS_ALLOWED.includes(path)) return withBanners(children);

  if (resellerId === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  // Reseller logins: only their portal and support.
  if (resellerId) {
    if (path === "/reseller-portal" || path === "/support") return withBanners(children);
    return <Navigate to="/reseller-portal" replace />;
  }
  if (path === "/reseller-portal") {
    const target = firstAllowedPath(session);
    return target ? <Navigate to={target} replace /> : <NoAccess />;
  }

  const module = routeModules[path];
  if (module && !can(session, module, "view")) {
    const target = firstAllowedPath(session);
    return target ? <Navigate to={target} replace /> : <NoAccess />;
  }

  return withBanners(children);
}

function Suspended() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center text-slate-500">
        <div className="text-lg font-medium">
          Your account is suspended. Please contact the platform administrator.
        </div>
        <button
          type="button"
          className="btn btn-primary mt-4"
          onClick={async () => {
            await supabase.auth.signOut();
            clearSession();
            window.location.href = "/login";
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function SubscriptionBanners({ sub, isAdmin }) {
  if (!sub) return null;
  const banners = [];
  if (sub.is_live === false) {
    banners.push(
      <div key="exp" className="bg-danger text-white text-center text-sm font-medium py-2 px-4 relative z-[60]">
        Your subscription has expired - the system is read-only. Contact the platform administrator.
        {isAdmin && (
          <Link to="/settings" className="underline ml-2">
            View subscription
          </Link>
        )}
      </div>
    );
  } else if (
    sub.days_left !== null &&
    sub.days_left !== undefined &&
    Number(sub.days_left) <= 7
  ) {
    const n = Number(sub.days_left);
    banners.push(
      <div key="soon" className="bg-warning text-slate-900 text-center text-sm font-medium py-2 px-4 relative z-[60]">
        Your {sub.plan || "current"} {sub.status === "trial" ? "trial" : "subscription"} ends in {n} day{n === 1 ? "" : "s"}.
      </div>
    );
  }
  if (isAdmin && Number(sub.unpaid_invoices) > 0) {
    const n = Number(sub.unpaid_invoices);
    banners.push(
      <div key="unpaid" className="bg-warning text-slate-900 text-center text-sm font-medium py-2 px-4 relative z-[60]">
        You have {n} unpaid platform invoice{n === 1 ? "" : "s"}.
      </div>
    );
  }
  return <>{banners}</>;
}

function Maintenance() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center text-slate-500">
        <div className="text-lg font-medium">
          The system is under maintenance. Please try again later.
        </div>
        <button
          type="button"
          className="btn btn-primary mt-4"
          onClick={async () => {
            await supabase.auth.signOut();
            clearSession();
            window.location.href = "/login";
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function NoAccess() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center text-slate-500">
        <div className="text-lg font-medium">No access</div>
        <div className="mt-2">
          Your account has no page permissions yet. Please ask your administrator.
        </div>
        <button
          type="button"
          className="btn btn-primary mt-4"
          onClick={async () => {
            await supabase.auth.signOut();
            clearSession();
            window.location.href = "/login";
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}


// =====================================================
// ROUTER
// =====================================================

function Router() {
  const routes = [
    // =================================================
    // PUBLIC AUTH ROUTES
    // =================================================

    {
      path: "/login",
      element: <Login />,
    },

    {
      path: "/register",
      element: <Register />,
    },

    {
      path: "/forgot-password",
      element: <ForgotPassword />,
    },

    {
      path: "/reset-password",
      element: <ResetPassword />,
    },

    {
      path: "/email-verified",
      element: <EmailVerified />,
    },


    // =================================================
    // PROTECTED APPLICATION
    // =================================================

    {
      path: "/",
      element: (
        <ProtectedRoute>
          <SideMenu />
        </ProtectedRoute>
      ),

      children: [

        // =============================================
        // ISP OWNER / ISP ADMIN
        // =============================================

        {
          index: true,
          element: <DashboardOverview2 />,
        },

        {
          path: "subscribers",
          element: <Subscribers />,
        },

        {
          path: "packages",
          element: <Packages />,
        },

        {
          path: "billing",
          element: <Billing />,
        },

        {
          path: "payments",
          element: <Payments />,
        },

        {
          path: "invoices",
          element: <Invoices />,
        },

        {
          path: "resellers",
          element: <Resellers />,
        },

        {
          path: "support",
          element: <Support />,
        },

        {
          path: "inventory",
          element: <Inventory />,
        },

        {
          path: "network",
          element: <Network />,
        },

        {
          path: "employees",
          element: <Employees />,
        },

        {
          path: "roles",
          element: <Roles />,
        },

        {
          path: "reports",
          element: <Reports />,
        },

        {
          path: "settings",
          element: <Settings />,
        },

        { path: "accounting", element: <Accounting /> },
        { path: "collections", element: <Collections /> },
        { path: "leads", element: <Leads /> },
        { path: "hr", element: <HR /> },
        { path: "purchasing", element: <Purchasing /> },
        { path: "reseller-portal", element: <ResellerPortal /> },

        {
          path: "update-profile",
          element: <UpdateProfile />,
        },

        {
          path: "change-password",
          element: <ChangePassword />,
        },


        // =============================================
        // PLATFORM OWNER
        // =============================================

        {
          path: "platform-owner",
          element: <PlatformOwner />,
        },

        {
          path: "platform-owner/organizations",
          element: <Organizations />,
        },

        {
          path: "platform-owner/subscriptions",
          element: <Subscriptions />,
        },

        {
          path: "platform-owner/billing",
          element: <PlatformBilling />,
        },

        {
          path: "platform-owner/users-roles",
          element: <UsersRoles />,
        },

        {
          path: "platform-owner/reports",
          element: <PlatformReports />,
        },

        {
          path: "platform-owner/settings",
          element: <PlatformSettings />,
        },
      ],
    },


    // =================================================
    // ERROR PAGE
    // =================================================

    {
      path: "/error-page",
      element: <ErrorPage />,
    },

    {
      path: "*",
      element: <ErrorPage />,
    },
  ];

  return useRoutes(routes);
}

export default Router;