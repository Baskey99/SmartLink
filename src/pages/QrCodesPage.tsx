import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, QrCode } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { DESTINATION_LABELS, formatNumber } from '../lib/utils';
import type { DestinationConfigJson } from '../db/schema';
import { Button, EmptyState, ErrorState, Panel, Skeleton } from '../components/ui/primitives';
import { QrCodeStudio } from '../components/qr/QrCodeStudio';

interface LinkItem {
  id: string;
  linkName: string;
  shortCode: string;
  destinationType: string;
  totalClicks: number;
  destinationConfig: DestinationConfigJson;
}

export function QrCodesPage() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['qr-links'],
    queryFn: () => apiRequest<{ items: LinkItem[] }>('/api/links?page=1&pageSize=50'),
  });

  const links = data?.items || [];
  const selectedLink = links.find((l) => l.id === selectedId) || links[0] || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
            QR Code Studio
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Generate print-ready PNG and SVG QR codes linked directly to the SmartLink universal redirection engine.
          </p>
        </div>
        <Button onClick={() => navigate('/create')}>
          <Plus className="h-4 w-4" />
          <span>Create Smart Link</span>
        </Button>
      </div>

      {isError && (
        <ErrorState
          message={(error as Error)?.message || 'Failed to load links.'}
          onRetry={() => void refetch()}
        />
      )}

      {isLoading ? (
        <Panel className="p-6">
          <Skeleton className="h-72 w-full" />
        </Panel>
      ) : links.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<QrCode className="h-5 w-5" />}
            title="No smart links available for QR generation"
            description="Create a SmartLink first to generate customized PNG and SVG QR codes."
            action={
              <Button onClick={() => navigate('/create')}>Create Smart Link</Button>
            }
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Select a Smart Link */}
          <Panel className="lg:col-span-4 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300">
              Select Smart Link ({links.length})
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[540px] overflow-y-auto">
              {links.map((link) => {
                const active = selectedLink?.id === link.id;
                return (
                  <button
                    key={link.id}
                    type="button"
                    onClick={() => setSelectedId(link.id)}
                    className={`w-full text-left px-5 py-3.5 transition-colors cursor-pointer ${
                      active
                        ? 'bg-blue-50/70 dark:bg-blue-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="text-sm font-medium text-slate-950 dark:text-white truncate">
                      {link.linkName}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <code className="text-blue-600 dark:text-blue-400">/r/{link.shortCode}</code>
                      <span>&middot;</span>
                      <span>{DESTINATION_LABELS[link.destinationType] || link.destinationType}</span>
                      <span>&middot;</span>
                      <span className="font-mono tabular-nums">{formatNumber(link.totalClicks)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>

          {/* Right: QR Customizer */}
          <Panel className="lg:col-span-8 p-6">
            {selectedLink && (
              <QrCodeStudio
                link={{
                  id: selectedLink.id,
                  linkName: selectedLink.linkName,
                  shortCode: selectedLink.shortCode,
                  customDomain: selectedLink.destinationConfig?.customDomain,
                }}
              />
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
