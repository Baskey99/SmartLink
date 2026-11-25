import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  listSupportedApps,
  saveSupportedApp,
  type SupportedAppRow,
} from '../lib/firestore-service';
import { useAuth } from '../context/AuthContext';
import {
  Button,
  ErrorState,
  Input,
  Label,
  Modal,
  Panel,
  Skeleton,
  Textarea,
} from '../components/ui/primitives';

type AppRow = SupportedAppRow;

export function ApplicationsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = profile?.role === 'super_admin';

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AppRow | null>(null);

  const [appName, setAppName] = useState('');
  const [appType, setAppType] = useState('');
  const [androidPackage, setAndroidPackage] = useState('');
  const [iosBundleIdentifier, setIosBundleIdentifier] = useState('');
  const [androidAppLinkDomain, setAndroidAppLinkDomain] = useState('');
  const [iosUniversalLinkDomain, setIosUniversalLinkDomain] = useState('');
  const [deepLinkFormat, setDeepLinkFormat] = useState('');
  const [webFallbackUrl, setWebFallbackUrl] = useState('');
  const [appStoreUrl, setAppStoreUrl] = useState('');
  const [playStoreUrl, setPlayStoreUrl] = useState('');
  const [documentedCapabilities, setDocumentedCapabilities] = useState('');
  const [supportsAppLinks, setSupportsAppLinks] = useState(true);
  const [supportsUniversalLinks, setSupportsUniversalLinks] = useState(true);
  const [storeRedirectEnabled, setStoreRedirectEnabled] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['supported-apps'],
    queryFn: async () => ({ apps: await listSupportedApps() }),
    enabled: Boolean(profile),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      saveSupportedApp({
        appName,
        appType,
        androidPackage: androidPackage.trim() || null,
        iosBundleIdentifier: iosBundleIdentifier.trim() || null,
        androidAppLinkDomain: androidAppLinkDomain.trim() || null,
        iosUniversalLinkDomain: iosUniversalLinkDomain.trim() || null,
        deepLinkFormat: deepLinkFormat.trim() || null,
        webFallbackUrl: webFallbackUrl.trim() || null,
        appStoreUrl: appStoreUrl.trim() || null,
        playStoreUrl: playStoreUrl.trim() || null,
        isActive,
        configuration: {
          supportsAppLinks,
          supportsUniversalLinks,
          storeRedirectEnabled,
          documentedCapabilities: documentedCapabilities.trim(),
          allowedHosts: editing?.configuration?.allowedHosts || [],
        },
      }),
    onSuccess: () => {
      toast.success(editing ? 'Application adapter updated' : 'Custom application added');
      setModalOpen(false);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['supported-apps'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openCreate = () => {
    setEditing(null);
    setAppName('');
    setAppType('');
    setAndroidPackage('');
    setIosBundleIdentifier('');
    setAndroidAppLinkDomain('');
    setIosUniversalLinkDomain('');
    setDeepLinkFormat('');
    setWebFallbackUrl('');
    setAppStoreUrl('');
    setPlayStoreUrl('');
    setDocumentedCapabilities('');
    setSupportsAppLinks(true);
    setSupportsUniversalLinks(true);
    setStoreRedirectEnabled(false);
    setIsActive(true);
    setModalOpen(true);
  };

  const openEdit = (app: AppRow) => {
    setEditing(app);
    setAppName(app.appName);
    setAppType(app.appType);
    setAndroidPackage(app.androidPackage || '');
    setIosBundleIdentifier(app.iosBundleIdentifier || '');
    setAndroidAppLinkDomain(app.androidAppLinkDomain || '');
    setIosUniversalLinkDomain(app.iosUniversalLinkDomain || '');
    setDeepLinkFormat(app.deepLinkFormat || '');
    setWebFallbackUrl(app.webFallbackUrl || '');
    setAppStoreUrl(app.appStoreUrl || '');
    setPlayStoreUrl(app.playStoreUrl || '');
    setDocumentedCapabilities(app.configuration?.documentedCapabilities || '');
    setSupportsAppLinks(Boolean(app.configuration?.supportsAppLinks));
    setSupportsUniversalLinks(Boolean(app.configuration?.supportsUniversalLinks));
    setStoreRedirectEnabled(Boolean(app.configuration?.storeRedirectEnabled));
    setIsActive(app.isActive);
    setModalOpen(true);
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 sm:gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
            Supported Applications
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Extensible adapter configurations defining Android App Links, iOS Universal Links, deep-link formats, and verified web fallbacks.
          </p>
        </div>
        {isSuperAdmin && (
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            <span>Add Application</span>
          </Button>
        )}
      </div>

      {isError && (
        <ErrorState
          message={(error as Error)?.message || 'Failed to load application configurations.'}
          onRetry={() => void refetch()}
        />
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Panel key={i} className="p-5 space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-4 w-48" />
            </Panel>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(data?.apps || []).map((app) => (
            <Panel key={app.id} className="p-4 sm:p-5 flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-slate-950 dark:text-white truncate">
                      {app.appName}
                    </h2>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <code className="text-[11px]">{app.appType}</code>
                      <span>&middot;</span>
                      <span
                        className={
                          app.isActive
                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                            : 'text-amber-600 dark:text-amber-400 font-medium'
                        }
                      >
                        {app.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => openEdit(app)}
                      title="Edit application configuration"
                      aria-label={`Edit ${app.appName}`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white cursor-pointer shrink-0"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {app.configuration?.documentedCapabilities && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {app.configuration.documentedCapabilities}
                  </p>
                )}

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400">Android Package</span>
                    <code className="text-[11px] text-slate-800 dark:text-slate-200 truncate max-w-[180px]">
                      {app.androidPackage || '—'}
                    </code>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400">iOS Bundle ID</span>
                    <code className="text-[11px] text-slate-800 dark:text-slate-200 truncate max-w-[180px]">
                      {app.iosBundleIdentifier || '—'}
                    </code>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400">Verified Domain</span>
                    <code className="text-[11px] text-slate-800 dark:text-slate-200 truncate max-w-[180px]">
                      {app.androidAppLinkDomain || app.iosUniversalLinkDomain || 'Any HTTPS'}
                    </code>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400">Store Redirect</span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {app.configuration?.storeRedirectEnabled ? 'Enabled' : 'Web Fallback Only'}
                    </span>
                  </div>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {/* Add / Edit App Modal (Super Admin) */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Configure ${editing.appName}` : 'Add Supported Application'}
        description="Define deep-link routing identifiers, verified domains, and fallback behavior without modifying core redirect logic."
        maxWidth="max-w-2xl"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="app-name" required>
                Application Name
              </Label>
              <Input
                id="app-name"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="e.g. Spotify"
                required
              />
            </div>
            <div>
              <Label htmlFor="app-type" required>
                Application Type Key
              </Label>
              <Input
                id="app-type"
                value={appType}
                onChange={(e) => setAppType(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="e.g. spotify"
                disabled={Boolean(editing)}
                className="font-mono text-xs"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="android-pkg">Android Package Name</Label>
              <Input
                id="android-pkg"
                value={androidPackage}
                onChange={(e) => setAndroidPackage(e.target.value)}
                placeholder="com.spotify.music"
                className="font-mono text-xs"
              />
            </div>
            <div>
              <Label htmlFor="ios-bundle">iOS Bundle Identifier</Label>
              <Input
                id="ios-bundle"
                value={iosBundleIdentifier}
                onChange={(e) => setIosBundleIdentifier(e.target.value)}
                placeholder="com.spotify.client"
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="android-domain">Android App Link Domain</Label>
              <Input
                id="android-domain"
                value={androidAppLinkDomain}
                onChange={(e) => setAndroidAppLinkDomain(e.target.value)}
                placeholder="open.spotify.com"
                className="font-mono text-xs"
              />
            </div>
            <div>
              <Label htmlFor="ios-domain">iOS Universal Link Domain</Label>
              <Input
                id="ios-domain"
                value={iosUniversalLinkDomain}
                onChange={(e) => setIosUniversalLinkDomain(e.target.value)}
                placeholder="open.spotify.com"
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="deep-link-fmt">Supported Deep Link Format</Label>
              <Input
                id="deep-link-fmt"
                value={deepLinkFormat}
                onChange={(e) => setDeepLinkFormat(e.target.value)}
                placeholder="spotify://{path}"
                className="font-mono text-xs"
              />
            </div>
            <div>
              <Label htmlFor="web-fallback">Default Web Fallback URL</Label>
              <Input
                id="web-fallback"
                value={webFallbackUrl}
                onChange={(e) => setWebFallbackUrl(e.target.value)}
                placeholder="https://open.spotify.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="play-store">Google Play Store URL</Label>
              <Input
                id="play-store"
                value={playStoreUrl}
                onChange={(e) => setPlayStoreUrl(e.target.value)}
                placeholder="https://play.google.com/store/apps/details?id=..."
              />
            </div>
            <div>
              <Label htmlFor="app-store">Apple App Store URL</Label>
              <Input
                id="app-store"
                value={appStoreUrl}
                onChange={(e) => setAppStoreUrl(e.target.value)}
                placeholder="https://apps.apple.com/app/..."
              />
            </div>
          </div>

          <div>
            <Label htmlFor="doc-caps">Documented Capabilities &amp; Notes</Label>
            <Textarea
              id="doc-caps"
              value={documentedCapabilities}
              onChange={(e) => setDocumentedCapabilities(e.target.value)}
              placeholder="Document exact Android App Link / iOS Universal Link behavior and limitations..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs text-slate-700 dark:text-slate-300">
            <label className="flex items-center gap-2.5 min-h-[36px] cursor-pointer">
              <input
                type="checkbox"
                checked={supportsAppLinks}
                onChange={(e) => setSupportsAppLinks(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              <span>Supports Android App Links</span>
            </label>
            <label className="flex items-center gap-2.5 min-h-[36px] cursor-pointer">
              <input
                type="checkbox"
                checked={supportsUniversalLinks}
                onChange={(e) => setSupportsUniversalLinks(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              <span>Supports iOS Universal Links</span>
            </label>
            <label className="flex items-center gap-2.5 min-h-[36px] cursor-pointer">
              <input
                type="checkbox"
                checked={storeRedirectEnabled}
                onChange={(e) => setStoreRedirectEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              <span>Show Store Install Link on Fallback</span>
            </label>
            <label className="flex items-center gap-2.5 min-h-[36px] cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              <span>Adapter Active</span>
            </label>
          </div>

          <div className="pt-3 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
