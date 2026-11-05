import DarkModeSwitcher from "@/components/dark-mode-switcher/Main";
import dom from "@left4code/tw-starter/dist/js/dom";
import logoUrl from "@/assets/images/logo.svg";
import illustrationUrl from "@/assets/images/illustration.svg";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "@/lib/supabase";
import { getSession, clearSession } from "@/lib/session";
import { getPublicSettings } from "@/lib/platform";
import { friendlyError } from "@/lib/errors";

function Main() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [error, setError] = useState("");


  // =====================================================
  // PAGE SETUP
  // =====================================================

  const [settings, setSettings] = useState(null);

  useEffect(() => {
    getPublicSettings({ force: true }).then(setSettings);
  }, []);

  useEffect(() => {
    dom("body")
      .removeClass("main")
      .removeClass("error-page")
      .addClass("login");
  }, []);


  // =====================================================
  // EMAIL / PASSWORD LOGIN
  // =====================================================

  const handleLogin = async (e) => {
    e.preventDefault();

    setError("");

    // ---------------------------------------------
    // Validation
    // ---------------------------------------------

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);

    try {
      // ---------------------------------------------
      // Login
      // ---------------------------------------------

      const {
        data: loginData,
        error: loginError,
      } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (loginError) {
        setError(friendlyError(loginError));
        setLoading(false);
        return;
      }

      const user = loginData?.user;

      if (!user) {
        setError("Login failed. Please try again.");
        setLoading(false);
        return;
      }

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select("id, role, organization_id, status")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError || !profile) {
        await supabase.auth.signOut();
        clearSession();
        setError(
          profileError
            ? friendlyError(profileError)
            : "Your account profile could not be found. Please contact the administrator."
        );
        setLoading(false);
        return;
      }

      if (profile.status === "disabled") {
        await supabase.auth.signOut();
        clearSession();
        setError(
          "Your account has been disabled. Please contact your administrator."
        );
        setLoading(false);
        return;
      }

      if (profile.role === "platform_admin") {
        await getSession({ force: true });
        window.location.href = "/platform-owner";
        return;
      }

      if (profile.role === "isp_admin" || profile.role === "isp_staff") {
        await getSession({ force: true });
        window.location.href = "/";
        return;
      }

      await supabase.auth.signOut();
      clearSession();
      setError(
        "Your account does not have a valid system role. Please contact the administrator."
      );
      setLoading(false);

    } catch (err) {

      setError(friendlyError(err));

      setLoading(false);
    }
  };


  // =====================================================
  // GOOGLE LOGIN
  // =====================================================

  const handleGoogleLogin = async () => {
    setError("");
    setGoogleLoading(true);

    try {

      const {
        error: googleError,
      } = await supabase.auth.signInWithOAuth({
        provider: "google",

        options: {
          redirectTo: `${window.location.origin}/login`,
        },
      });

      if (googleError) {
        console.error(
          "Google login error:",
          googleError
        );

        setError(friendlyError(googleError));
        setGoogleLoading(false);
      }

    } catch (err) {

      console.error(
        "Google login error:",
        err
      );

      setError(
        "Unable to continue with Google. Please try again."
      );

      setGoogleLoading(false);
    }
  };


  // =====================================================
  // UI
  // =====================================================

  return (
    <>
      <div>

        <DarkModeSwitcher />


        <div className="container sm:px-10">

          <div className="block xl:grid grid-cols-2 gap-4">


            {/* =================================================
                LEFT SIDE
            ================================================= */}

            <div className="hidden xl:flex flex-col min-h-screen">

              <a
                href="/"
                className="-intro-x flex items-center pt-5"
              >

                <img
                  alt="ISP SaaS"
                  className="w-6"
                  src={logoUrl}
                />

                <span className="text-white text-lg ml-3">
                  ISP SaaS
                </span>

              </a>


              <div className="my-auto">

                <img
                  alt="ISP Management Platform"
                  className="-intro-x w-1/2 -mt-16"
                  src={illustrationUrl}
                />

                <div className="-intro-x text-white font-medium text-4xl leading-tight mt-10">

                  Welcome back to your
                  <br />
                  ISP management platform.

                </div>


                <div className="-intro-x mt-5 text-lg text-white text-opacity-70 dark:text-slate-400">

                  Manage your ISP business from one place.

                </div>

              </div>

            </div>


            {/* =================================================
                LOGIN FORM
            ================================================= */}

            <div className="h-screen xl:h-auto flex py-5 xl:py-0 my-10 xl:my-0">

              <div className="my-auto mx-auto xl:ml-20 bg-white dark:bg-darkmode-600 xl:bg-transparent px-5 sm:px-8 py-8 xl:p-0 rounded-md shadow-md xl:shadow-none w-full sm:w-3/4 lg:w-2/4 xl:w-auto">


                <h2 className="intro-x font-bold text-2xl xl:text-3xl text-center xl:text-left">

                  Sign In

                </h2>


                <div className="intro-x mt-2 text-slate-400 xl:hidden text-center">

                  Welcome back. Sign in to manage your ISP business.

                </div>


                {/* =================================================
                    ERROR
                ================================================= */}

                {settings?.maintenance_mode && (
                  <div className="intro-x mt-5 p-3 rounded-md bg-warning/20 text-slate-700 dark:text-slate-300 text-sm">
                    The system is under maintenance. Only the platform owner can sign in right now.
                  </div>
                )}

                {error && (
                  <div className="intro-x mt-5 p-3 rounded-md bg-danger/10 text-danger text-sm">

                    {error}

                  </div>
                )}


                {/* =================================================
                    LOGIN FORM
                ================================================= */}

                <form onSubmit={handleLogin}>

                  <div className="intro-x mt-8">


                    <input
                      type="email"
                      className="intro-x login__input form-control py-3 px-4 block"
                      placeholder="Email"
                      value={email}
                      onChange={(e) =>
                        setEmail(e.target.value)
                      }
                      autoComplete="email"
                      disabled={loading || googleLoading}
                    />


                    <input
                      type="password"
                      className="intro-x login__input form-control py-3 px-4 block mt-4"
                      placeholder="Password"
                      value={password}
                      onChange={(e) =>
                        setPassword(e.target.value)
                      }
                      autoComplete="current-password"
                      disabled={loading || googleLoading}
                    />

                  </div>


                  {/* =================================================
                      REMEMBER + FORGOT
                  ================================================= */}

                  <div className="intro-x flex text-slate-600 dark:text-slate-500 text-xs sm:text-sm mt-4">


                    <div className="flex items-center mr-auto">

                      <input
                        id="remember-me"
                        type="checkbox"
                        className="form-check-input border mr-2"
                      />

                      <label
                        className="cursor-pointer select-none"
                        htmlFor="remember-me"
                      >
                        Remember me
                      </label>

                    </div>


                    <button
                      type="button"
                      className="text-primary"
                      onClick={() =>
                        navigate("/forgot-password")
                      }
                    >
                      Forgot Password?
                    </button>

                  </div>


                  {/* =================================================
                      LOGIN / REGISTER
                  ================================================= */}

                  <div className="intro-x mt-5 xl:mt-8 text-center xl:text-left">


                    <button
                      type="submit"
                      disabled={
                        loading ||
                        googleLoading
                      }
                      className="btn btn-primary py-3 px-4 w-full xl:w-32 xl:mr-3 align-top"
                    >

                      {loading
                        ? "Signing in..."
                        : "Login"}

                    </button>


                    {settings?.allow_self_signup !== false && (
                    <button
                      type="button"
                      onClick={() =>
                        navigate("/register")
                      }
                      disabled={
                        loading ||
                        googleLoading
                      }
                      className="btn btn-outline-secondary py-3 px-4 w-full xl:w-32 mt-3 xl:mt-0 align-top"
                    >

                      Register

                    </button>
                    )}

                  </div>

                </form>


                {/* =================================================
                    DIVIDER
                ================================================= */}

                <div className="intro-x mt-6 flex items-center">

                  <div className="h-px bg-slate-200 dark:bg-darkmode-400 flex-1"></div>

                  <div className="px-3 text-xs text-slate-400">
                    OR
                  </div>

                  <div className="h-px bg-slate-200 dark:bg-darkmode-400 flex-1"></div>

                </div>


                {/* =================================================
                    GOOGLE LOGIN
                ================================================= */}

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={
                    loading ||
                    googleLoading
                  }
                  className="intro-x btn btn-outline-secondary py-3 px-4 w-full mt-5"
                >

                  {googleLoading
                    ? "Connecting to Google..."
                    : "Continue with Google"}

                </button>


                {/* =================================================
                    FOOTER
                ================================================= */}

                <div className="intro-x mt-10 xl:mt-20 text-slate-600 dark:text-slate-500 text-center xl:text-left text-xs sm:text-sm">

                  By signing in, you agree to our{" "}

                  <a
                    className="text-primary dark:text-slate-200"
                    href="#terms"
                    onClick={(e) =>
                      e.preventDefault()
                    }
                  >
                    Terms and Conditions
                  </a>

                  {" "} & {" "}

                  <a
                    className="text-primary dark:text-slate-200"
                    href="#privacy"
                    onClick={(e) =>
                      e.preventDefault()
                    }
                  >
                    Privacy Policy
                  </a>

                </div>

              </div>

            </div>

          </div>

        </div>

      </div>
    </>
  );
}

export default Main;