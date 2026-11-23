import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3,
  FolderKanban,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { apiRequest } from '../lib/api';
import {
  DESTINATION_LABELS,
  formatNumber,
  formatShortDate,
  PLATFORM_LABELS,
  REFERRAL_LABELS,
} from '../lib/utils';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  Label,
  Modal,
  Panel,
  Select,
  Skeleton,
  Textarea,
} from '../components/ui/primitives';

interface CampaignRow {
  id: string;
  campaignName: string;
  description: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  startDate: string | null;
  endDate: string | null;
  status: 'active' | 'paused' | 'completed' | 'archived';
  linkCount: number;
  totalClicks: number;
  createdAt: string;
}

interface CampaignAnalyticsResponse {
  campaign: CampaignRow;
  totals: {
    totalLinks: number;
    totalClicks: number;
    uniqueClicks: number;
  };
  clicksByDate: Array<{ date: string; clicks: number; unique: number }>;
  clicksByPlatform: Array<{ name: string; value: number }>;
  clicksByReferral: Array<{ name: string; value: number }>;
  topLinks: Array<{
    id: string;
    linkName: string;
    shortCode: string;
    destinationType: string;
    totalClicks: number;
  }>;
}

const STATUS_STYLE: Record<string, string> = {
  active: 'text-emerald-600 dark:text-emerald-400',
  paused: 'text-amber-600 dark:text-amber-400',
  completed: 'text-blue-600 dark:text-blue-400',
  archived: 'text-slate-500 dark:text-slate-400',
};

export function CampaignsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CampaignRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CampaignRow | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const [campaignName, setCampaignName] = useState('');
  const [description, setDescription] = useState('');
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<'active' | 'paused' | 'completed' | 'archived'>('active');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => apiRequest<{ campaigns: CampaignRow[] }>('/api/campaigns'),
  });

  const activeCampaignId = selectedCampaignId || data?.campaigns?.[0]?.id || null;

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['campaign-analytics', activeCampaignId],
    queryFn: () =>
      apiRequest<CampaignAnalyticsResponse>(`/api/analytics/campaigns/${activeCampaignId}?range=30d`),
    enabled: Boolean(activeCampaignId),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        campaignName,
        description: description.trim() || null,
        utmSource: utmSource.trim() || null,
        utmMedium: utmMedium.trim() || null,
        utmCampaign: utmCampaign.trim() || null,
        startDate: startDate || null,
        endDate: endDate || null,
        status,
      };
      if (editing) {
        return apiRequest(`/api/campaigns/${editing.id}`, { method: 'PUT', body: payload });
      }
      return apiRequest('/api/campaigns', { method: 'POST', body: payload });
    },
    onSuccess: () => {
      toast.success(editing ? 'Campaign updated' : 'Campaign created');
      setFormOpen(false);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/campaigns/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Campaign deleted');
      if (deleteTarget?.id === selectedCampaignId) {
        setSelectedCampaignId(null);
      }
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openCreate = () => {
    setEditing(null);
    setCampaignName('');
    setDescription('');
    setUtmSource('');
    setUtmMedium('');
    setUtmCampaign('');
    setStartDate('');
    setEndDate('');
    setStatus('active');
    setFormOpen(true);
  };

  const openEdit = (camp: CampaignRow) => {
    setEditing(camp);
    setCampaignName(camp.campaignName);
    setDescription(camp.description || '');
    setUtmSource(camp.utmSource || '');
    setUtmMedium(camp.utmMedium || '');
    setUtmCampaign(camp.utmCampaign || '');
    setStartDate(camp.startDate ? camp.startDate.slice(0, 10) : '');
    setEndDate(camp.endDate ? camp.endDate.slice(0, 10) : '');
    setStatus(camp.status);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
            Campaigns
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Group multiple smart links with shared UTM parameters and monitor campaign-level performance.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          <span>New Campaign</span>
        </Button>
      </div>

      {isError && (
        <ErrorState
          message={(error as Error)?.message || 'Failed to load campaigns.'}
          onRetry={() => void refetch()}
        />
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Panel key={i} className="p-5">
                <Skeleton className="h-5 w-40 mb-2" />
                <Skeleton className="h-4 w-full" />
              </Panel>
            ))}
          </div>
          <Panel className="lg:col-span-7 p-6">
            <Skeleton className="h-72 w-full" />
          </Panel>
        </div>
      ) : (data?.campaigns?.length ?? 0) === 0 ? (
        <Panel>
          <EmptyState
            icon={<FolderKanban className="h-5 w-5" />}
            title="No campaigns created yet"
            description="Create a campaign to organize ad links, attach default UTM source/medium tags, and compare daily performance."
            action={
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                <span>Create First Campaign</span>
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Campaign List */}
          <div className="lg:col-span-5 space-y-3">
            {data?.campaigns.map((camp) => {
              const selected = camp.id === activeCampaignId;
              return (
                <Panel
                  key={camp.id}
                  className={`p-5 transition-colors cursor-pointer ${
                    selected
                      ? 'border-blue-600 dark:border-blue-500 bg-blue-50/30 dark:bg-blue-950/20'
                      : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/30'
                  }`}
                >
                  <div
                    onClick={() => setSelectedCampaignId(camp.id)}
                    className="space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-950 dark:text-white truncate">
                          {camp.campaignName}
                        </h3>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className={`font-medium capitalize ${STATUS_STYLE[camp.status] || ''}`}>
                            {camp.status}
                          </span>
                          <span>&middot;</span>
                          <span className="tabular-nums">{camp.linkCount} links</span>
                          <span>&middot;</span>
                          <span className="font-mono tabular-nums">
                            {formatNumber(camp.totalClicks)} clicks
                          </span>
                        </div>
                      </div>
                      <div
                        className="flex items-center gap-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => navigate(`/analytics?campaignId=${camp.id}`)}
                          title="Full campaign analytics"
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                        >
                          <BarChart3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(camp)}
                          title="Edit campaign"
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(camp)}
                          title="Delete campaign"
                          className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {camp.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                        {camp.description}
                      </p>
                    )}

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-mono">
                        {camp.utmSource || camp.utmMedium || camp.utmCampaign
                          ? `utm: ${[camp.utmSource, camp.utmMedium, camp.utmCampaign].filter(Boolean).join(' / ')}`
                          : 'No default UTM tags'}
                      </span>
                      <span>
                        {camp.startDate ? formatShortDate(camp.startDate) : 'Open start'} &ndash;{' '}
                        {camp.endDate ? formatShortDate(camp.endDate) : 'Ongoing'}
                      </span>
                    </div>
                  </div>
                </Panel>
              );
            })}
          </div>

          {/* Right: Campaign Analytics Panel */}
          <Panel className="lg:col-span-7 p-6 space-y-6">
            {detailLoading || !detailData ? (
              <div className="space-y-4">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-52 w-full" />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div>
                    <h2 className="font-display text-lg font-bold text-slate-950 dark:text-white">
                      {detailData.campaign.campaignName}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Last 30 days campaign analytics &middot; {detailData.totals.totalLinks} assigned links
                    </p>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Total Clicks</div>
                      <div className="font-mono text-xl font-bold text-slate-950 dark:text-white tabular-nums">
                        {formatNumber(detailData.totals.totalClicks)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Unique Clicks</div>
                      <div className="font-mono text-xl font-bold text-slate-950 dark:text-white tabular-nums">
                        {formatNumber(detailData.totals.uniqueClicks)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Daily Click Activity */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">
                    Daily Click Activity
                  </h3>
                  {detailData.clicksByDate.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                      No clicks recorded for this campaign yet. Assign Smart Links to this campaign when creating or editing them.
                    </div>
                  ) : (
                    <div className="h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={detailData.clicksByDate} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
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
                          <Area type="monotone" dataKey="clicks" name="Clicks" stroke="#2563EB" fill="#2563EB" fillOpacity={0.14} strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Platform & Referral Breakdown */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
                      Platform Breakdown
                    </h3>
                    {detailData.clicksByPlatform.length === 0 ? (
                      <p className="text-xs text-slate-500">No platform data yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {detailData.clicksByPlatform.map((item) => (
                          <div key={item.name} className="flex items-center justify-between text-xs">
                            <span className="text-slate-600 dark:text-slate-300">
                              {PLATFORM_LABELS[item.name] || item.name}
                            </span>
                            <span className="font-mono font-medium text-slate-900 dark:text-white tabular-nums">
                              {formatNumber(item.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
                      Traffic Sources
                    </h3>
                    {detailData.clicksByReferral.length === 0 ? (
                      <p className="text-xs text-slate-500">No referral data yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {detailData.clicksByReferral.map((item) => (
                          <div key={item.name} className="flex items-center justify-between text-xs">
                            <span className="text-slate-600 dark:text-slate-300">
                              {REFERRAL_LABELS[item.name] || item.name}
                            </span>
                            <span className="font-mono font-medium text-slate-900 dark:text-white tabular-nums">
                              {formatNumber(item.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Most Popular Links in Campaign */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
                    Most Popular Links
                  </h3>
                  {detailData.topLinks.length === 0 ? (
                    <p className="text-xs text-slate-500">No links assigned to this campaign yet.</p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {detailData.topLinks.map((l) => (
                        <div key={l.id} className="py-2 flex items-center justify-between text-xs">
                          <div className="min-w-0">
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {l.linkName}
                            </span>
                            <span className="mx-2 text-slate-400">&middot;</span>
                            <code className="text-blue-600 dark:text-blue-400">/r/{l.shortCode}</code>
                            <span className="mx-2 text-slate-400">&middot;</span>
                            <span className="text-slate-500">
                              {DESTINATION_LABELS[l.destinationType] || l.destinationType}
                            </span>
                          </div>
                          <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums shrink-0">
                            {formatNumber(l.totalClicks)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </Panel>
        </div>
      )}

      {/* Create / Edit Campaign Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit Campaign' : 'New Campaign'}
        description="Configure campaign dates, status, and default UTM attribution parameters."
        maxWidth="max-w-lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="camp-name" required>
              Campaign Name
            </Label>
            <Input
              id="camp-name"
              placeholder="e.g. Q4 Instagram YouTube Push"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="camp-desc">Description</Label>
            <Textarea
              id="camp-desc"
              placeholder="Goal, target audience, and ad placement details..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="camp-utm-source">UTM Source</Label>
              <Input
                id="camp-utm-source"
                placeholder="instagram"
                value={utmSource}
                onChange={(e) => setUtmSource(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="camp-utm-medium">UTM Medium</Label>
              <Input
                id="camp-utm-medium"
                placeholder="paid_social"
                value={utmMedium}
                onChange={(e) => setUtmMedium(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="camp-utm-campaign">UTM Campaign</Label>
              <Input
                id="camp-utm-campaign"
                placeholder="launch_2026"
                value={utmCampaign}
                onChange={(e) => setUtmCampaign(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="camp-start">Start Date</Label>
              <Input
                id="camp-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="camp-end">End Date</Label>
              <Input
                id="camp-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="camp-status">Status</Label>
              <Select
                id="camp-status"
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as 'active' | 'paused' | 'completed' | 'archived')
                }
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </Select>
            </div>
          </div>
          <div className="pt-3 flex justify-end gap-2.5">
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : editing ? 'Save Changes' : 'Create Campaign'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete Campaign"
        description={`Delete "${deleteTarget?.campaignName}"? Existing smart links will remain active and simply be unlinked from this campaign.`}
        confirmLabel="Delete Campaign"
        destructive
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
