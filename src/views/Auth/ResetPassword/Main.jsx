import DarkModeSwitcher from "@/components/dark-mode-switcher/Main";
import dom from "@left4code/tw-starter/dist/js/dom";
import logoUrl from "@/assets/images/logo.svg";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "@/lib/supabase";

function Main() {
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");

  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // =====================================================
  // PAGE SETUP + PASSWORD RECOVERY SESSION
  // =====================================================

  useEffect(() => {
    dom("body")
      .removeClass("main")
      .removeClass("error-page")
      .addClass("login");

    let mounted = true;

    const checkRecoverySession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (!session) {
          setError(
            "This password reset link is invalid or has expired. Please request a new reset link."
          );
        }

        setCheckingSession(false);
      } catch (err) {
        console.error("Recovery session error:", err);

        if (mounted) {
          setError(
            "Unable to verify the password reset session. Please request a new reset link."
          );

          setCheckingSession(false);
        }
      }
    };

    checkRecoverySession();

    // Supabase sends PASSWORD_RECOVERY when the reset link
    // creates the recovery session.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Reset password auth event:", event);

      if (!mounted) return;

      if (event === "PASSWORD_RECOVERY" && session) {
        setError("");
        setCheckingSession(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);


  // =====================================================
  // RESET PASSWORD
  // =====================================================

  const handleResetPassword = async (e) => {
    e.preventDefault();

    setError("");
    setSuccess("");

    // ---------------------------------------------
    // Validation
    // ---------------------------------------------

    if (!password || !passwordConfirmation) {
      setError("Please enter and confirm your new password.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== passwordConfirmation) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      // ---------------------------------------------
      // Make sure recovery session still exists
      // ---------------------------------------------

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError(
          "Your password reset session has expired. Please request a new reset link."
        );

        setLoading(false);
        return;
      }

      // ---------------------------------------------
      // Update password
      // ---------------------------------------------

      const { error: updateError } =
        await supabase.auth.updateUser({
          password,
        });

      if (updateError) {
        console.error("Password update error:", updateError);

        setError(updateError.message);
        setLoading(false);
        return;
      }

      // ---------------------------------------------
      // Success
      // ---------------------------------------------

      setSuccess(
        "Your password has been successfully updated. Redirecting to Login..."
      );

      // ---------------------------------------------
      // IMPORTANT:
      // Sign out first, then perform a FULL page
      // navigation to login.
      // ---------------------------------------------

      setTimeout(async () => {
        try {
          await supabase.auth.signOut();
        } catch (signOutError) {
          console.error(
            "Sign out after password reset error:",
            signOutError
          );
        }

        window.location.href = "/login";
      }, 1500);

    } catch (err) {
      console.error("Reset password error:", err);

      setError(
        "Something went wrong while resetting your password. Please try again."
      );

      setLoading(false);
    }
  };


  // =====================================================
  // LOADING
  // =====================================================

  if (checkingSession) {
    return (
      <>
        <DarkModeSwitcher />

        <div className="container sm:px-10">
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-slate-500">
              Checking password reset session...
            </div>
          </div>
        </div>
      </>
    );
  }


  // =====================================================
  // UI
  // =====================================================

  return (
    <>
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

              <div className="-intro-x text-white font-medium text-4xl leading-tight mt-10">
                Create a new
                <br />
                secure password.
              </div>

              <div className="-intro-x mt-5 text-lg text-white text-opacity-70 dark:text-slate-400">
                Choose a new password for your ISP SaaS account.
              </div>

            </div>
          </div>


          {/* =================================================
              RIGHT SIDE
          ================================================= */}

          <div className="h-screen xl:h-auto flex py-5 xl:py-0 my-10 xl:my-0">

            <div className="my-auto mx-auto xl:ml-20 bg-white dark:bg-darkmode-600 xl:bg-transparent px-5 sm:px-8 py-8 xl:p-0 rounded-md shadow-md xl:shadow-none w-full sm:w-3/4 lg:w-2/4 xl:w-auto">

              <h2 className="intro-x font-bold text-2xl xl:text-3xl text-center xl:text-left">
                Reset Password
              </h2>

              <div className="intro-x mt-2 text-slate-400 xl:hidden text-center">
                Create a new password for your account.
              </div>


              {/* =================================================
                  ERROR
              ================================================= */}

              {error && (
                <div className="intro-x mt-5 p-3 rounded-md bg-danger/10 text-danger text-sm">
                  {error}
                </div>
              )}


              {/* =================================================
                  SUCCESS
              ================================================= */}

              {success && (
                <div className="intro-x mt-5 p-3 rounded-md bg-success/10 text-success text-sm">
                  {success}
                </div>
              )}


              {/* =================================================
                  FORM
              ================================================= */}

              {!success && !error.includes("invalid or has expired") && (
                <form onSubmit={handleResetPassword}>

                  <div className="intro-x mt-8">

                    <input
                      type="password"
                      className="intro-x login__input form-control py-3 px-4 block"
                      placeholder="New Password"
                      value={password}
                      onChange={(e) =>
                        setPassword(e.target.value)
                      }
                      autoComplete="new-password"
                      disabled={loading}
                    />

                    <input
                      type="password"
                      className="intro-x login__input form-control py-3 px-4 block mt-4"
                      placeholder="Confirm New Password"
                      value={passwordConfirmation}
                      onChange={(e) =>
                        setPasswordConfirmation(e.target.value)
                      }
                      autoComplete="new-password"
                      disabled={loading}
                    />

                  </div>


                  {/* =================================================
                      BUTTONS
                  ================================================= */}

                  <div className="intro-x mt-5 xl:mt-8 text-center xl:text-left">

                    <button
                      type="submit"
                      disabled={loading}
                      className="btn btn-primary py-3 px-4 w-full xl:w-40 align-top"
                    >
                      {loading
                        ? "Updating..."
                        : "Update Password"}
                    </button>

                  </div>

                </form>
              )}


              {/* =================================================
                  BACK TO LOGIN
              ================================================= */}

              <div className="intro-x mt-6 text-center xl:text-left">

                <button
                  type="button"
                  onClick={() => {
                    window.location.href = "/login";
                  }}
                  className="text-primary"
                >
                  Back to Login
                </button>

              </div>


              {/* =================================================
                  FOOTER
              ================================================= */}

              <div className="intro-x mt-10 xl:mt-20 text-slate-600 dark:text-slate-500 text-center xl:text-left text-xs sm:text-sm">

                By using ISP SaaS, you agree to our{" "}

                <a
                  className="text-primary dark:text-slate-200"
                  href="#terms"
                  onClick={(e) => e.preventDefault()}
                >
                  Terms and Conditions
                </a>

                {" "} & {" "}

                <a
                  className="text-primary dark:text-slate-200"
                  href="#privacy"
                  onClick={(e) => e.preventDefault()}
                >
                  Privacy Policy
                </a>

              </div>

            </div>
          </div>

        </div>
      </div>
    </>
  );
}

export default Main;