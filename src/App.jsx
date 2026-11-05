import ScrollToTop from "@/base-components/scroll-to-top/Main";
import { BrowserRouter } from "react-router-dom";
import { RecoilRoot } from "recoil";
import Router from "./router";
import ErrorBoundary from "@/base-components/error-boundary/Main";

function App() {
  return (
    <RecoilRoot>
      <BrowserRouter>
        <ErrorBoundary resetKey={window.location.pathname}>
          <Router />
        </ErrorBoundary>
        <ScrollToTop />
      </BrowserRouter>
    </RecoilRoot>
  );
}

export default App;
