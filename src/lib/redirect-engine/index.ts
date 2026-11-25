import { ADAPTER_REGISTRY, ORDERED_DETECT_ADAPTERS, getAdapter } from './adapters.ts';
import type {
  DestinationConfigJson,
  DestinationType,
  DeviceContext,
  ProcessedUrlResult,
  RedirectPlan,
  SupportedAppRecord,
} from './types.ts';
import { escapeHtml, validateSafeHttpsUrl } from './url-security.ts';

export * from './types.ts';
export * from './url-security.ts';
export * from './user-agent.ts';
export { ADAPTER_REGISTRY, getAdapter };

export const DEFAULT_SUPPORTED_APPS: Omit<SupportedAppRecord, 'id'>[] = [
  {
    appName: 'YouTube',
    appType: 'youtube',
    androidPackage: 'com.google.android.youtube',
    iosBundleIdentifier: 'com.google.ios.youtube',
    androidAppLinkDomain: 'www.youtube.com',
    iosUniversalLinkDomain: 'www.youtube.com',
    deepLinkFormat: 'vnd.youtube://www.youtube.com/{path}',
    webFallbackUrl: 'https://www.youtube.com',
    appStoreUrl: 'https://apps.apple.com/app/youtube-watch-listen-stream/id544007664',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.google.android.youtube',
    configuration: {
      supportsAppLinks: true,
      supportsUniversalLinks: true,
      androidIntentScheme: 'https',
      iosCustomScheme: 'vnd.youtube',
      storeRedirectEnabled: false,
      documentedCapabilities:
        'Preserves exact video, shorts, live, playlist, and channel IDs via Android Intent / App Links and iOS Universal Links.',
      allowedHosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'music.youtube.com'],
    },
    isActive: true,
  },
  {
    appName: 'WhatsApp',
    appType: 'whatsapp',
    androidPackage: 'com.whatsapp',
    iosBundleIdentifier: 'net.whatsapp.WhatsApp',
    androidAppLinkDomain: 'wa.me',
    iosUniversalLinkDomain: 'wa.me',
    deepLinkFormat: 'https://wa.me/{path}',
    webFallbackUrl: 'https://web.whatsapp.com',
    appStoreUrl: 'https://apps.apple.com/app/whatsapp-messenger/id310633997',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.whatsapp',
    configuration: {
      supportsAppLinks: true,
      supportsUniversalLinks: true,
      androidIntentScheme: 'https',
      storeRedirectEnabled: false,
      documentedCapabilities:
        'Normalizes phone chat links and group invite links into verified wa.me Universal Links with Android Intent support.',
      allowedHosts: ['wa.me', 'api.whatsapp.com', 'chat.whatsapp.com', 'www.whatsapp.com'],
    },
    isActive: true,
  },
  {
    appName: 'Instagram',
    appType: 'instagram',
    androidPackage: 'com.instagram.android',
    iosBundleIdentifier: 'com.burbn.instagram',
    androidAppLinkDomain: 'www.instagram.com',
    iosUniversalLinkDomain: 'www.instagram.com',
    deepLinkFormat: 'https://www.instagram.com/{path}',
    webFallbackUrl: 'https://www.instagram.com',
    appStoreUrl: 'https://apps.apple.com/app/instagram/id389801252',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.instagram.android',
    configuration: {
      supportsAppLinks: true,
      supportsUniversalLinks: true,
      androidIntentScheme: 'https',
      storeRedirectEnabled: false,
      documentedCapabilities:
        'Handles profiles, reels, posts, and stories via verified HTTPS Universal Links and Android App Links.',
      allowedHosts: ['instagram.com', 'www.instagram.com', 'instagr.am'],
    },
    isActive: true,
  },
  {
    appName: 'Google Maps',
    appType: 'google_maps',
    androidPackage: 'com.google.android.apps.maps',
    iosBundleIdentifier: 'com.google.Maps',
    androidAppLinkDomain: 'maps.google.com',
    iosUniversalLinkDomain: 'maps.google.com',
    deepLinkFormat: 'https://maps.google.com/{path}',
    webFallbackUrl: 'https://maps.google.com',
    appStoreUrl: 'https://apps.apple.com/app/google-maps/id585027354',
    playStoreUrl: 'https://play.google.com/store/apps/details?id=com.google.android.apps.maps',
    configuration: {
      supportsAppLinks: true,
      supportsUniversalLinks: true,
      androidIntentScheme: 'https',
      storeRedirectEnabled: false,
      documentedCapabilities:
        'Preserves coordinates, search queries, and place pins via Google Maps Universal Links and Android Intent.',
      allowedHosts: ['maps.google.com', 'maps.app.goo.gl', 'www.google.com', 'google.com'],
    },
    isActive: true,
  },
  {
    appName: 'Google Play Store',
    appType: 'play_store',
    androidPackage: 'com.android.vending',
    iosBundleIdentifier: null,
    androidAppLinkDomain: 'play.google.com',
    iosUniversalLinkDomain: null,
    deepLinkFormat: 'market://details?id={id}',
    webFallbackUrl: 'https://play.google.com/store',
    appStoreUrl: null,
    playStoreUrl: 'https://play.google.com/store',
    configuration: {
      supportsAppLinks: true,
      supportsUniversalLinks: false,
      androidIntentScheme: 'market',
      storeRedirectEnabled: false,
      documentedCapabilities:
        'Launches Google Play directly to the target app listing on Android using Market Intent with HTTPS fallback.',
      allowedHosts: ['play.google.com'],
    },
    isActive: true,
  },
  {
    appName: 'Apple App Store',
    appType: 'app_store',
    androidPackage: null,
    iosBundleIdentifier: 'com.apple.AppStore',
    androidAppLinkDomain: null,
    iosUniversalLinkDomain: 'apps.apple.com',
    deepLinkFormat: 'https://apps.apple.com/{path}',
    webFallbackUrl: 'https://apps.apple.com',
    appStoreUrl: 'https://apps.apple.com',
    playStoreUrl: null,
    configuration: {
      supportsAppLinks: false,
      supportsUniversalLinks: true,
      storeRedirectEnabled: false,
      documentedCapabilities:
        'Routes iOS users via Apple Universal Links straight to App Store product pages and falls back to web on non-iOS devices.',
      allowedHosts: ['apps.apple.com', 'itunes.apple.com'],
    },
    isActive: true,
  },
  {
    appName: 'Website',
    appType: 'website',
    androidPackage: null,
    iosBundleIdentifier: null,
    androidAppLinkDomain: null,
    iosUniversalLinkDomain: null,
    deepLinkFormat: null,
    webFallbackUrl: 'https://example.com',
    appStoreUrl: null,
    playStoreUrl: null,
    configuration: {
      supportsAppLinks: false,
      supportsUniversalLinks: false,
      storeRedirectEnabled: false,
      documentedCapabilities:
        'Direct HTTPS destination routing with clean fallback card for social in-app browsers.',
      allowedHosts: [],
    },
    isActive: true,
  },
  {
    appName: 'Custom Application',
    appType: 'custom_app',
    androidPackage: null,
    iosBundleIdentifier: null,
    androidAppLinkDomain: null,
    iosUniversalLinkDomain: null,
    deepLinkFormat: null,
    webFallbackUrl: null,
    appStoreUrl: null,
    playStoreUrl: null,
    configuration: {
      supportsAppLinks: true,
      supportsUniversalLinks: true,
      storeRedirectEnabled: false,
      documentedCapabilities:
        'Configurable adapter supporting custom Android package names, verified App Link / Universal Link domains, and HTTPS fallback.',
      allowedHosts: [],
    },
    isActive: true,
  },
  {
    appName: 'Other HTTPS Destination',
    appType: 'other',
    androidPackage: null,
    iosBundleIdentifier: null,
    androidAppLinkDomain: null,
    iosUniversalLinkDomain: null,
    deepLinkFormat: null,
    webFallbackUrl: null,
    appStoreUrl: null,
    playStoreUrl: null,
    configuration: {
      supportsAppLinks: true,
      supportsUniversalLinks: true,
      storeRedirectEnabled: false,
      documentedCapabilities:
        'Supports any verified public HTTPS destination using standard OS link resolution and web fallback.',
      allowedHosts: [],
    },
    isActive: true,
  },
];

export function detectDestinationType(rawUrl: string): DestinationType {
  const checked = validateSafeHttpsUrl(rawUrl);
  if (!checked.valid || !checked.url) {
    return 'website';
  }
  for (const adapter of ORDERED_DETECT_ADAPTERS) {
    if (adapter.matchesUrl(checked.url)) {
      return adapter.type;
    }
  }
  return 'website';
}

export function processDestinationUrl(
  rawUrl: string,
  explicitType?: string,
  appConfig?: SupportedAppRecord | null,
  fallbackPreference: 'app_first' | 'web_only' | 'interstitial_always' = 'app_first'
): ProcessedUrlResult {
  const checked = validateSafeHttpsUrl(rawUrl);
  if (!checked.valid || !checked.url) {
    return {
      valid: false,
      error: checked.error || 'Invalid URL.',
      destinationType: (explicitType as DestinationType) || 'website',
      originalUrl: rawUrl,
      normalizedUrl: rawUrl,
      destinationConfig: {
        webFallbackUrl: '',
        fallbackPreference,
      },
      capabilities: {
        supportsAndroidAppLink: false,
        supportsIosUniversalLink: false,
        supportsAndroidIntent: false,
        summary: checked.error || 'Invalid URL',
      },
    };
  }

  const resolvedType = explicitType && explicitType !== 'auto'
    ? explicitType
    : detectDestinationType(checked.url.toString());

  const adapter = getAdapter(resolvedType);
  return adapter.validateAndParse(checked.url, appConfig, fallbackPreference);
}

export function resolveRedirection(params: {
  destinationType: string;
  normalizedUrl: string;
  destinationConfig: DestinationConfigJson;
  appConfig: SupportedAppRecord | null;
  device: DeviceContext;
}): RedirectPlan {
  const adapter = getAdapter(params.destinationType);
  return adapter.buildRedirectPlan(
    params.normalizedUrl,
    params.destinationConfig,
    params.appConfig,
    params.device
  );
}

export function renderRedirectInterstitialHtml(params: {
  linkName: string;
  shortCode: string;
  smartLinkId: string;
  plan: RedirectPlan;
  device: DeviceContext;
  isPreview?: boolean;
}): string {
  const { linkName, shortCode, smartLinkId, plan, device, isPreview } = params;
  const safeLinkName = escapeHtml(linkName);
  const safeAppName = escapeHtml(plan.appDisplayName);
  const safeOpenAppLabel = escapeHtml(plan.openAppButtonLabel);
  const safeOpenBrowserLabel = escapeHtml(plan.openBrowserButtonLabel);
  const safePrimaryUrl = escapeHtml(plan.primaryAppUrl || plan.webFallbackUrl);
  const safeWebUrl = escapeHtml(plan.webFallbackUrl);
  const safeStoreUrl = plan.storeUrl ? escapeHtml(plan.storeUrl) : '';
  const safeNote = plan.inAppHelperNote ? escapeHtml(plan.inAppHelperNote) : '';
  const safeJson = (val: unknown) => JSON.stringify(val).replace(/</g, '\\u003c');
  const safeAutoUrl = !isPreview && plan.autoAttemptUrl ? safeJson(plan.autoAttemptUrl) : 'null';
  const safeLinkIdJson = safeJson(smartLinkId);
  const safePlatformJson = safeJson(device.platform);
  const safeBrowserJson = safeJson(device.browser);
  const safeReferralJson = safeJson(device.referralSource);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Continue to your destination — ${safeLinkName}</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #FAFAFB;
      color: #0F172A;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #090D16; color: #F8FAFC; }
      .card { background: #111827 !important; border-color: #1F2937 !important; }
      .muted { color: #94A3B8 !important; }
      .btn-secondary { background: #1E293B !important; color: #F8FAFC !important; border-color: #334155 !important; }
      .dest-box { background: #0B1120 !important; border-color: #1E293B !important; color: #CBD5E1 !important; }
    }
    .card {
      width: 100%;
      max-width: 440px;
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 14px;
      padding: 28px;
    }
    .brand {
      font-size: 13px;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: #2563EB;
      margin-bottom: 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .preview-tag {
      font-size: 11px;
      font-weight: 500;
      color: #64748B;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.25;
      margin-bottom: 8px;
    }
    .desc {
      font-size: 15px;
      line-height: 1.5;
      color: #475569;
      margin-bottom: 20px;
    }
    .dest-box {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      color: #334155;
      word-break: break-all;
      margin-bottom: 20px;
    }
    .dest-meta {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 12px;
      color: #64748B;
      margin-bottom: 4px;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: 46px;
      padding: 12px 16px;
      border-radius: 9px;
      font-size: 15px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      transition: opacity 150ms ease;
    }
    .btn:active { opacity: 0.85; }
    .btn-primary {
      background: #2563EB;
      color: #FFFFFF;
      border: 1px solid #2563EB;
    }
    .btn-secondary {
      background: #FFFFFF;
      color: #0F172A;
      border: 1px solid #CBD5E1;
    }
    .note {
      margin-top: 16px;
      font-size: 13px;
      line-height: 1.5;
      color: #64748B;
    }
    .store-link {
      display: inline-block;
      margin-top: 12px;
      font-size: 13px;
      color: #2563EB;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="brand">
      <span>SmartLink</span>
      <span class="preview-tag">${isPreview ? `Preview · ${escapeHtml(device.browser)}` : `/${escapeHtml(shortCode)}`}</span>
    </div>
    <h1>Continue to your destination</h1>
    <p class="desc muted">Choose how you want to open this content.</p>
    <div class="dest-box">
      <div class="dest-meta">${safeLinkName} &middot; ${safeAppName}</div>
      <div>${safeWebUrl}</div>
    </div>
    <div class="actions">
      <a id="open-app-btn" class="btn btn-primary" href="${safePrimaryUrl}" rel="noopener noreferrer">${safeOpenAppLabel}</a>
      <a id="open-browser-btn" class="btn btn-secondary" href="${safeWebUrl}" rel="noopener noreferrer">${safeOpenBrowserLabel}</a>
    </div>
    ${safeNote ? `<p class="note muted">${safeNote}</p>` : ''}
    ${safeStoreUrl ? `<a class="store-link" href="${safeStoreUrl}" rel="noopener noreferrer">Get ${safeAppName} from Store</a>` : ''}
  </main>
  <script>
    (function () {
      var autoUrl = ${safeAutoUrl};
      var linkId = ${safeLinkIdJson};
      var payloadBase = {
        smartLinkId: linkId,
        platform: ${safePlatformJson},
        browser: ${safeBrowserJson},
        referralSource: ${safeReferralJson}
      };

      function recordOutcome(outcome) {
        try {
          var body = JSON.stringify(Object.assign({}, payloadBase, { outcome: outcome }));
          if (navigator.sendBeacon) {
            navigator.sendBeacon('/api/analytics/outcome', new Blob([body], { type: 'application/json' }));
          } else {
            fetch('/api/analytics/outcome', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true });
          }
        } catch (e) {}
      }

      var appBtn = document.getElementById('open-app-btn');
      var browserBtn = document.getElementById('open-browser-btn');
      if (appBtn) {
        appBtn.addEventListener('click', function () { recordOutcome('manual_app_click'); });
      }
      if (browserBtn) {
        browserBtn.addEventListener('click', function () { recordOutcome('manual_browser_click'); });
      }

      if (autoUrl) {
        // Attempt verified App Link / Android Intent without falsely claiming app absence if blocked
        setTimeout(function () {
          window.location.href = autoUrl;
        }, 120);
      }
    })();
  </script>
</body>
</html>`;
}

export function renderStatusErrorHtml(statusCode: number, title: string, message: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${escapeHtml(title)} — SmartLink</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #FAFAFB;
      color: #0F172A;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #090D16; color: #F8FAFC; }
      .card { background: #111827 !important; border-color: #1F2937 !important; }
      .muted { color: #94A3B8 !important; }
    }
    .card {
      width: 100%;
      max-width: 420px;
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 14px;
      padding: 28px;
    }
    .code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      color: #64748B;
      margin-bottom: 12px;
    }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
    p { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 20px; }
    a {
      display: inline-flex;
      padding: 10px 16px;
      border-radius: 8px;
      background: #2563EB;
      color: #FFFFFF;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="code">HTTP ${statusCode} &middot; SmartLink</div>
    <h1>${escapeHtml(title)}</h1>
    <p class="muted">${escapeHtml(message)}</p>
    <a href="/">Go to SmartLink</a>
  </main>
</body>
</html>`;
}
