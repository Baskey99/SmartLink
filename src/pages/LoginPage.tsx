import React from 'react';
import { ArrowRight, ExternalLink, Moon, ShieldCheck, Smartphone, Sun } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Button } from '../components/ui/primitives';

export function LoginPage() {
  const { signInWithGoogle, loading, authError } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFB] dark:bg-[#090D16] text-slate-900 dark:text-slate-100">
      <header className="flex h-14 sm:h-16 items-center justify-between gap-6 px-4 sm:px-6 lg:px-10 border-b border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0E1422]">
        <div className="font-display text-lg font-bold tracking-tight text-slate-950 dark:text-white whitespace-nowrap shrink-0 flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white text-xs font-bold">
            SL
          </span>
          <span>SmartLink</span>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle color theme"
          className="flex h-10 w-10 sm:h-9 sm:w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-8 sm:py-12 lg:py-16">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-10 lg:gap-14 items-stretch">
          {/* Sign In Panel (top on mobile/tablet, right on desktop) */}
          <div className="order-1 lg:order-2 lg:col-span-5 flex flex-col justify-center">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 sm:p-8">
              <h2 className="font-display text-xl font-bold text-slate-950 dark:text-white">
                Sign in to SmartLink
              </h2>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                Access your workspace, link analytics, campaigns, and universal redirect configurations.
              </p>

              {authError && (
                <div className="mt-5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-3.5 text-xs text-red-700 dark:text-red-300">
                  {authError}
                </div>
              )}

              <div className="mt-6">
                <Button
                  type="button"
                  size="lg"
                  className="w-full"
                  onClick={() => void signInWithGoogle()}
                  disabled={loading}
                >
                  <span>{loading ? 'Signing in...' : 'Continue with Google'}</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs text-slate-500 dark:text-slate-400">
                <p>
                  Role-based access control is enabled automatically. Workspace administrators can manage application adapters, custom short domains, and team roles.
                </p>
              </div>
            </div>
          </div>

          {/* Product Architecture Overview (below Sign In on mobile/tablet, left on desktop) */}
          <div className="order-2 lg:order-1 lg:col-span-7 flex flex-col justify-center space-y-5 sm:space-y-6">
            <div className="space-y-3 sm:space-y-4">
              <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
                Universal URL Shortener &middot; Mobile App Redirection
              </p>
              <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-slate-950 dark:text-white leading-tight [text-wrap:balance]">
                Route every social click straight into the native mobile app.
              </h1>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl">
                Stop losing conversions inside Instagram and Facebook in-app browsers. SmartLink resolves verified Android App Links, iOS Universal Links, and clean manual fallbacks from a single short URL.
              </p>
            </div>

            {/* Mechanism-to-Outcome Flow */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 sm:p-5 space-y-4">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                How SmartLink resolves a click
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                    <Smartphone className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>01. Detect Context</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Identifies Android, iOS, Desktop, and Instagram or Facebook in-app browsers without fingerprinting.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                    <ExternalLink className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>02. Preserve Content ID</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Opens the exact YouTube video, WhatsApp chat, Maps pin, or store listing via modular app adapters.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white">
                    <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>03. Verified Fallback</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Displays a lightweight choice screen when social browsers restrict automatic handoff.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 sm:gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
              <span>YouTube</span>
              <span aria-hidden="true">&middot;</span>
              <span>WhatsApp</span>
              <span aria-hidden="true">&middot;</span>
              <span>Instagram</span>
              <span aria-hidden="true">&middot;</span>
              <span>Google Maps</span>
              <span aria-hidden="true">&middot;</span>
              <span>Play Store &amp; App Store</span>
              <span aria-hidden="true">&middot;</span>
              <span>Custom Apps</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
