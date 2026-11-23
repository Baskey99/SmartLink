import type { AppConfigurationJson, DestinationConfigJson } from '../../db/schema.ts';

export type DestinationType =
  | 'youtube'
  | 'whatsapp'
  | 'instagram'
  | 'google_maps'
  | 'play_store'
  | 'app_store'
  | 'website'
  | 'custom_app'
  | 'other';

export type DevicePlatform = 'android' | 'ios' | 'desktop' | 'other';
export type DeviceCategory = 'mobile' | 'tablet' | 'desktop';
export type BrowserEnvironment =
  | 'instagram_inapp'
  | 'facebook_inapp'
  | 'android_chrome'
  | 'ios_safari'
  | 'mobile_browser'
  | 'desktop_browser';

export type ReferralSource =
  | 'instagram'
  | 'whatsapp'
  | 'facebook'
  | 'youtube'
  | 'qr_code'
  | 'direct'
  | 'other';

export type RedirectOutcome =
  | 'redirect_attempted'
  | 'app_launch_attempted'
  | 'fallback_shown'
  | 'manual_app_click'
  | 'manual_browser_click'
  | 'direct_web_redirect';

export interface SupportedAppRecord {
  id?: string;
  appName: string;
  appType: string;
  androidPackage: string | null;
  iosBundleIdentifier: string | null;
  androidAppLinkDomain: string | null;
  iosUniversalLinkDomain: string | null;
  deepLinkFormat: string | null;
  webFallbackUrl: string | null;
  appStoreUrl: string | null;
  playStoreUrl: string | null;
  configuration: AppConfigurationJson;
  isActive: boolean;
}

export interface DeviceContext {
  platform: DevicePlatform;
  deviceCategory: DeviceCategory;
  browser: BrowserEnvironment;
  referralSource: ReferralSource;
  isInAppBrowser: boolean;
  userAgent: string;
}

export interface ProcessedUrlResult {
  valid: boolean;
  error?: string;
  destinationType: DestinationType;
  originalUrl: string;
  normalizedUrl: string;
  contentId?: string;
  contentKind?: string;
  destinationConfig: DestinationConfigJson;
  capabilities: {
    supportsAndroidAppLink: boolean;
    supportsIosUniversalLink: boolean;
    supportsAndroidIntent: boolean;
    summary: string;
  };
}

export interface RedirectPlan {
  strategy: 'direct_302' | 'interstitial_app_launch' | 'inapp_fallback_ui';
  primaryAppUrl: string | null;
  autoAttemptUrl: string | null;
  webFallbackUrl: string;
  storeUrl: string | null;
  appDisplayName: string;
  openAppButtonLabel: string;
  openBrowserButtonLabel: string;
  inAppHelperNote: string | null;
  outcome: RedirectOutcome;
}

export interface ApplicationAdapter {
  type: DestinationType;
  label: string;
  matchesUrl(url: URL): boolean;
  validateAndParse(
    url: URL,
    appConfig?: SupportedAppRecord | null,
    fallbackPreference?: 'app_first' | 'web_only' | 'interstitial_always'
  ): ProcessedUrlResult;
  buildRedirectPlan(
    normalizedUrl: string,
    destinationConfig: DestinationConfigJson,
    appConfig: SupportedAppRecord | null,
    device: DeviceContext
  ): RedirectPlan;
  validateAppConfiguration(config: Partial<SupportedAppRecord>): { valid: boolean; errors: string[] };
}
