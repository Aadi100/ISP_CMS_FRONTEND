import { Component } from "react";

// Catches render errors so one broken screen shows a message instead of a blank page.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Screen crashed:", error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const msg = String(this.state.error?.message || this.state.error);
    return (
      <div className="p-8 max-w-xl mx-auto mt-20 text-center box">
        <div className="text-lg font-medium text-danger">Something went wrong on this screen</div>
        <div className="mt-2 text-slate-500 break-words">{msg}</div>
        <div className="mt-5 flex justify-center gap-2">
          <button className="btn btn-primary" onClick={() => this.setState({ error: null })}>Try again</button>
          <button className="btn btn-outline-secondary" onClick={() => (window.location.href = "/")}>Go to dashboard</button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
