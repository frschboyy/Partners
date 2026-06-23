import React from 'react';
import { logger } from '@/lib/logger';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    logger.error(error, { componentStack: info?.componentStack });
  }

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} onReset={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({ error, onReset }) {
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center p-8 text-center"
      style={{ background: 'hsl(var(--background, 0 0% 7%))', color: 'hsl(var(--foreground, 0 0% 97%))' }}
    >
      <p className="text-5xl mb-5">⚠️</p>
      <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
      <p className="text-sm mb-8 max-w-xs" style={{ color: 'hsl(var(--muted-foreground, 0 0% 55%))' }}>
        An unexpected error occurred. Your data is safe — reload the app to continue.
      </p>
      <button
        onClick={() => { onReset(); window.location.reload(); }}
        className="px-7 py-3 rounded-xl font-bold text-sm"
        style={{
          background: 'hsl(var(--theme-accent, 75 95% 57%))',
          color: 'hsl(var(--theme-accent-fg, 0 0% 5%))',
        }}
      >
        Reload App
      </button>

      {import.meta.env.DEV && (
        <details className="mt-8 text-left max-w-sm w-full">
          <summary
            className="cursor-pointer text-xs font-semibold"
            style={{ color: 'hsl(var(--muted-foreground))' }}
          >
            Error details (dev only)
          </summary>
          <pre
            className="mt-2 text-xs overflow-auto p-3 rounded-lg"
            style={{ background: 'hsl(var(--card))', color: 'hsl(var(--destructive))' }}
          >
            {error?.message}
            {'\n\n'}
            {error?.stack}
          </pre>
        </details>
      )}
    </div>
  );
}
