import DarkModeSwitcher from "@/components/dark-mode-switcher/Main";
import dom from "@left4code/tw-starter/dist/js/dom";
import logoUrl from "@/assets/images/logo.svg";
import illustrationUrl from "@/assets/images/illustration.svg";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { getPublicSettings } from "@/lib/platform";
import { friendlyError } from "@/lib/errors";

function Main() {
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [signupAllowed, setSignupAllowed] = useState(true);

  useEffect(() => {
    getPublicSettings({ force: true }).then((st) => {
      if (st && st.allow_self_signup === false) setSignupAllowed(false);
    });
  }, []);

  useEffect(() => {
    dom("body").removeClass("main").removeClass("error-page").addClass("login");
  }, []);

  const handleRegister = async (e) => {
    e.preventDefault();

    setError("");
    setSuccess("");

    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !orgName.trim() ||
      !email ||
      !password ||
      !passwordConfirmation
    ) {
      setError("Please fill in all fields.");
      return;
    }

    if (password !== passwordConfirmation) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`;

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName,
            organization_name: orgName.trim(),
          },

          // After clicking the verification email,
          // Supabase will send the user here.
          emailRedirectTo: `${window.location.origin}/email-verified`,
        },
      });

      if (signUpError) {
        setError(
          /database error saving new user/i.test(signUpError.message || "")
            ? "Sign-up is by invitation only. Please ask your administrator for an invite."
            : friendlyError(signUpError)
        );
        setLoading(false);
        return;
      }

      if (data?.session) {
        window.location.href = "/";
        return;
      }

      setSuccess(
        "Registration successful! Please check your email to confirm your account."
      );

      setTimeout(() => {
        navigate("/login");
      }, 2500);
    } catch (err) {
      setError(friendlyError(err));
    }

    setLoading(false);
  };

  const handleGoogleRegister = async () => {
    setError("");
    setSuccess("");
    setGoogleLoading(true);

    try {
      const { error: googleError } =
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}/login`,
          },
        });

      if (googleError) {
        setError(friendlyError(googleError));
        setGoogleLoading(false);
      }
    } catch (err) {
      console.error("Google registration error:", err);
      setError("Unable to continue with Google.");
      setGoogleLoading(false);
    }
  };

  return (
    <>
      <div>
        <DarkModeSwitcher />

        <div className="container sm:px-10">
          <div className="block xl:grid grid-cols-2 gap-4">

            {/* BEGIN: Register Info */}
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
                <img
                  alt="ISP Management Platform"
                  className="-intro-x w-1/2 -mt-16"
                  src={illustrationUrl}
                />

                <div className="-intro-x text-white font-medium text-4xl leading-tight mt-10">
                  Create your
                  <br />
                  ISP management account.
                </div>

                <div className="-intro-x mt-5 text-lg text-white text-opacity-70 dark:text-slate-400">
                  Manage your ISP business from one place.
                </div>
              </div>
            </div>
            {/* END: Register Info */}

            {/* BEGIN: Register Form */}
            <div className="h-screen xl:h-auto flex py-5 xl:py-0 my-10 xl:my-0">
              <div className="my-auto mx-auto xl:ml-20 bg-white dark:bg-darkmode-600 xl:bg-transparent px-5 sm:px-8 py-8 xl:p-0 rounded-md shadow-md xl:shadow-none w-full sm:w-3/4 lg:w-2/4 xl:w-auto">

                <h2 className="intro-x font-bold text-2xl xl:text-3xl text-center xl:text-left">
                  Sign Up
                </h2>

                <div className="intro-x mt-2 text-slate-400 dark:text-slate-400 xl:hidden text-center">
                  Create your account to manage your ISP business.
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

                {signupAllowed ? (
                <>
                <form onSubmit={handleRegister}>
                  <div className="intro-x mt-8">

                    <input
                      type="text"
                      className="intro-x login__input form-control py-3 px-4 block"
                      placeholder="First Name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      autoComplete="given-name"
                    />

                    <input
                      type="text"
                      className="intro-x login__input form-control py-3 px-4 block mt-4"
                      placeholder="Last Name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      autoComplete="family-name"
                    />

                    <input
                      type="text"
                      className="intro-x login__input form-control py-3 px-4 block mt-4"
                      placeholder="ISP / company name"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      autoComplete="organization"
                    />

                    <input
                      type="email"
                      className="intro-x login__input form-control py-3 px-4 block mt-4"
                      placeholder="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />

                    <input
                      type="password"
                      className="intro-x login__input form-control py-3 px-4 block mt-4"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                    />

                    <div className="intro-x w-full grid grid-cols-12 gap-4 h-1 mt-3">
                      <div className="col-span-3 h-full rounded bg-success"></div>
                      <div className="col-span-3 h-full rounded bg-success"></div>
                      <div className="col-span-3 h-full rounded bg-success"></div>
                      <div className="col-span-3 h-full rounded bg-slate-100 dark:bg-darkmode-800"></div>
                    </div>

                    <a
                      href="#password-help"
                      onClick={(e) => e.preventDefault()}
                      className="intro-x text-slate-500 block mt-2 text-xs sm:text-sm"
                    >
                      Use a strong password with at least 6 characters.
                    </a>

                    <input
                      type="password"
                      className="intro-x login__input form-control py-3 px-4 block mt-4"
                      placeholder="Password Confirmation"
                      value={passwordConfirmation}
                      onChange={(e) =>
                        setPasswordConfirmation(e.target.value)
                      }
                      autoComplete="new-password"
                    />
                  </div>

                  <div className="intro-x flex items-center text-slate-600 dark:text-slate-500 mt-4 text-xs sm:text-sm">
                    <input
                      id="remember-me"
                      type="checkbox"
                      className="form-check-input border mr-2"
                    />

                    <label
                      className="cursor-pointer select-none"
                      htmlFor="remember-me"
                    >
                      I agree to the
                    </label>

                    <a
                      className="text-primary dark:text-slate-200 ml-1"
                      href="#privacy"
                      onClick={(e) => e.preventDefault()}
                    >
                      Privacy Policy
                    </a>
                    .
                  </div>

                  <div className="intro-x mt-5 xl:mt-8 text-center xl:text-left">

                    <button
                      type="submit"
                      disabled={loading || googleLoading}
                      className="btn btn-primary py-3 px-4 w-full xl:w-32 xl:mr-3 align-top"
                    >
                      {loading ? "Registering..." : "Register"}
                    </button>

                    <button
                      type="button"
                      onClick={() => navigate("/login")}
                      className="btn btn-outline-secondary py-3 px-4 w-full xl:w-32 mt-3 xl:mt-0 align-top"
                    >
                      Sign in
                    </button>

                  </div>
                </form>

                {/* Divider */}
                <div className="intro-x flex items-center mt-6">
                  <div className="h-px bg-slate-200 dark:bg-darkmode-400 flex-1"></div>

                  <div className="px-4 text-slate-400 text-xs">
                    OR
                  </div>

                  <div className="h-px bg-slate-200 dark:bg-darkmode-400 flex-1"></div>
                </div>

                {/* Google */}
                <button
                  type="button"
                  onClick={handleGoogleRegister}
                  disabled={loading || googleLoading}
                  className="btn btn-outline-secondary py-3 px-4 w-full mt-5"
                >
                  {googleLoading
                    ? "Connecting..."
                    : "Continue with Google"}
                </button>

                </>
                ) : (
                  <div className="intro-x mt-8 p-4 rounded-md bg-warning/20 text-slate-700 dark:text-slate-300 text-sm">
                    Sign-up is by invitation only. Please ask your administrator for an invite.
                  </div>
                )}

                <div className="intro-x mt-6 text-center text-slate-500 text-xs">
                  Already have an account?{" "}
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
            {/* END: Register Form */}

          </div>
        </div>
      </div>
    </>
  );
}

export default Main;