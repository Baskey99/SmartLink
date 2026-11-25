import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  CheckCircle2,
  Copy,
  Eye,
  QrCode,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import {
  createSmartLink,
  listCampaigns,
  listSupportedApps,
} from '../lib/firestore-service';
import { processDestinationUrl, type DestinationConfigJson } from '../lib/redirect-engine/index';
import { buildShortUrl, DESTINATION_LABELS } from '../lib/utils';
import { Button, Input, Label, Modal, Panel, Select } from '../components/ui/primitives';
import { RedirectPreviewModal, type PreviewLinkItem } from '../components/links/RedirectPreviewModal';
import { QrCodeStudio } from '../components/qr/QrCodeStudio';

interface CampaignOption {
  id: string;
  campaignName: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

interface CreatedLinkResponse {
  link: PreviewLinkItem & {
    status: string;
    destinationConfig: DestinationConfigJson;
  };
}

export function CreateSmartLinkPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const [linkName, setLinkName] = useState('');
  const [destinationType, setDestinationType] = useState('auto');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [customShortCode, setCustomShortCode] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [fallbackPreference, setFallbackPreference] = useState<'app_first' | 'web_only' | 'interstitial_always'>('app_first');
  const [expiresAt, setExpiresAt] = useState('');
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');
  const [customDomain, setCustomDomain] = useState('');

  const [createdLink, setCreatedLink] = useState<CreatedLinkResponse['link'] | null>(null);
  const [copied, setCopied] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const { data: appsData } = useQuery({
    queryKey: ['supported-apps'],
    queryFn: async () => ({ apps: await listSupportedApps() }),
    enabled: Boolean(profile),
  });

  const { data: campaignsData } = useQuery({
    queryKey: ['campaigns', profile?.id],
    queryFn: async () => ({ campaigns: await listCampaigns(profile!) }),
    enabled: Boolean(profile),
  });

  const activeApps = useMemo(
    () => (appsData?.apps || []).filter((a) => a.isActive),
    [appsData]
  );

  // Real-time client-side URL inspection via the exact same universal redirect engine
  const liveInspection = useMemo(() => {
    if (!destinationUrl.trim()) return null;
    const explicitApp =
      destinationType !== 'auto'
        ? activeApps.find((a) => a.appType === destinationType) || null
        : null;
    return processDestinationUrl(destinationUrl, destinationType, explicitApp, fallbackPreference);
  }, [destinationUrl, destinationType, activeApps, fallbackPreference]);

  const createMutation = useMutation({
    mutationFn: () =>
      createSmartLink(profile!, {
        linkName,
        destinationType,
        destinationUrl,
        customShortCode: customShortCode.trim() || undefined,
        campaignId: campaignId || null,
        fallbackPreference,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        utmSource: utmSource.trim() || undefined,
        utmMedium: utmMedium.trim() || undefined,
        utmCampaign: utmCampaign.trim() || undefined,
        customDomain: customDomain.trim() || undefined,
      }),
    onSuccess: (res) => {
      setCreatedLink(res.link);
      toast.success('Smart link created and ready to share');
      void queryClient.invalidateQueries({ queryKey: ['smart-links'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-analytics'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create smart link');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkName.trim()) {
      toast.error('Please enter a link name.');
      return;
    }
    if (!liveInspection?.valid) {
      toast.error(liveInspection?.error || 'Please enter a valid HTTPS destination URL.');
      return;
    }
    createMutation.mutate();
  };

  const resetForm = () => {
    setLinkName('');
    setDestinationUrl('');
    setDestinationType('auto');
    setCustomShortCode('');
    setCampaignId('');
    setExpiresAt('');
    setUtmSource('');
    setUtmMedium('');
    setUtmCampaign('');
    setCreatedLink(null);
  };

  const handleCopyCreated = async () => {
    if (!createdLink) return;
    const url = buildShortUrl(createdLink.shortCode, createdLink.destinationConfig?.customDomain);
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('Short URL copied to clipboard');
    setTimeout(() => setCopied(false), 1800);
  };

  const quickExamples = [
    { label: 'YouTube Video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    { label: 'WhatsApp Chat', url: 'https://wa.me/15551234567?text=Hello%20SmartLink' },
    { label: 'Instagram Reel', url: 'https://www.instagram.com/reel/C8xYz123AbC/' },
    { label: 'Google Maps', url: 'https://maps.google.com/?q=37.4220,-122.0841' },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
          Create Smart Link
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Generate a universal short URL with automatic platform detection, verified deep-link resolution, and in-app browser fallback.
        </p>
      </div>

      {createdLink && (
        <Panel className="p-4 sm:p-6 border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-950 dark:text-white">
                  {createdLink.linkName} is live
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <code className="font-semibold text-blue-600 dark:text-blue-400 break-all">
                    {buildShortUrl(createdLink.shortCode, createdLink.destinationConfig?.customDomain)}
                  </code>
                  <span className="text-slate-400">&middot;</span>
                  <span className="text-xs text-slate-600 dark:text-slate-300">
                    {DESTINATION_LABELS[createdLink.destinationType] || createdLink.destinationType}
                  </span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
              <Button variant="primary" size="sm" onClick={() => void handleCopyCreated()}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Copied' : 'Copy URL'}</span>
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setPreviewOpen(true)}>
                <Eye className="h-3.5 w-3.5" />
                <span>Test Redirect</span>
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setQrOpen(true)}>
                <QrCode className="h-3.5 w-3.5" />
                <span>QR Code</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={resetForm}>
                Create Another
              </Button>
            </div>
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
        {/* Form Column */}
        <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-5 sm:space-y-6">
          <Panel className="p-4 sm:p-6 space-y-4 sm:space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-950 dark:text-white">
                Basic Information
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Enter your target HTTPS URL. SmartLink automatically detects the destination application and preserves content IDs.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="link-name" required>
                  Link Name
                </Label>
                <Input
                  id="link-name"
                  placeholder="e.g. Summer Launch YouTube Ad"
                  value={linkName}
                  onChange={(e) => setLinkName(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="dest-type">Destination Type</Label>
                <Select
                  id="dest-type"
                  value={destinationType}
                  onChange={(e) => setDestinationType(e.target.value)}
                >
                  <option value="auto">Auto-detect from URL</option>
                  {activeApps.map((app) => (
                    <option key={app.appType} value={app.appType}>
                      {app.appName}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="dest-url" required>
                Destination URL
              </Label>
              <Input
                id="dest-url"
                type="url"
                placeholder="https://www.youtube.com/watch?v=ABC123XYZ"
                value={destinationUrl}
                onChange={(e) => setDestinationUrl(e.target.value)}
                required
              />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>Examples:</span>
                {quickExamples.map((ex) => (
                  <button
                    key={ex.label}
                    type="button"
                    onClick={() => {
                      setDestinationUrl(ex.url);
                      if (!linkName) setLinkName(`${ex.label} Campaign`);
                    }}
                    className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="custom-slug">Custom Short Code (Optional)</Label>
                <Input
                  id="custom-slug"
                  placeholder="e.g. summer-video (auto-generated if blank)"
                  value={customShortCode}
                  onChange={(e) => setCustomShortCode(e.target.value)}
                  className="font-mono"
                />
              </div>

              <div>
                <Label htmlFor="campaign-select">Campaign (Optional)</Label>
                <Select
                  id="campaign-select"
                  value={campaignId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setCampaignId(nextId);
                    const found = campaignsData?.campaigns?.find((c) => c.id === nextId);
                    if (found) {
                      if (found.utmSource && !utmSource) setUtmSource(found.utmSource);
                      if (found.utmMedium && !utmMedium) setUtmMedium(found.utmMedium);
                      if (found.utmCampaign && !utmCampaign) setUtmCampaign(found.utmCampaign);
                    }
                  }}
                >
                  <option value="">No campaign assigned</option>
                  {(campaignsData?.campaigns || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.campaignName}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </Panel>

          <Panel className="p-4 sm:p-6 space-y-4 sm:space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-950 dark:text-white">
                Redirection Behavior &amp; Tracking
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Configure mobile fallback preferences, optional expiration, custom short domain, and UTM parameters.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="fallback-pref">Mobile Fallback Preference</Label>
                <Select
                  id="fallback-pref"
                  value={fallbackPreference}
                  onChange={(e) =>
                    setFallbackPreference(
                      e.target.value as 'app_first' | 'web_only' | 'interstitial_always'
                    )
                  }
                >
                  <option value="app_first">Attempt Native App First (Recommended)</option>
                  <option value="interstitial_always">Always Show Choice Screen on Mobile</option>
                  <option value="web_only">Direct Web Redirect Only</option>
                </Select>
              </div>

              <div>
                <Label htmlFor="expires-at">Expiration Date (Optional)</Label>
                <Input
                  id="expires-at"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="custom-domain">Custom Short Domain (Optional)</Label>
              <Input
                id="custom-domain"
                placeholder="e.g. go.yourdomain.com (leave blank to use workspace domain)"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                className="font-mono"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="utm-source">UTM Source</Label>
                <Input
                  id="utm-source"
                  placeholder="instagram"
                  value={utmSource}
                  onChange={(e) => setUtmSource(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="utm-medium">UTM Medium</Label>
                <Input
                  id="utm-medium"
                  placeholder="paid_social"
                  value={utmMedium}
                  onChange={(e) => setUtmMedium(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="utm-campaign">UTM Campaign</Label>
                <Input
                  id="utm-campaign"
                  placeholder="q4_launch"
                  value={utmCampaign}
                  onChange={(e) => setUtmCampaign(e.target.value)}
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3">
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => navigate('/links')}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? 'Generating Smart Link...' : 'Create Smart Link'}
              </Button>
            </div>
          </Panel>
        </form>

        {/* Live Universal URL Processing Inspector */}
        <div className="lg:col-span-5 space-y-4">
          <Panel className="p-4 sm:p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-950 dark:text-white">
                URL Processing Inspector
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Live validation and deep-link adapter resolution
              </p>
            </div>

            {!liveInspection ? (
              <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                Paste a destination URL on the left to inspect normalized URLs, extracted content IDs, and Android / iOS deep-link routing.
              </div>
            ) : !liveInspection.valid ? (
              <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/20 p-4 flex items-start gap-3">
                <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-red-900 dark:text-red-200">
                    Validation Failed
                  </div>
                  <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                    {liveInspection.error}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 flex items-start gap-2.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-emerald-900 dark:text-emerald-200">
                      Verified HTTPS Destination &middot;{' '}
                      {DESTINATION_LABELS[liveInspection.destinationType] ||
                        liveInspection.destinationType}
                    </div>
                    <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-300/80">
                      {liveInspection.capabilities.summary}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Detected Adapter</div>
                    <div className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                      {DESTINATION_LABELS[liveInspection.destinationType] ||
                        liveInspection.destinationType}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Extracted Content ID</div>
                    <div className="mt-0.5 font-mono text-slate-900 dark:text-white truncate">
                      {liveInspection.contentId || 'Path-based'}
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-slate-500 dark:text-slate-400">Normalized Canonical URL</div>
                  <code className="block rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2.5 text-[11px] break-all text-slate-800 dark:text-slate-200">
                    {liveInspection.normalizedUrl}
                  </code>
                </div>

                {liveInspection.destinationConfig.androidIntentUrl && (
                  <div className="space-y-1">
                    <div className="text-slate-500 dark:text-slate-400">
                      Android Intent / App Link Target
                    </div>
                    <code className="block rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2.5 text-[11px] break-all text-slate-700 dark:text-slate-300">
                      {liveInspection.destinationConfig.androidIntentUrl}
                    </code>
                  </div>
                )}

                <div className="border-t border-slate-100 dark:border-slate-800 pt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-2 text-[11px]">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Android App Link</div>
                    <div className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                      {liveInspection.capabilities.supportsAndroidAppLink ? 'Supported' : 'Web fallback'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">iOS Universal Link</div>
                    <div className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                      {liveInspection.capabilities.supportsIosUniversalLink ? 'Supported' : 'Web fallback'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">In-App Browser</div>
                    <div className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                      Choice UI Ready
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>

      <RedirectPreviewModal
        link={createdLink}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />

      <Modal
        open={qrOpen && Boolean(createdLink)}
        onClose={() => setQrOpen(false)}
        title="QR Code Generator"
        description="Scanning this QR code triggers the exact same SmartLink universal redirection engine."
        maxWidth="max-w-2xl"
      >
        {createdLink && (
          <QrCodeStudio
            link={{
              id: createdLink.id,
              linkName: createdLink.linkName,
              shortCode: createdLink.shortCode,
              customDomain: createdLink.destinationConfig?.customDomain,
            }}
          />
        )}
      </Modal>
    </div>
  );
}
