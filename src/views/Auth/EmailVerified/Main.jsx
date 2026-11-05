import DarkModeSwitcher from "@/components/dark-mode-switcher/Main";
import dom from "@left4code/tw-starter/dist/js/dom";
import logoUrl from "@/assets/images/logo.svg";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

function Main() {
  const navigate = useNavigate();

  useEffect(() => {
    dom("body").removeClass("main").removeClass("error-page").addClass("login");
  }, []);

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
                  Your email has been
                  <br />
                  successfully verified.
                </div>

                <div className="-intro-x mt-5 text-lg text-white text-opacity-70 dark:text-slate-400">
                  Your account is ready to use.
                </div>
              </div>
            </div>
            {/* END: Info */}

            {/* BEGIN: Verified Message */}
            <div className="h-screen xl:h-auto flex py-5 xl:py-0 my-10 xl:my-0">
              <div className="my-auto mx-auto xl:ml-20 bg-white dark:bg-darkmode-600 xl:bg-transparent px-5 sm:px-8 py-8 xl:p-0 rounded-md shadow-md xl:shadow-none w-full sm:w-3/4 lg:w-2/4 xl:w-auto">

                <div className="text-center xl:text-left">

                  <div className="flex justify-center xl:justify-start mb-6">
                    <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-success"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </div>
                  </div>

                  <h2 className="intro-x font-bold text-2xl xl:text-3xl">
                    Email Verified
                  </h2>

                  <div className="intro-x mt-4 text-slate-500 dark:text-slate-400 text-sm sm:text-base">
                    Your email address has been successfully verified.
                  </div>

                  <div className="intro-x mt-2 text-slate-500 dark:text-slate-400 text-sm sm:text-base">
                    You can now close this page and go back to the Login page.
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate("/login")}
                    className="btn btn-primary py-3 px-4 mt-6 w-full"
                  >
                    Go to Login
                  </button>

                  <div className="intro-x mt-4 text-xs text-slate-400">
                    You may close this browser tab after returning to Login.
                  </div>

                </div>

              </div>
            </div>
            {/* END: Verified Message */}

          </div>
        </div>
      </div>
    </>
  );
}

export default Main;