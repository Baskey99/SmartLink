import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpDown,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  Link2,
  Pencil,
  Plus,
  Power,
  QrCode,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '../lib/api';
import { buildShortUrl, DESTINATION_LABELS, formatNumber, formatShortDate } from '../lib/utils';
import type { DestinationConfigJson } from '../db/schema';
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
} from '../components/ui/primitives';
import { RedirectPreviewModal, type PreviewLinkItem } from '../components/links/RedirectPreviewModal';
import { QrCodeStudio } from '../components/qr/QrCodeStudio';

interface LinkRow extends PreviewLinkItem {
  status: 'active' | 'inactive' | 'deleted';
  totalClicks: number;
  campaignId: string | null;
  campaignName: string | null;
  appName: string;
  ownerEmail: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface LinksListResponse {
  items: LinkRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface CampaignOption {
  id: string;
  campaignName: string;
}

export function AllLinksPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [destinationType, setDestinationType] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'totalClicks' | 'linkName'>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const [previewLink, setPreviewLink] = useState<LinkRow | null>(null);
  const [qrLink, setQrLink] = useState<LinkRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LinkRow | null>(null);
  const [editTarget, setEditTarget] = useState<LinkRow | null>(null);

  // Edit form fields
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editCampaignId, setEditCampaignId] = useState('');
  const [editFallback, setEditFallback] = useState<'app_first' | 'web_only' | 'interstitial_always'>('app_first');

  const queryParams = new URLSearchParams({
    page: String(page),
    pageSize: '12',
    sortBy,
    sortDir,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(destinationType !== 'all' ? { destinationType } : {}),
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    ...(dateFrom ? { dateFrom } : {}),
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['smart-links', queryParams.toString()],
    queryFn: () => apiRequest<LinksListResponse>(`/api/links?${queryParams.toString()}`),
  });

  const { data: campaignsData } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => apiRequest<{ campaigns: CampaignOption[] }>('/api/campaigns'),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ link: LinkRow }>(`/api/links/${id}/deactivate`, { method: 'POST' }),
    onSuccess: (res) => {
      toast.success(
        res.link.status === 'active' ? 'Smart link activated' : 'Smart link deactivated'
      );
      void queryClient.invalidateQueries({ queryKey: ['smart-links'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/links/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Smart link deleted');
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['smart-links'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-analytics'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/links/${editTarget!.id}`, {
        method: 'PUT',
        body: {
          linkName: editName,
          destinationUrl: editUrl,
          customShortCode: editSlug,
          campaignId: editCampaignId || null,
          fallbackPreference: editFallback,
        },
      }),
    onSuccess: () => {
      toast.success('Smart link updated');
      setEditTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['smart-links'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openEdit = (row: LinkRow) => {
    setEditTarget(row);
    setEditName(row.linkName);
    setEditUrl(row.originalUrl);
    setEditSlug(row.shortCode);
    setEditCampaignId(row.campaignId || '');
    setEditFallback(row.destinationConfig?.fallbackPreference || 'app_first');
  };

  const handleCopy = async (row: LinkRow) => {
    await navigator.clipboard.writeText(
      buildShortUrl(row.shortCode, row.destinationConfig?.customDomain)
    );
    toast.success('Short URL copied');
  };

  const toggleSort = (col: 'createdAt' | 'totalClicks' | 'linkName') => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / (data?.pageSize || 12)));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
            All Smart Links
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Search, filter, preview, and manage all shortened universal app links.
          </p>
        </div>
        <Button onClick={() => navigate('/create')}>
          <Plus className="h-4 w-4" />
          <span>Create Smart Link</span>
        </Button>
      </div>

      {/* Filter Bar */}
      <Panel className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-4 relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              placeholder="Search name, short code, or URL..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
          <div className="lg:col-span-3">
            <Select
              aria-label="Filter by destination"
              value={destinationType}
              onChange={(e) => {
                setDestinationType(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Destinations</option>
              {Object.entries(DESTINATION_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="lg:col-span-2">
            <Select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
          <div className="lg:col-span-3">
            <Input
              type="date"
              aria-label="Created after date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </Panel>

      {isError && (
        <ErrorState
          message={(error as Error)?.message || 'Failed to load smart links.'}
          onRetry={() => void refetch()}
        />
      )}

      {/* Links Data Table */}
      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => toggleSort('linkName')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    <span>Link Name</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-3 px-4">Short URL</th>
                <th className="py-3 px-4">Destination</th>
                <th className="py-3 px-4">Campaign</th>
                <th className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => toggleSort('totalClicks')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    <span>Clicks</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => toggleSort('createdAt')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                  >
                    <span>Created</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="py-3.5 px-4">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              ) : (data?.items?.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={<Link2 className="h-5 w-5" />}
                      title="No matching smart links"
                      description="Try adjusting your search or filter criteria, or create a new smart link."
                      action={
                        <Button size="sm" onClick={() => navigate('/create')}>
                          Create Smart Link
                        </Button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                data?.items.map((row) => {
                  const isExpired =
                    row.expiresAt && new Date(row.expiresAt).getTime() < Date.now();
                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/35 transition-colors"
                    >
                      <td className="py-3.5 px-4 max-w-[220px]">
                        <div className="font-medium text-slate-950 dark:text-white truncate">
                          {row.linkName}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {row.originalUrl}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <code className="text-xs font-medium text-blue-600 dark:text-blue-400">
                          /r/{row.shortCode}
                        </code>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-700 dark:text-slate-300">
                        {DESTINATION_LABELS[row.destinationType] || row.appName}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                        {row.campaignName || '—'}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-right font-mono text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                        {formatNumber(row.totalClicks)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs font-medium">
                        {isExpired ? (
                          <span className="text-red-600 dark:text-red-400">Expired</span>
                        ) : row.status === 'active' ? (
                          <span className="text-emerald-600 dark:text-emerald-400">Active</span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400">Inactive</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {formatShortDate(row.createdAt)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => void handleCopy(row)}
                            title="Copy short URL"
                            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewLink(row)}
                            title="Preview redirect simulator"
                            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate(`/analytics?linkId=${row.id}`)}
                            title="View analytics"
                            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                          >
                            <BarChart3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setQrLink(row)}
                            title="Generate QR code"
                            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                          >
                            <QrCode className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            title="Edit link"
                            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleMutation.mutate(row.id)}
                            title={row.status === 'active' ? 'Deactivate link' : 'Activate link'}
                            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-amber-600 cursor-pointer"
                          >
                            <Power className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(row)}
                            title="Delete link"
                            className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {(data?.total || 0) > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            <span className="tabular-nums">
              Showing {data?.items.length} of {formatNumber(data?.total || 0)} links
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Previous</span>
              </Button>
              <span className="font-mono tabular-nums px-2">
                {page} / {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Panel>

      {/* Preview Simulator Modal */}
      <RedirectPreviewModal
        link={previewLink}
        open={Boolean(previewLink)}
        onClose={() => setPreviewLink(null)}
        onClickRecorded={() => void refetch()}
      />

      {/* QR Code Modal */}
      <Modal
        open={Boolean(qrLink)}
        onClose={() => setQrLink(null)}
        title="SmartLink QR Code"
        description="Customize foreground/background colors, upload an optional logo, and download PNG or SVG."
        maxWidth="max-w-2xl"
      >
        {qrLink && (
          <QrCodeStudio
            link={{
              id: qrLink.id,
              linkName: qrLink.linkName,
              shortCode: qrLink.shortCode,
              customDomain: qrLink.destinationConfig?.customDomain,
            }}
          />
        )}
      </Modal>

      {/* Edit Link Modal */}
      <Modal
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title="Edit Smart Link"
        description="Update link metadata, destination URL, short code, or campaign assignment."
        maxWidth="max-w-lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateMutation.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <Label htmlFor="edit-name" required>
              Link Name
            </Label>
            <Input
              id="edit-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="edit-url" required>
              Destination URL
            </Label>
            <Input
              id="edit-url"
              type="url"
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="edit-slug" required>
                Short Code
              </Label>
              <Input
                id="edit-slug"
                value={editSlug}
                onChange={(e) => setEditSlug(e.target.value)}
                className="font-mono text-xs"
                required
              />
            </div>
            <div>
              <Label htmlFor="edit-campaign">Campaign</Label>
              <Select
                id="edit-campaign"
                value={editCampaignId}
                onChange={(e) => setEditCampaignId(e.target.value)}
              >
                <option value="">None</option>
                {(campaignsData?.campaigns || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.campaignName}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="edit-fallback">Mobile Fallback Preference</Label>
            <Select
              id="edit-fallback"
              value={editFallback}
              onChange={(e) =>
                setEditFallback(
                  e.target.value as 'app_first' | 'web_only' | 'interstitial_always'
                )
              }
            >
              <option value="app_first">Attempt Native App First</option>
              <option value="interstitial_always">Always Show Choice Screen on Mobile</option>
              <option value="web_only">Direct Web Redirect Only</option>
            </Select>
          </div>
          <div className="pt-3 flex items-center justify-end gap-2.5">
            <Button type="button" variant="secondary" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete Smart Link"
        description={`Are you sure you want to delete "${deleteTarget?.linkName}" (/r/${deleteTarget?.shortCode})? Visitors opening this short URL will immediately see an unavailable link notice.`}
        confirmLabel="Delete Link"
        destructive
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
