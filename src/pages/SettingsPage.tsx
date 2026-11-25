import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  getAppSettings,
  saveAppSetting,
  updateCurrentUserProfileName,
} from '../lib/firestore-service';
import { useAuth } from '../context/AuthContext';
import { Button, Input, Label, Panel, Skeleton, Textarea } from '../components/ui/primitives';

interface SettingsMap {
  domain_config?: {
    customShortDomain?: string;
    enforceHttps?: boolean;
    defaultFallbackPreference?: string;
    iosTeamId?: string;
    iosAppBundleId?: string;
    androidAppPackage?: string;
    androidSha256Fingerprints?: string[];
  };
  privacy_config?: {
    storeIpAddresses?: boolean;
    privacySafeDeduplication?: boolean;
    defaultLinkExpirationDays?: number;
  };
}

export function SettingsPage() {
  const { profile, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = profile?.role === 'super_admin';

  const [fullName, setFullName] = useState(profile?.fullName || '');

  const [customShortDomain, setCustomShortDomain] = useState('');
  const [iosTeamId, setIosTeamId] = useState('');
  const [iosAppBundleId, setIosAppBundleId] = useState('');
  const [androidAppPackage, setAndroidAppPackage] = useState('');
  const [androidFingerprintsText, setAndroidFingerprintsText] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['app-settings', profile?.id],
    queryFn: async () => ({ settings: await getAppSettings() }),
    enabled: Boolean(profile),
  });

  useEffect(() => {
    if (profile?.fullName) setFullName(profile.fullName);
  }, [profile?.fullName]);

  useEffect(() => {
    const dc = data?.settings?.domain_config;
    if (dc) {
      setCustomShortDomain(dc.customShortDomain || '');
      setIosTeamId(dc.iosTeamId || '');
      setIosAppBundleId(dc.iosAppBundleId || '');
      setAndroidAppPackage(dc.androidAppPackage || '');
      setAndroidFingerprintsText((dc.androidSha256Fingerprints || []).join('\n'));
    }
  }, [data]);

  const profileMutation = useMutation({
    mutationFn: () => updateCurrentUserProfileName(profile!.firebaseUid, fullName),
    onSuccess: async () => {
      await refreshProfile();
      toast.success('Profile updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const domainMutation = useMutation({
    mutationFn: () =>
      saveAppSetting('domain_config', {
        customShortDomain: customShortDomain.trim(),
        enforceHttps: true,
        defaultFallbackPreference: 'app_first',
        iosTeamId: iosTeamId.trim(),
        iosAppBundleId: iosAppBundleId.trim(),
        androidAppPackage: androidAppPackage.trim(),
        androidSha256Fingerprints: androidFingerprintsText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      toast.success('Domain & mobile verification settings saved');
      void queryClient.invalidateQueries({ queryKey: ['app-settings'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-5 sm:space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
          Settings
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Manage your profile, verified custom domains, iOS Universal Links (AASA), and Android Digital Asset Links.
        </p>
      </div>

      {/* Account Profile */}
      <Panel className="p-4 sm:p-6">
        <h2 className="text-base font-semibold text-slate-950 dark:text-white">Account Profile</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Your display name and assigned workspace role.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            profileMutation.mutate();
          }}
          className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          <div>
            <Label htmlFor="profile-name">Full Name</Label>
            <Input
              id="profile-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="profile-email">Email Address</Label>
            <Input id="profile-email" value={profile?.email || ''} disabled />
          </div>
          <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Assigned Role:{' '}
              <span className="font-semibold text-slate-900 dark:text-white capitalize">
                {profile?.role?.replace('_', ' ')}
              </span>
            </div>
            <Button
              type="submit"
              size="sm"
              className="w-full sm:w-auto"
              disabled={profileMutation.isPending}
            >
              {profileMutation.isPending ? 'Saving...' : 'Save Profile'}
            </Button>
          </div>
        </form>
      </Panel>

      {/* Domain Association & Universal Links Configuration */}
      <Panel className="p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              Domain Association &amp; Mobile Verification
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              SmartLink automatically serves verified AASA and Digital Asset Links JSON files from this host.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/.well-known/apple-app-site-association"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <span>Inspect AASA</span>
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href="/.well-known/assetlinks.json"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <span>Inspect assetlinks.json</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-44 w-full" />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              domainMutation.mutate();
            }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="short-domain">Default Custom Short Domain</Label>
              <Input
                id="short-domain"
                placeholder="go.yourdomain.com"
                value={customShortDomain}
                onChange={(e) => setCustomShortDomain(e.target.value)}
                disabled={!isSuperAdmin}
                className="font-mono text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="ios-team">Apple Team ID (AASA)</Label>
                <Input
                  id="ios-team"
                  placeholder="TEAMID1234"
                  value={iosTeamId}
                  onChange={(e) => setIosTeamId(e.target.value)}
                  disabled={!isSuperAdmin}
                  className="font-mono text-xs"
                />
              </div>
              <div>
                <Label htmlFor="ios-bundle-cfg">iOS App Bundle Identifier</Label>
                <Input
                  id="ios-bundle-cfg"
                  placeholder="com.smartlink.app"
                  value={iosAppBundleId}
                  onChange={(e) => setIosAppBundleId(e.target.value)}
                  disabled={!isSuperAdmin}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="android-pkg-cfg">Android Companion Package Name (assetlinks.json)</Label>
              <Input
                id="android-pkg-cfg"
                placeholder="com.smartlink.app"
                value={androidAppPackage}
                onChange={(e) => setAndroidAppPackage(e.target.value)}
                disabled={!isSuperAdmin}
                className="font-mono text-xs"
              />
            </div>

            <div>
              <Label htmlFor="android-sha">Android SHA-256 Certificate Fingerprints (one per line)</Label>
              <Textarea
                id="android-sha"
                placeholder="14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5"
                value={androidFingerprintsText}
                onChange={(e) => setAndroidFingerprintsText(e.target.value)}
                disabled={!isSuperAdmin}
                className="font-mono text-xs"
              />
            </div>

            {isSuperAdmin ? (
              <div className="pt-2 flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  className="w-full sm:w-auto"
                  disabled={domainMutation.isPending}
                >
                  {domainMutation.isPending ? 'Saving...' : 'Save Domain Configuration'}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Only Super Admins can modify workspace domain and mobile association settings.
              </p>
            )}
          </form>
        )}
      </Panel>

      {/* Privacy & Security Posture */}
      <Panel className="p-4 sm:p-6 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-white">
          <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span>Security &amp; Privacy Guarantees</span>
        </div>
        <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed list-disc pl-5">
          <li>
            All destination URLs are strictly validated for HTTPS and checked against loopback, link-local, and private network ranges to prevent open-redirect and SSRF abuse.
          </li>
          <li>
            Visitor IP addresses are never stored in Cloud Firestore; unique click estimates use an ephemeral hourly bucket hash without cross-day tracking or device fingerprinting.
          </li>
          <li>
            All workspace data is protected by strict Cloud Firestore Security Rules enforcing verified Firebase Authentication, owner isolation, and server-timestamp validation.
          </li>
        </ul>
      </Panel>
    </div>
  );
}
