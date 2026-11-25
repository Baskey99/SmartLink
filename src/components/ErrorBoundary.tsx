import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './ui/primitives';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'An unexpected application error occurred.';
    try {
      const parsed = JSON.parse(error.message);
      if (parsed && typeof parsed.error === 'string') {
        readable = parsed.error.includes('Missing or insufficient permissions')
          ? 'You do not have permission to access this resource. Please verify your sign-in session and try again.'
          : parsed.error;
      }
    } catch {
      // Plain error message
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('SmartLink ErrorBoundary caught error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAFAFB] dark:bg-[#090D16] p-6">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 shadow-sm text-center space-y-4">
            <div className="mx-auto h-11 w-11 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="space-y-1.5">
              <h1 className="font-display text-lg font-bold text-slate-950 dark:text-white">
                Something went wrong
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {this.state.message}
              </p>
            </div>
            <div className="pt-2 flex items-center justify-center gap-2.5">
              <Button
                variant="primary"
                onClick={() => {
                  this.setState({ hasError: false, message: '' });
                  window.location.reload();
                }}
              >
                <RefreshCw className="h-4 w-4" />
                <span>Reload Workspace</span>
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
