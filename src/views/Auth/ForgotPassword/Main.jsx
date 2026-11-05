import DarkModeSwitcher from "@/components/dark-mode-switcher/Main";
import dom from "@left4code/tw-starter/dist/js/dom";
import logoUrl from "@/assets/images/logo.svg";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

function Main() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    dom("body").removeClass("main").removeClass("error-page").addClass("login");
  }, []);

  const handleForgotPassword = async (e) => {
    e.preventDefault();

    setError("");
    setSuccess("");

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${window.location.origin}/reset-password`,
        }
      );

      if (resetError) {
        setError(resetError.message);
        setLoading(false);
        return;
      }

      setSuccess(
        "Password reset email sent. Please check your inbox and follow the link to reset your password."
      );
    } catch (err) {
      console.error("Forgot password error:", err);
      setError("Something went wrong. Please try again.");
    }

    setLoading(false);
  };

  return (
    <>
      <div>
        <DarkModeSwitcher />

        <div className="container sm:px-10">
          <div className="block xl:grid grid-cols-2 gap-4">

            {/* BEGIN: Info */}
            <div className="hidden xl:flex flex-col min-h-screen">
              <a
                href="/login"
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
                <div className="-intro-x text-white font-medium text-4xl leading-tight">
                  Reset your
                  <br />
                  account password.
                </div>

                <div className="-intro-x mt-5 text-lg text-white text-opacity-70 dark:text-slate-400">
                  We'll send you a secure link to reset your password.
                </div>
              </div>
            </div>
            {/* END: Info */}

            {/* BEGIN: Forgot Password Form */}
            <div className="h-screen xl:h-auto flex py-5 xl:py-0 my-10 xl:my-0">
              <div className="my-auto mx-auto xl:ml-20 bg-white dark:bg-darkmode-600 xl:bg-transparent px-5 sm:px-8 py-8 xl:p-0 rounded-md shadow-md xl:shadow-none w-full sm:w-3/4 lg:w-2/4 xl:w-auto">

                <h2 className="intro-x font-bold text-2xl xl:text-3xl text-center xl:text-left">
                  Forgot Password
                </h2>

                <div className="intro-x mt-2 text-slate-400 dark:text-slate-400 text-center xl:text-left">
                  Enter your email address and we'll send you a password
                  reset link.
                </div>

                {/* Error */}
                {error && (
                  <div className="intro-x mt-5 p-3 rounded-md bg-danger/10 text-danger text-sm">
                    {error}
                  </div>
                )}

                {/* Success */}
                {success && (
                  <div className="intro-x mt-5 p-3 rounded-md bg-success/10 text-success text-sm">
                    {success}
                  </div>
                )}

                <form onSubmit={handleForgotPassword}>
                  <div className="intro-x mt-8">

                    <input
                      type="email"
                      className="intro-x login__input form-control py-3 px-4 block"
                      placeholder="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />

                  </div>

                  <div className="intro-x mt-5 xl:mt-8">
                    <button
                      type="submit"
                      disabled={loading}
                      className="btn btn-primary py-3 px-4 w-full"
                    >
                      {loading ? "Sending..." : "Send Reset Link"}
                    </button>
                  </div>
                </form>

                <div className="intro-x mt-6 text-center text-slate-500 text-xs">
                  Remember your password?{" "}
                  <button
                    type="button"
                    onClick={() => navigate("/login")}
                    className="text-primary"
                  >
                    Sign in
                  </button>
                </div>

              </div>
            </div>
            {/* END: Forgot Password Form */}

          </div>
        </div>
      </div>
    </>
  );
}

export default Main;