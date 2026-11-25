import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowUpRight, Copy, Eye, Link2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { getAnalyticsSummary, getSmartLinkById } from '../lib/firestore-service';
import {
  buildShortUrl,
  DESTINATION_LABELS,
  formatNumber,
  formatShortDate,
  PLATFORM_LABELS,
  REFERRAL_LABELS,
} from '../lib/utils';
import {
  Button,
  EmptyState,
  ErrorState,
  Panel,
  SegmentedTabs,
  Skeleton,
} from '../components/ui/primitives';
import { RedirectPreviewModal, type PreviewLinkItem } from '../components/links/RedirectPreviewModal';

interface DashboardLinkSummary {
  id: string;
  linkName: string;
  shortCode: string;
  destinationType: string;
  originalUrl: string;
  totalClicks: number;
  status: string;
  createdAt: string;
}

interface DashboardResponse {
  totals: {
    totalLinks: number;
    totalClicks: number;
    uniqueClicks: number;
    androidClicks: number;
    iosClicks: number;
    desktopClicks: number;
    instagramTraffic: number;
    whatsappTraffic: number;
    facebookTraffic: number;
    manualAppClicks: number;
    manualBrowserClicks: number;
  };
  clicksByDate: Array<{ date: string; clicks: number; unique: number }>;
  clicksByPlatform: Array<{ name: string; value: number }>;
  clicksByBrowser: Array<{ name: string; value: number }>;
  clicksByReferral: Array<{ name: string; value: number }>;
  clicksByDestination: Array<{ name: string; value: number }>;
  topLinks: DashboardLinkSummary[];
  recentLinks: DashboardLinkSummary[];
}

type RangeKey = 'today' | '7d' | '30d' | 'all';

export function DashboardPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [range, setRange] = useState<RangeKey>('30d');
  const [previewLink, setPreviewLink] = useState<PreviewLinkItem | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard-analytics', profile?.id, range],
    queryFn: () => getAnalyticsSummary(profile!, { range }),
    enabled: Boolean(profile),
  });

  const handleCopyShort = async (shortCode: string) => {
    const url = buildShortUrl(shortCode);
    await navigator.clipboard.writeText(url);
    toast.success('Short URL copied');
  };

  const openPreview = async (item: DashboardLinkSummary) => {
    try {
      const full = await getSmartLinkById(item.id);
      if (!full) throw new Error('Not found');
      setPreviewLink(full);
    } catch {
      toast.error('Unable to load link preview');
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 sm:gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
            Overview
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Track smart link volume, mobile platform routing, and social referral traffic.
          </p>
        </div>
        <SegmentedTabs
          value={range}
          onChange={setRange}
          options={[
            { value: 'today', label: 'Today' },
            { value: '7d', label: '7 Days' },
            { value: '30d', label: '30 Days' },
            { value: 'all', label: 'All Time' },
          ]}
        />
      </div>

      {isError && (
        <ErrorState
          message={(error as Error)?.message || 'Failed to load dashboard statistics.'}
          onRetry={() => void refetch()}
        />
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Panel key={i} className="p-4 sm:p-5 space-y-2.5">
                <Skeleton className="h-3.5 w-20 sm:w-24" />
                <Skeleton className="h-7 sm:h-8 w-16 sm:w-20" />
                <Skeleton className="h-3 w-24 sm:w-32" />
              </Panel>
            ))
          : [
              {
                label: 'Total Links Created',
                value: formatNumber(data?.totals.totalLinks ?? 0),
                sub: 'Active & paused short URLs',
              },
              {
                label: 'Total Clicks',
                value: formatNumber(data?.totals.totalClicks ?? 0),
                sub: 'Recorded redirect attempts',
              },
              {
                label: 'Unique Clicks',
                value: formatNumber(data?.totals.uniqueClicks ?? 0),
                sub: 'Privacy-safe deduplicated visits',
              },
              {
                label: 'Manual App Opens',
                value: formatNumber(data?.totals.manualAppClicks ?? 0),
                sub: `${formatNumber(data?.totals.manualBrowserClicks ?? 0)} manual browser fallbacks`,
              },
            ].map((kpi) => (
              <Panel key={kpi.label} className="p-4 sm:p-5">
                <div className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">
                  {kpi.label}
                </div>
                <div className="mt-1.5 sm:mt-2 font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white tabular-nums">
                  {kpi.value}
                </div>
                <div className="mt-1 sm:mt-1.5 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-snug">
                  {kpi.sub}
                </div>
              </Panel>
            ))}
      </div>

      {/* Platform & Social Traffic Strip */}
      <Panel className="p-4 sm:p-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-4 lg:gap-0 lg:divide-x lg:divide-slate-100 dark:lg:divide-slate-800/80">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="lg:px-5 lg:first:pl-0 lg:last:pr-0 space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-6 w-12" />
                </div>
              ))
            : [
                { label: 'Android Clicks', value: data?.totals.androidClicks ?? 0 },
                { label: 'iOS Clicks', value: data?.totals.iosClicks ?? 0 },
                { label: 'Desktop Clicks', value: data?.totals.desktopClicks ?? 0 },
                { label: 'Instagram Traffic', value: data?.totals.instagramTraffic ?? 0 },
                { label: 'WhatsApp Traffic', value: data?.totals.whatsappTraffic ?? 0 },
                { label: 'Facebook Traffic', value: data?.totals.facebookTraffic ?? 0 },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="lg:px-5 lg:first:pl-0 lg:last:pr-0"
                >
                  <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                    {stat.label}
                  </div>
                  <div className="mt-1 font-mono text-lg sm:text-xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                    {formatNumber(stat.value)}
                  </div>
                </div>
              ))}
        </div>
      </Panel>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        <Panel className="lg:col-span-8 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 sm:mb-5">
            <div>
              <h2 className="text-base font-semibold text-slate-950 dark:text-white">
                Click Activity
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Daily redirect attempts vs. privacy-safe unique visits
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-blue-600" />
                Total
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-xs bg-slate-400 dark:bg-slate-500" />
                Unique
              </span>
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="h-56 sm:h-64 w-full" />
          ) : (data?.clicksByDate?.length ?? 0) === 0 ? (
            <EmptyState
              title="No click activity in this range"
              description="Share a SmartLink or run a live test click in the Redirect Simulator to see daily trends appear here."
              action={
                <Button size="sm" onClick={() => navigate('/create')}>
                  <Plus className="h-4 w-4" />
                  <span>Create Smart Link</span>
                </Button>
              }
            />
          ) : (
            <div className="h-56 sm:h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.clicksByDate} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="clicksGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      border: '1px solid #1E293B',
                      borderRadius: '8px',
                      color: '#F8FAFC',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="clicks"
                    name="Total Clicks"
                    stroke="#2563EB"
                    strokeWidth={2}
                    fill="url(#clicksGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="unique"
                    name="Unique Clicks"
                    stroke="#64748B"
                    strokeWidth={1.5}
                    fill="transparent"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel className="lg:col-span-4 p-4 sm:p-6 flex flex-col">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              Platform &amp; Referral Split
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Distribution by OS and referring channel
            </p>
          </div>

          {isLoading ? (
            <div className="mt-5 space-y-3">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (data?.clicksByPlatform?.length ?? 0) === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400 py-10 sm:py-12">
              Platform metrics populate once links receive traffic.
            </div>
          ) : (
            <div className="mt-4 space-y-5 sm:space-y-6 flex-1">
              <div className="h-36 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data?.clicksByPlatform.map((item) => ({
                      name: PLATFORM_LABELS[item.name] || item.name,
                      value: item.value,
                    }))}
                    margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0F172A',
                        border: '1px solid #1E293B',
                        borderRadius: '8px',
                        color: '#F8FAFC',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="value" name="Clicks" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-2.5">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Top Traffic Sources
                </div>
                {(data?.clicksByReferral || []).slice(0, 4).map((src) => {
                  const pct =
                    data && data.totals.totalClicks > 0
                      ? Math.round((src.value / data.totals.totalClicks) * 100)
                      : 0;
                  return (
                    <div key={src.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-700 dark:text-slate-300">
                          {REFERRAL_LABELS[src.name] || src.name}
                        </span>
                        <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                          {formatNumber(src.value)} ({pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full"
                          style={{ width: `${Math.max(4, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* Bottom Tables: Top-Performing & Recently Created Links */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              Top-Performing Links
            </h2>
            <Link
              to="/links"
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              <span>View all</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {isLoading ? (
            <div className="p-4 sm:p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (data?.topLinks?.length ?? 0) === 0 ? (
            <EmptyState
              icon={<Link2 className="h-5 w-5" />}
              title="No smart links yet"
              description="Create your first universal smart link to start routing mobile traffic."
              action={
                <Button size="sm" onClick={() => navigate('/create')}>
                  Create Smart Link
                </Button>
              }
            />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {data?.topLinks.map((link) => (
                <div
                  key={link.id}
                  className="px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {link.linkName}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                      <code className="text-blue-600 dark:text-blue-400">/r/{link.shortCode}</code>
                      <span>&middot;</span>
                      <span>{DESTINATION_LABELS[link.destinationType] || link.destinationType}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
                    <div className="text-right pr-1">
                      <div className="font-mono text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                        {formatNumber(link.totalClicks)}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">clicks</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void openPreview(link)}
                      title="Preview redirect"
                      aria-label="Preview redirect"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopyShort(link.shortCode)}
                      title="Copy short URL"
                      aria-label="Copy short URL"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              Recently Created Links
            </h2>
            <Link
              to="/create"
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              <span>Create new</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {isLoading ? (
            <div className="p-4 sm:p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (data?.recentLinks?.length ?? 0) === 0 ? (
            <EmptyState
              icon={<Plus className="h-5 w-5" />}
              title="Ready to launch"
              description="Paste any YouTube, WhatsApp, Instagram, Maps, or store URL to create your first smart link."
              action={
                <Button size="sm" onClick={() => navigate('/create')}>
                  Create Smart Link
                </Button>
              }
            />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {data?.recentLinks.map((link) => (
                <div
                  key={link.id}
                  className="px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {link.linkName}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className={link.status === 'active' ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-amber-600 dark:text-amber-400 font-medium'}>
                        {link.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                      <span>&middot;</span>
                      <span>{DESTINATION_LABELS[link.destinationType] || link.destinationType}</span>
                      <span>&middot;</span>
                      <span>{formatShortDate(link.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/analytics?linkId=${link.id}`)}
                    >
                      Analytics
                    </Button>
                    <button
                      type="button"
                      onClick={() => void handleCopyShort(link.shortCode)}
                      title="Copy short URL"
                      aria-label="Copy short URL"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <RedirectPreviewModal
        link={previewLink}
        open={Boolean(previewLink)}
        onClose={() => setPreviewLink(null)}
        onClickRecorded={() => void refetch()}
      />
    </div>
  );
}
