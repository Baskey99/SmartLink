import React from 'react';
import { AlertTriangle, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';
import { classifyFirestoreError, type ClassifiedFirestoreError } from '../lib/firestore-errors';
import { Button } from './ui/primitives';

interface ErrorBoundaryState {
  hasError: boolean;
  classified: ClassifiedFirestoreError | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, classified: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      classified: classifyFirestoreError(error),
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('SmartLink ErrorBoundary caught error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError && this.state.classified) {
      const { classified } = this.state;
      const isNetwork = classified.category === 'network';
      const isPermission = classified.category === 'permission' || classified.category === 'auth';
      const Icon = isNetwork ? WifiOff : isPermission ? ShieldAlert : AlertTriangle;
      const iconColors = isNetwork
        ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400'
        : 'bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400';

      return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAFAFB] dark:bg-[#090D16] p-6">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 shadow-sm text-center space-y-4">
            <div className={`mx-auto h-11 w-11 rounded-lg flex items-center justify-center ${iconColors}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {classified.categoryLabel}
              </p>
              <h1 className="font-display text-lg font-bold text-slate-950 dark:text-white">
                {classified.title}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {classified.message}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed pt-1">
                {classified.guidance}
              </p>
            </div>
            <div className="pt-2 flex items-center justify-center gap-2.5">
              <Button
                variant="primary"
                onClick={() => {
                  this.setState({ hasError: false, classified: null });
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
