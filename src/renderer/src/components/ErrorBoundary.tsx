import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
    children: ReactNode;
    /**
     * Optional override for the fallback UI. Receives the error and a
     * reset callback that remounts the children.
     */
    fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
    error: Error | null;
    /** Incremented on reset to force React to unmount/remount children. */
    generation: number;
}

/**
 * Top-level renderer error boundary.
 *
 * Catches React render / lifecycle errors that would otherwise blank the
 * window with no breadcrumb. The error and component stack are forwarded
 * to the main process via `window.electronAPI.logRendererError` so they
 * land in the structured logger alongside main-process events.
 *
 * The fallback UI offers a one-click reset that bumps a `generation`
 * counter used as the children's `key`, forcing a true unmount/remount
 * so any corrupted local state is cleared.
 */
export class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null, generation: 0 };

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        // Best-effort: never let a logging failure cascade into another
        // boundary error. The preload-side wrapper already swallows IPC
        // failures, but guard here too in case `electronAPI` is missing
        // (e.g. running the renderer in a plain browser for storybook).
        try {
            window.electronAPI?.logRendererError({
                message: error.message,
                stack: error.stack ?? null,
                componentStack: info.componentStack ?? null,
                location:
                    typeof window !== "undefined"
                        ? (window.location?.href ?? null)
                        : null,
            });
        } catch (logErr) {
            console.error("[ErrorBoundary] failed to forward error", logErr);
        }
    }

    private reset = (): void => {
        this.setState((prev) => ({ error: null, generation: prev.generation + 1 }));
    };

    render(): ReactNode {
        const { error, generation } = this.state;
        if (!error) {
            return <div key={generation}>{this.props.children}</div>;
        }

        if (this.props.fallback) {
            return this.props.fallback(error, this.reset);
        }

        return (
            <div className="error-boundary" role="alert">
                <div className="error-boundary-card">
                    <h1 className="error-boundary-title">Something went wrong</h1>
                    <p className="error-boundary-message">{error.message}</p>
                    <button
                        type="button"
                        className="error-boundary-btn"
                        onClick={this.reset}
                    >
                        Try again
                    </button>
                </div>
            </div>
        );
    }
}
