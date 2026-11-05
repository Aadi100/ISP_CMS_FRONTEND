import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Lucide,
  Dropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownContent,
  DropdownItem,
  DropdownHeader,
  DropdownDivider,
} from "@/base-components";
import logoUrl from "@/assets/images/logo.svg";
import { supabase } from "@/lib/supabase";
import { getSession, clearSession, can } from "@/lib/session";
import { ispMenu, platformOwnerMenu } from "@/stores/side-menu";
import classnames from "classnames";

function Main(props) {
  const navigate = useNavigate();

  const location = useLocation();
  const [searchDropdown, setSearchDropdown] = useState(false);
  const [search, setSearch] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [session, setSession] = useState(null);
  const [orgName, setOrgName] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await getSession();
      if (!alive) return;
      setSession(s);
      if (s?.orgId) {
        const { data } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", s.orgId)
          .maybeSingle();
        if (alive) setOrgName(data?.name || "");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const isOwner = session?.role === "platform_admin";
  const pages = (isOwner
    ? platformOwnerMenu
    : ispMenu.filter((m) => !m.module || can(session, m.module, "view"))
  ).filter((m) =>
    search.trim()
      ? m.title.toLowerCase().includes(search.trim().toLowerCase())
      : true
  );
  const currentPage = [...platformOwnerMenu, ...ispMenu].find(
    (m) => m.pathname === location.pathname
  );
  const displayName =
    session?.profile?.full_name || session?.profile?.email || "";
  const roleLabel = isOwner
    ? "Platform Owner"
    : session?.role === "isp_admin"
    ? "ISP Admin"
    : session
    ? "Staff"
    : "";

  const showSearchDropdown = () => {
    setSearchDropdown(true);
  };

  const hideSearchDropdown = () => {
    setTimeout(() => setSearchDropdown(false), 150);
  };

  const handleLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);

    const { error } = await supabase.auth.signOut();
    clearSession();

    if (error) {
      console.error("Logout error:", error);
    }

    navigate("/login", { replace: true });
  };

  return (
    <>
      {/* BEGIN: Top Bar */}
      <div className="top-bar-boxed h-[70px] z-[51] relative border-b border-white/[0.08] mt-12 md:-mt-5 -mx-3 sm:-mx-8 px-3 sm:px-8 md:pt-0 mb-12">
        <div className="h-full flex items-center">

          {/* BEGIN: Logo */}
          <Link to="/" className="-intro-x hidden md:flex">
            <img
              alt="ISP SaaS"
              className="w-6"
              src={logoUrl}
            />
            <span className="text-white text-lg ml-3">
              {isOwner ? "ISP SaaS" : orgName || "ISP SaaS"}
            </span>
          </Link>
          {/* END: Logo */}

          {/* BEGIN: Breadcrumb */}
          <nav
            aria-label="breadcrumb"
            className="-intro-x h-full mr-auto"
          >
            <ol className="breadcrumb breadcrumb-light">
              <li className="breadcrumb-item">
                <Link to="/">Application</Link>
              </li>

              <li
                className="breadcrumb-item active"
                aria-current="page"
              >
                {currentPage?.title || "Dashboard"}
              </li>
            </ol>
          </nav>
          {/* END: Breadcrumb */}

          {/* BEGIN: Search */}
          <div className="intro-x relative mr-3 sm:mr-6">
            <div className="search hidden sm:block">
              <input
                type="text"
                className="search__input form-control border-transparent"
                placeholder="Search pages..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={showSearchDropdown}
                onBlur={hideSearchDropdown}
              />

              <Lucide
                icon="Search"
                className="search__icon dark:text-slate-500"
              />
            </div>

            <a
              className="notification sm:hidden"
              href="#search"
              onClick={(e) => e.preventDefault()}
            >
              <Lucide
                icon="Search"
                className="notification__icon dark:text-slate-500"
              />
            </a>

            <div
              className={classnames({
                "search-result": true,
                show: searchDropdown,
              })}
            >
              <div className="search-result__content">

                <div className="search-result__content__title">
                  Pages
                </div>

                <div className="mb-5">
                  {pages.length === 0 && (
                    <div className="text-slate-500 text-sm">
                      No matching pages.
                    </div>
                  )}
                  {pages.map((page, i) => (
                    <Link
                      key={page.pathname}
                      to={page.pathname}
                      className={classnames("flex items-center", { "mt-2": i })}
                      onClick={() => {
                        setSearch("");
                        setSearchDropdown(false);
                      }}
                    >
                      <div className="w-8 h-8 bg-primary/10 dark:bg-primary/20 text-primary/80 flex items-center justify-center rounded-full">
                        <Lucide icon={page.icon} className="w-4 h-4" />
                      </div>

                      <div className="ml-3">{page.title}</div>
                    </Link>
                  ))}
                </div>

              </div>
            </div>
          </div>
          {/* END: Search */}

          {/* BEGIN: Notifications */}
          <Dropdown className="intro-x mr-4 sm:mr-6">
            <DropdownToggle
              tag="div"
              role="button"
              className="notification cursor-pointer"
            >
              <Lucide
                icon="Bell"
                className="notification__icon dark:text-slate-500"
              />
            </DropdownToggle>

            <DropdownMenu className="notification-content pt-2">
              <DropdownContent
                tag="div"
                className="notification-content__box"
              >
                <div className="notification-content__title">
                  Notifications
                </div>

                <div className="text-slate-500 text-sm py-4">
                  No new notifications.
                </div>
              </DropdownContent>
            </DropdownMenu>
          </Dropdown>
          {/* END: Notifications */}

          {/* BEGIN: Account Menu */}
          <Dropdown className="intro-x w-8 h-8">
            <DropdownToggle
              tag="div"
              role="button"
              className="w-8 h-8 rounded-full overflow-hidden shadow-lg image-fit zoom-in scale-110"
            >
              {session?.profile?.avatar_url ? (
                <img alt="User Profile" src={session.profile.avatar_url} />
              ) : (
                <div className="w-8 h-8 bg-primary text-white flex items-center justify-center text-sm font-medium">
                  {(displayName || "?").charAt(0).toUpperCase()}
                </div>
              )}
            </DropdownToggle>

            <DropdownMenu className="w-56">
              <DropdownContent className="bg-primary/80 before:block before:absolute before:bg-black before:inset-0 before:rounded-md before:z-[-1] text-white">

                <DropdownHeader
                  tag="div"
                  className="!font-normal"
                >
                  <div className="font-medium">
                    {displayName || "Signed in"}
                  </div>

                  <div className="text-xs text-white/60 mt-0.5 dark:text-slate-500">
                    {roleLabel}
                    {!isOwner && orgName ? ` - ${orgName}` : ""}
                  </div>
                </DropdownHeader>

                <DropdownDivider className="border-white/[0.08]" />

                {/* Profile */}
                <DropdownItem
                  className="hover:bg-white/5 cursor-pointer"
                  onClick={() => navigate("/update-profile")}
                >
                  <Lucide
                    icon="User"
                    className="w-4 h-4 mr-2"
                  />
                  Profile
                </DropdownItem>

                {/* Reset Password */}
                <DropdownItem
                  className="hover:bg-white/5 cursor-pointer"
                  onClick={() => navigate("/change-password")}
                >
                  <Lucide
                    icon="Lock"
                    className="w-4 h-4 mr-2"
                  />
                  Change Password
                </DropdownItem>

                <DropdownDivider className="border-white/[0.08]" />

                {/* Logout */}
                <DropdownItem
                  className="hover:bg-white/5 cursor-pointer"
                  onClick={handleLogout}
                  disabled={loggingOut}
                >
                  <Lucide
                    icon="ToggleRight"
                    className="w-4 h-4 mr-2"
                  />
                  {loggingOut ? "Logging out..." : "Logout"}
                </DropdownItem>

              </DropdownContent>
            </DropdownMenu>
          </Dropdown>
          {/* END: Account Menu */}

        </div>
      </div>
      {/* END: Top Bar */}
    </>
  );
}

export default Main;