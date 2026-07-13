import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Custom fallback; defaults to a full-screen reload prompt. */
  fallback?: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Catches render errors in its subtree and shows a fallback instead of a blank
 * screen — React unmounts the whole tree on an uncaught error, so without this
 * one bad value (e.g. an invalid currency code) blanks the entire app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? <ReloadFallback />;
    }
    return this.props.children;
  }
}

function ReloadFallback() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-900 p-6 text-center text-slate-300">
      <p className="text-4xl">⚠️</p>
      <p className="text-lg font-semibold text-slate-100">發生錯誤 / Something went wrong</p>
      <p className="text-sm text-slate-500">畫面出了點問題，請重新整理。</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900"
      >
        重新整理
      </button>
    </div>
  );
}
