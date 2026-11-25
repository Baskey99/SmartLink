import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
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
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getAnalyticsSummary,
  listCampaigns,
  listSmartLinks,
} from '../lib/firestore-service';
import {
  BROWSER_LABELS,
  DESTINATION_LABELS,
  formatNumber,
  OUTCOME_LABELS,
  PLATFORM_LABELS,
  REFERRAL_LABELS,
} from '../lib/utils';
import {
  EmptyState,
  ErrorState,
  Input,
  Panel,
  SegmentedTabs,
  Select,
  Skeleton,
} from '../components/ui/primitives';

interface AnalyticsResponse {
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
  clicksByOutcome: Array<{ name: string; value: number }>;
}

interface LinkOption {
  id: string;
  linkName: string;
  shortCode: string;
}

interface CampaignOption {
  id: string;
  campaignName: string;
}

type RangePreset = 'today' | '7d' | '30d' | 'custom';

export function AnalyticsPage() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const linkIdParam = searchParams.get('linkId') || '';
  const campaignIdParam = searchParams.get('campaignId') || '';

  const [range, setRange] = useState<RangePreset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const { data: linksList } = useQuery({
    queryKey: ['links-options', profile?.id],
    queryFn: () => listSmartLinks(profile!, { page: 1, pageSize: 50 }),
    enabled: Boolean(profile),
  });

  const { data: campaignsList } = useQuery({
    queryKey: ['campaigns', profile?.id],
    queryFn: async () => ({ campaigns: await listCampaigns(profile!) }),
    enabled: Boolean(profile),
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['detailed-analytics', profile?.id, range, customFrom, customTo, linkIdParam, campaignIdParam],
    queryFn: () =>
      getAnalyticsSummary(profile!, {
        range,
        from: range === 'custom' ? customFrom || undefined : undefined,
        to: range === 'custom' ? customTo || undefined : undefined,
        smartLinkId: linkIdParam || undefined,
        campaignId: campaignIdParam || undefined,
      }),
    enabled: Boolean(profile),
  });

  const setScope = (type: 'all' | 'link' | 'campaign', id = '') => {
    const next = new URLSearchParams();
    if (type === 'link' && id) next.set('linkId', id);
    if (type === 'campaign' && id) next.set('campaignId', id);
    setSearchParams(next);
  };

  const renderMetricList = (
    title: string,
    subtitle: string,
    items: Array<{ name: string; value: number }>,
    labelMap: Record<string, string>,
    totalDenominator: number
  ) => (
    <Panel className="p-4 sm:p-6">
      <h2 className="text-base font-semibold text-slate-950 dark:text-white">{title}</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
      {isLoading ? (
        <div className="mt-5 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
          No recorded events for this breakdown in the selected date window.
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {items.map((row) => {
            const pct =
              totalDenominator > 0 ? Math.round((row.value / totalDenominator) * 100) : 0;
            return (
              <div key={row.name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {labelMap[row.name] || row.name}
                  </span>
                  <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    {formatNumber(row.value)} ({pct}%)
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{ width: `${Math.max(3, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );

  const totalPrimary = data?.totals.totalClicks || 0;
  const totalOutcomes = (data?.clicksByOutcome || []).reduce((acc, cur) => acc + cur.value, 0);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5 sm:gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
            Analytics
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Privacy-first click telemetry across platforms, in-app browsers, referral channels, and redirect outcomes.
          </p>
        </div>

        <SegmentedTabs
          value={range}
          onChange={setRange}
          options={[
            { value: 'today', label: 'Today' },
            { value: '7d', label: 'Last 7 Days' },
            { value: '30d', label: 'Last 30 Days' },
            { value: 'custom', label: 'Custom Range' },
          ]}
        />
      </div>

      {/* Scope & Date Filter Bar */}
      <Panel className="p-3.5 sm:p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-center">
          <div>
            <Select
              aria-label="Filter by specific smart link"
              value={linkIdParam}
              onChange={(e) => setScope(e.target.value ? 'link' : 'all', e.target.value)}
            >
              <option value="">All Smart Links</option>
              {(linksList?.items || []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.linkName} (/r/{l.shortCode})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Select
              aria-label="Filter by campaign"
              value={campaignIdParam}
              onChange={(e) => setScope(e.target.value ? 'campaign' : 'all', e.target.value)}
            >
              <option value="">All Campaigns</option>
              {(campaignsList?.campaigns || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.campaignName}
                </option>
              ))}
            </Select>
          </div>
          {range === 'custom' && (
            <>
              <Input
                type="date"
                aria-label="Start date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <Input
                type="date"
                aria-label="End date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </>
          )}
        </div>
      </Panel>

      {isError && (
        <ErrorState
          message={(error as Error)?.message || 'Failed to load analytics.'}
          onRetry={() => void refetch()}
        />
      )}

      {/* Privacy Notice */}
      <div className="flex items-start gap-2.5 text-xs text-slate-500 dark:text-slate-400 px-1">
        <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <p>
          Privacy-first measurement active: SmartLink does not store visitor IP addresses or fingerprint devices. Redirect attempts are reported separately from observed manual button clicks because mobile browsers do not confirm whether a third-party app opened.
        </p>
      </div>

      {/* Clicks by Date Chart */}
      <Panel className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4 sm:mb-5">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              Clicks by Date
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Total redirect attempts ({formatNumber(data?.totals.totalClicks ?? 0)}) vs. deduplicated unique visits ({formatNumber(data?.totals.uniqueClicks ?? 0)})
            </p>
          </div>
        </div>
        {isLoading ? (
          <Skeleton className="h-56 sm:h-64 w-full" />
        ) : (data?.clicksByDate?.length ?? 0) === 0 ? (
          <EmptyState
            title="No analytics data in this period"
            description="Open a SmartLink or run a live test click from the All Links preview modal to inspect real-time metrics."
          />
        ) : (
          <div className="h-56 sm:h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.clicksByDate} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="analyticsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
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
                <Area type="monotone" dataKey="clicks" name="Total Clicks" stroke="#2563EB" strokeWidth={2} fill="url(#analyticsGrad)" />
                <Area type="monotone" dataKey="unique" name="Unique Clicks" stroke="#64748B" strokeWidth={1.5} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      {/* Platform & Destination Bar Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        <Panel className="p-4 sm:p-6">
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">
            Clicks by Platform
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Operating system distribution across Android, iOS, and Desktop
          </p>
          {isLoading ? (
            <Skeleton className="h-48 sm:h-52 w-full mt-4" />
          ) : (data?.clicksByPlatform?.length ?? 0) === 0 ? (
            <p className="mt-6 text-xs text-slate-500">No platform data yet.</p>
          ) : (
            <div className="h-48 sm:h-52 w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data?.clicksByPlatform.map((d) => ({
                    name: PLATFORM_LABELS[d.name] || d.name,
                    value: d.value,
                  }))}
                  margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
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
          )}
        </Panel>

        <Panel className="p-4 sm:p-6">
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">
            Clicks by Destination Application
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Traffic routed per configured application adapter
          </p>
          {isLoading ? (
            <Skeleton className="h-48 sm:h-52 w-full mt-4" />
          ) : (data?.clicksByDestination?.length ?? 0) === 0 ? (
            <p className="mt-6 text-xs text-slate-500">No destination traffic recorded yet.</p>
          ) : (
            <div className="h-48 sm:h-52 w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data?.clicksByDestination.map((d) => ({
                    name: DESTINATION_LABELS[d.name] || d.name,
                    value: d.value,
                  }))}
                  margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
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
                  <Bar dataKey="value" name="Clicks" fill="#0F172A" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>

      {/* Browser, Referral Source, and Observable Redirect Outcome Breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
        {renderMetricList(
          'Clicks by Browser',
          'In-app social webviews vs. system mobile & desktop browsers',
          data?.clicksByBrowser || [],
          BROWSER_LABELS,
          totalPrimary
        )}
        {renderMetricList(
          'Clicks by Referral Source',
          'Originating social channel, QR scan, or direct navigation',
          data?.clicksByReferral || [],
          REFERRAL_LABELS,
          totalPrimary
        )}
        {renderMetricList(
          'Redirect Outcomes',
          'Separates automatic attempts from manual choice-screen actions',
          data?.clicksByOutcome || [],
          OUTCOME_LABELS,
          totalOutcomes
        )}
      </div>
    </div>
  );
}
