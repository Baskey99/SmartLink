import React, { useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Play, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { SIMULATED_USER_AGENTS, detectDeviceContext } from '../../lib/redirect-engine/user-agent';
import { resolveRedirection } from '../../lib/redirect-engine/index';
import type { DestinationConfigJson } from '../../db/schema';
import { buildShortUrl, DESTINATION_LABELS } from '../../lib/utils';
import { Button, Modal } from '../ui/primitives';

export interface PreviewLinkItem {
  id: string;
  linkName: string;
  shortCode: string;
  originalUrl: string;
  normalizedUrl: string;
  destinationType: string;
  destinationConfig: DestinationConfigJson;
}

const ENV_KEYS = [
  'instagram_ios',
  'instagram_android',
  'facebook_ios',
  'android_chrome',
  'ios_safari',
  'desktop_chrome',
] as const;

export function RedirectPreviewModal({
  link,
  open,
  onClose,
  onClickRecorded,
}: {
  link: PreviewLinkItem | null;
  open: boolean;
  onClose: () => void;
  onClickRecorded?: () => void;
}) {
  const [envKey, setEnvKey] = useState<string>('instagram_ios');
  const [recording, setRecording] = useState(false);
  const [copied, setCopied] = useState(false);

  const simulation = useMemo(() => {
    if (!link) return null;
    const preset = SIMULATED_USER_AGENTS[envKey];
    const device = detectDeviceContext(preset.ua, preset.referer);
    const plan = resolveRedirection({
      destinationType: link.destinationType,
      normalizedUrl: link.normalizedUrl,
      destinationConfig: link.destinationConfig,
      appConfig: null,
      device,
    });
    return { preset, device, plan };
  }, [link, envKey]);

  if (!link || !simulation) return null;

  const shortUrl = buildShortUrl(link.shortCode, link.destinationConfig?.customDomain);
  const previewFrameUrl = `/r/${encodeURIComponent(link.shortCode)}?preview=1&sim=${encodeURIComponent(envKey)}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shortUrl);
    setCopied(true);
    toast.success('Short URL copied to clipboard');
    setTimeout(() => setCopied(false), 1800);
  };

  const handleRecordSimulatedClick = async () => {
    setRecording(true);
    try {
      await fetch(`/r/${encodeURIComponent(link.shortCode)}?preview=1&record=1&sim=${encodeURIComponent(envKey)}`);
      toast.success(`Recorded simulated click from ${simulation.preset.label}`);
      onClickRecorded?.();
    } catch {
      toast.error('Failed to trigger test redirect');
    } finally {
      setRecording(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Universal Redirect Preview & Simulator"
      description="Inspect how SmartLink handles in-app browsers, mobile App Links, Universal Links, and desktop fallbacks."
      maxWidth="max-w-4xl"
    >
      <div className="space-y-5">
        {/* Environment Selector */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 p-1.5 border border-slate-200 dark:border-slate-800">
          {ENV_KEYS.map((key) => {
            const active = envKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setEnvKey(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-white dark:bg-slate-800 text-slate-950 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-200'
                }`}
              >
                {SIMULATED_USER_AGENTS[key].label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Technical Resolution Details */}
          <div className="lg:col-span-6 space-y-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Short URL</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <code className="text-sm font-medium text-blue-600 dark:text-blue-400 break-all">
                    {shortUrl}
                  </code>
                  <Button variant="secondary" size="sm" onClick={handleCopy}>
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </Button>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Destination Type</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {DESTINATION_LABELS[link.destinationType] || link.destinationType}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Detected Platform</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100 capitalize">
                    {simulation.device.platform} &middot; {simulation.device.deviceCategory}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Browser Context</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {simulation.device.browser}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block">Redirect Strategy</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {simulation.plan.strategy === 'direct_302'
                      ? 'Direct 302 Web Redirect'
                      : simulation.plan.strategy === 'inapp_fallback_ui'
                        ? 'In-App Fallback UI'
                        : 'App Link / Intent + Fallback'}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3 text-xs">
              <div>
                <div className="text-slate-500 dark:text-slate-400 mb-1">Primary App Navigation Target</div>
                <code className="block rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2 text-[11px] break-all text-slate-800 dark:text-slate-200">
                  {simulation.plan.primaryAppUrl || 'Direct to HTTPS web URL (Desktop)'}
                </code>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400 mb-1">Verified HTTPS Web Fallback</div>
                <code className="block rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2 text-[11px] break-all text-slate-800 dark:text-slate-200">
                  {simulation.plan.webFallbackUrl}
                </code>
              </div>
              {link.destinationConfig?.contentId && (
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Preserved Content ID: </span>
                  <code className="text-slate-900 dark:text-slate-100 font-medium">
                    {link.destinationConfig.contentId}
                  </code>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                variant="primary"
                size="sm"
                onClick={handleRecordSimulatedClick}
                disabled={recording}
              >
                <Play className="h-3.5 w-3.5" />
                <span>{recording ? 'Recording...' : 'Trigger Live Test Click'}</span>
              </Button>
              <a
                href={`/r/${encodeURIComponent(link.shortCode)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Open Live Short URL</span>
              </a>
            </div>
          </div>

          {/* Right: Live Rendered Backend Redirect Page */}
          <div className="lg:col-span-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-950 p-3">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2 px-1">
                <span className="flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5" />
                  <span>Rendered Interstitial ({simulation.preset.label})</span>
                </span>
                <span className="font-mono">/r/{link.shortCode}</span>
              </div>
              {simulation.plan.strategy === 'direct_302' ? (
                <div className="h-[380px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex flex-col items-center justify-center p-6 text-center">
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400">HTTP 302 Found</p>
                  <h4 className="mt-2 text-base font-semibold text-slate-900 dark:text-white">
                    Immediate Desktop Redirect
                  </h4>
                  <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 max-w-xs">
                    Desktop traffic bypasses the mobile interstitial and redirects directly to the normalized HTTPS destination.
                  </p>
                  <code className="mt-4 text-xs text-blue-600 dark:text-blue-400 break-all max-w-full">
                    {simulation.plan.webFallbackUrl}
                  </code>
                </div>
              ) : (
                <iframe
                  title="SmartLink Redirect Preview"
                  src={previewFrameUrl}
                  className="w-full h-[380px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white"
                  sandbox="allow-scripts allow-popups"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
