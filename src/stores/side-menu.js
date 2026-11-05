import { atom } from "recoil";

// `module` is the permission module (see src/lib/session.js can()) that the
// entry requires `view` on. Entries without a module are always shown.
const ispMenu = [
  { icon: "Home", pathname: "/", title: "Dashboard", module: "dashboard" },
  { icon: "Users", pathname: "/subscribers", title: "Subscribers", module: "subscribers" },
  { icon: "UserPlus", pathname: "/leads", title: "New Connections", module: "leads" },
  { icon: "Package", pathname: "/packages", title: "Packages", module: "packages" },
  { icon: "CreditCard", pathname: "/billing", title: "Billing", module: "billing" },
  { icon: "DollarSign", pathname: "/payments", title: "Payments", module: "payments" },
  { icon: "MapPin", pathname: "/collections", title: "Field Collection", module: "collections" },
  { icon: "FileText", pathname: "/invoices", title: "Invoices", module: "invoices" },
  { icon: "Calculator", pathname: "/accounting", title: "Accounting", module: "accounting" },
  { icon: "Share2", pathname: "/resellers", title: "Resellers / LCO", module: "resellers" },
  { icon: "LifeBuoy", pathname: "/support", title: "Support Tickets", module: "tickets" },
  { icon: "Archive", pathname: "/inventory", title: "Inventory", module: "inventory" },
  { icon: "ShoppingCart", pathname: "/purchasing", title: "Purchasing", module: "purchasing" },
  { icon: "Wifi", pathname: "/network", title: "Network", module: "network" },
  { icon: "UserCheck", pathname: "/employees", title: "Employees", module: "employees" },
  { icon: "Briefcase", pathname: "/hr", title: "HR & Payroll", module: "hr" },
  { icon: "Shield", pathname: "/roles", title: "Users & Roles", module: "users_roles" },
  { icon: "BarChart2", pathname: "/reports", title: "Reports", module: "reports" },
  { icon: "Settings", pathname: "/settings", title: "Settings", module: "settings" },
];

// Reseller logins (profiles.reseller_id) only get these.
const resellerMenu = [
  { icon: "Wallet", pathname: "/reseller-portal", title: "My Portal" },
  { icon: "LifeBuoy", pathname: "/support", title: "Support" },
];

// Customer logins (profiles.subscriber_id) only get this.
const customerMenu = [
  { icon: "User", pathname: "/customer-portal", title: "My Account" },
];

const platformOwnerMenu = [
  { icon: "Home", pathname: "/platform-owner", title: "Dashboard" },
  { icon: "Building2", pathname: "/platform-owner/organizations", title: "ISPs / Organizations" },
  { icon: "Package", pathname: "/platform-owner/subscriptions", title: "Subscriptions" },
  { icon: "CreditCard", pathname: "/platform-owner/billing", title: "Platform Billing" },
  { icon: "Shield", pathname: "/platform-owner/users-roles", title: "Users & Roles" },
  { icon: "BarChart2", pathname: "/platform-owner/reports", title: "Reports" },
  { icon: "Settings", pathname: "/platform-owner/settings", title: "Settings" },
];

// Path -> permission module, used by the router guard.
const routeModules = {
  "/": "dashboard",
  "/subscribers": "subscribers",
  "/packages": "packages",
  "/billing": "billing",
  "/payments": "payments",
  "/invoices": "invoices",
  "/resellers": "resellers",
  "/support": "tickets",
  "/inventory": "inventory",
  "/network": "network",
  "/employees": "employees",
  "/roles": "users_roles",
  "/reports": "reports",
  "/settings": "settings",
  "/accounting": "accounting",
  "/collections": "collections",
  "/leads": "leads",
  "/hr": "hr",
  "/purchasing": "purchasing",
};

const sideMenu = atom({
  key: "sideMenu",
  default: {
    menu: [],
    ispMenu,
    platformOwnerMenu,
    resellerMenu,
    customerMenu,
  },
});

export { sideMenu, ispMenu, platformOwnerMenu, resellerMenu, customerMenu, routeModules };
