import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, ExternalLink, Globe, Smartphone } from 'lucide-react';
import {
  recordClickEvent,
  resolvePublicShortLink,
  type PublicLinkRoute,
} from '../lib/firestore-service';
import {
  detectDeviceContext,
  resolveRedirection,
  SIMULATED_USER_AGENTS,
  validateSafeHttpsUrl,
  type DeviceContext,
  type RedirectPlan,
} from '../lib/redirect-engine/index';

type PageState =
  | { kind: 'loading' }
  | { kind: 'error'; code: number; title: string; message: string }
  | {
      kind: 'ready';
      route: PublicLinkRoute;
      plan: RedirectPlan;
      device: DeviceContext;
      isPreview: boolean;
    };

export function ShortRedirectPage() {
  const { shortCode } = useParams<{ shortCode: string }>();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const recordedRef = useRef(false);

  const isPreview = searchParams.get('preview') === '1';
  const simKey = searchParams.get('sim') || '';
  const srcQuery = searchParams.get('src') || searchParams.get('utm_source') || '';
  const forceRecord = searchParams.get('record') === '1';

  useEffect(() => {
    let active = true;
    recordedRef.current = false;

    async function loadAndResolve() {
      if (!shortCode) {
        if (active) {
          setState({
            kind: 'error',
            code: 404,
            title: 'Link not found',
            message: 'This SmartLink short URL is missing a valid short code.',
          });
        }
        return;
      }

      try {
        const found = await resolvePublicShortLink(shortCode);
        if (!active) return;

        if (!found) {
          setState({
            kind: 'error',
            code: 404,
            title: 'Link not found',
            message: 'This SmartLink short URL does not exist or may have been mistyped.',
          });
          return;
        }

        const { route, appConfig } = found;

        if (route.status !== 'active') {
          setState({
            kind: 'error',
            code: 410,
            title: 'Link unavailable',
            message: 'This SmartLink has been deactivated by its owner and is no longer active.',
          });
          return;
        }

        if (route.expiresAt && new Date(route.expiresAt).getTime() < Date.now()) {
          setState({
            kind: 'error',
            code: 410,
            title: 'Link expired',
            message: 'This SmartLink has passed its scheduled expiration date.',
          });
          return;
        }

        const safety = validateSafeHttpsUrl(route.normalizedUrl);
        if (!safety.valid) {
          setState({
            kind: 'error',
            code: 400,
            title: 'Blocked destination',
            message: 'This destination failed HTTPS safety validation and was blocked.',
          });
          return;
        }

        const simPreset =
          isPreview && simKey in SIMULATED_USER_AGENTS ? SIMULATED_USER_AGENTS[simKey] : null;
        const userAgent = simPreset ? simPreset.ua : navigator.userAgent || '';
        const referer = simPreset ? simPreset.referer : document.referrer || '';
        const device = detectDeviceContext(userAgent, referer, srcQuery);

        const plan = resolveRedirection({
          destinationType: route.destinationType,
          normalizedUrl: route.normalizedUrl,
          destinationConfig: route.destinationConfig,
          appConfig,
          device,
        });

        setState({ kind: 'ready', route, plan, device, isPreview });

        // Record click telemetry once (skip dry preview unless record=1)
        const shouldRecord = (!isPreview || forceRecord) && !recordedRef.current;
        if (shouldRecord) {
          recordedRef.current = true;
          void recordClickEvent({
            smartLinkId: route.smartLinkId,
            shortCode: route.shortCode,
            ownerId: route.ownerId,
            destinationType: route.destinationType,
            campaignId: route.campaignId,
            platform: device.platform,
            deviceCategory: device.deviceCategory,
            browser: device.browser,
            referralSource: device.referralSource,
            redirectOutcome: plan.outcome,
          });
        }

        // Execute live redirect behavior when not in preview mode
        if (!isPreview) {
          if (plan.strategy === 'direct_302') {
            window.location.replace(plan.webFallbackUrl);
          } else if (plan.autoAttemptUrl) {
            const target = plan.autoAttemptUrl;
            window.setTimeout(() => {
              window.location.href = target;
            }, 220);
          }
        }
      } catch {
        if (active) {
          setState({
            kind: 'error',
            code: 500,
            title: 'Temporary redirect error',
            message: 'We encountered an error resolving this link. Please try again in a moment.',
          });
        }
      }
    }

    void loadAndResolve();
    return () => {
      active = false;
    };
  }, [shortCode, isPreview, simKey, srcQuery, forceRecord]);

  const handleManualAction = (outcome: 'manual_app_click' | 'manual_browser_click', href: string) => {
    if (state.kind !== 'ready') return;
    if (!state.isPreview) {
      void recordClickEvent({
        smartLinkId: state.route.smartLinkId,
        shortCode: state.route.shortCode,
        ownerId: state.route.ownerId,
        destinationType: state.route.destinationType,
        campaignId: state.route.campaignId,
        platform: state.device.platform,
        deviceCategory: state.device.deviceCategory,
        browser: state.device.browser,
        referralSource: state.device.referralSource,
        redirectOutcome: outcome,
      });
      window.location.href = href;
    } else {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  };

  if (state.kind === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFB] dark:bg-[#090D16] p-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-9 w-9 rounded-lg bg-blue-600 text-white font-display text-xs font-bold flex items-center justify-center">
            SL
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Resolving destination...
          </p>
        </div>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFB] dark:bg-[#090D16] p-5">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 text-center shadow-xs space-y-3">
          <div className="mx-auto h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
            <AlertCircle className="h-5 w-5" />
          </div>
          <p className="font-mono text-xs text-slate-500 dark:text-slate-400">HTTP {state.code}</p>
          <h1 className="font-display text-lg font-bold text-slate-950 dark:text-white">
            {state.title}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {state.message}
          </p>
        </div>
      </div>
    );
  }

  const { route, plan, isPreview: previewMode } = state;
  const appTarget = plan.primaryAppUrl || plan.webFallbackUrl;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAFB] dark:bg-[#090D16] p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 shadow-sm space-y-5">
        {/* Brand Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-blue-600 text-white font-display text-[11px] font-bold flex items-center justify-center">
              SL
            </div>
            <span className="font-display text-sm font-bold text-slate-950 dark:text-white">
              SmartLink
            </span>
          </div>
          <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
            /r/{route.shortCode}
          </span>
        </div>

        {/* Dynamic Heading */}
        <div className="space-y-1.5">
          <h1 className="font-display text-xl font-bold tracking-tight text-slate-950 dark:text-white">
            Continue to your destination
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {route.linkName} &middot; {plan.appDisplayName}
          </p>
        </div>

        {/* Dynamic Action Buttons */}
        <div className="space-y-2.5">
          {plan.primaryAppUrl && (
            <button
              type="button"
              onClick={() => handleManualAction('manual_app_click', appTarget)}
              className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Smartphone className="h-4 w-4" />
              <span>{plan.openAppButtonLabel}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleManualAction('manual_browser_click', plan.webFallbackUrl)}
            className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Globe className="h-4 w-4" />
            <span>{plan.openBrowserButtonLabel}</span>
          </button>

          {plan.storeUrl && (
            <a
              href={plan.storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-10 rounded-xl text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center justify-center gap-1.5"
            >
              <span>Install {plan.appDisplayName}</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>

        {/* In-App Browser Guidance */}
        {plan.inAppHelperNote && (
          <div className="rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 p-3 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {plan.inAppHelperNote}
          </div>
        )}

        {/* Verified Destination Preview */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
          <span className="truncate max-w-[210px] font-mono">{plan.webFallbackUrl}</span>
          {previewMode && <span className="font-medium text-blue-600 dark:text-blue-400">Preview</span>}
        </div>
      </div>
    </div>
  );
}
