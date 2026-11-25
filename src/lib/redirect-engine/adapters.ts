import type {
  ApplicationAdapter,
  DestinationConfigJson,
  DestinationType,
  DeviceContext,
  ProcessedUrlResult,
  RedirectPlan,
  SupportedAppRecord,
} from './types.ts';
import { appendUtmParameters } from './url-security.ts';

function buildAndroidIntentUrl(
  httpsUrl: string,
  androidPackage: string,
  fallbackUrl: string,
  scheme = 'https'
): string {
  const withoutScheme = httpsUrl.replace(/^https?:\/\//i, '');
  const encodedFallback = encodeURIComponent(fallbackUrl);
  return `intent://${withoutScheme}#Intent;scheme=${scheme};package=${androidPackage};S.browser_fallback_url=${encodedFallback};end`;
}

function buildStandardRedirectPlan(params: {
  normalizedUrl: string;
  destinationConfig: DestinationConfigJson;
  appConfig: SupportedAppRecord | null;
  device: DeviceContext;
  appDisplayName: string;
  androidPrimaryUrl: string | null;
  androidAutoUrl: string | null;
  iosPrimaryUrl: string | null;
  iosAutoUrl: string | null;
}): RedirectPlan {
  const {
    normalizedUrl,
    destinationConfig,
    appConfig,
    device,
    appDisplayName,
    androidPrimaryUrl,
    androidAutoUrl,
    iosPrimaryUrl,
    iosAutoUrl,
  } = params;

  const webFallback = appendUtmParameters(
    destinationConfig.webFallbackUrl || normalizedUrl,
    {
      utmSource: destinationConfig.utmSource,
      utmMedium: destinationConfig.utmMedium,
      utmCampaign: destinationConfig.utmCampaign,
    }
  );

  // Desktop users or explicit web-only links go directly to the web destination
  if (device.platform === 'desktop' || destinationConfig.fallbackPreference === 'web_only') {
    return {
      strategy: 'direct_302',
      primaryAppUrl: null,
      autoAttemptUrl: null,
      webFallbackUrl: webFallback,
      storeUrl: null,
      appDisplayName,
      openAppButtonLabel: `Open in ${appDisplayName}`,
      openBrowserButtonLabel: 'Open in Browser',
      inAppHelperNote: null,
      outcome: 'direct_web_redirect',
    };
  }

  const storeRedirectEnabled = Boolean(appConfig?.configuration?.storeRedirectEnabled);
  const storeUrl =
    storeRedirectEnabled && device.platform === 'android'
      ? appConfig?.playStoreUrl || null
      : storeRedirectEnabled && device.platform === 'ios'
        ? appConfig?.appStoreUrl || null
        : null;

  const primaryAppUrl =
    device.platform === 'android'
      ? androidPrimaryUrl || webFallback
      : device.platform === 'ios'
        ? iosPrimaryUrl || webFallback
        : webFallback;

  const autoAttemptUrl =
    device.platform === 'android'
      ? androidAutoUrl
      : device.platform === 'ios'
        ? iosAutoUrl
        : null;

  const openAppButtonLabel =
    appDisplayName === 'Website' || appDisplayName === 'Web Destination'
      ? 'Open Destination'
      : `Open in ${appDisplayName} App`;

  if (device.isInAppBrowser) {
    const hostApp = device.browser === 'instagram_inapp' ? 'Instagram' : 'Facebook';
    return {
      strategy: 'inapp_fallback_ui',
      primaryAppUrl,
      autoAttemptUrl: destinationConfig.fallbackPreference === 'interstitial_always' ? null : autoAttemptUrl,
      webFallbackUrl: webFallback,
      storeUrl,
      appDisplayName,
      openAppButtonLabel,
      openBrowserButtonLabel: 'Open in Browser',
      inAppHelperNote: `Viewing inside ${hostApp}'s in-app browser. If ${appDisplayName} does not open automatically, choose an option above.`,
      outcome: 'fallback_shown',
    };
  }

  if (destinationConfig.fallbackPreference === 'interstitial_always') {
    return {
      strategy: 'inapp_fallback_ui',
      primaryAppUrl,
      autoAttemptUrl: null,
      webFallbackUrl: webFallback,
      storeUrl,
      appDisplayName,
      openAppButtonLabel,
      openBrowserButtonLabel: 'Open in Browser',
      inAppHelperNote: null,
      outcome: 'fallback_shown',
    };
  }

  // Standard mobile browser (Android Chrome / iOS Safari)
  return {
    strategy: primaryAppUrl && primaryAppUrl !== webFallback ? 'interstitial_app_launch' : 'direct_302',
    primaryAppUrl,
    autoAttemptUrl: autoAttemptUrl || primaryAppUrl,
    webFallbackUrl: webFallback,
    storeUrl,
    appDisplayName,
    openAppButtonLabel,
    openBrowserButtonLabel: 'Open in Browser',
    inAppHelperNote: null,
    outcome: primaryAppUrl && primaryAppUrl !== webFallback ? 'app_launch_attempted' : 'direct_web_redirect',
  };
}

function validateBasicAppConfig(config: Partial<SupportedAppRecord>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!config.appName || config.appName.trim().length < 2) {
    errors.push('Application name must be at least 2 characters.');
  }
  if (!config.appType || !/^[a-z0-9_]{2,40}$/.test(config.appType)) {
    errors.push('Application type must be lowercase letters, numbers, or underscores.');
  }
  if (config.webFallbackUrl && !config.webFallbackUrl.startsWith('https://')) {
    errors.push('Web fallback URL must start with https://.');
  }
  if (config.appStoreUrl && !config.appStoreUrl.startsWith('https://')) {
    errors.push('App Store URL must start with https://.');
  }
  if (config.playStoreUrl && !config.playStoreUrl.startsWith('https://')) {
    errors.push('Play Store URL must start with https://.');
  }
  if (config.deepLinkFormat && /^\s*(javascript|data|vbscript):/i.test(config.deepLinkFormat)) {
    errors.push('Deep link format cannot use javascript:, data:, or vbscript: schemes.');
  }
  return { valid: errors.length === 0, errors };
}

// 1. YouTube Adapter
const youtubeAdapter: ApplicationAdapter = {
  type: 'youtube',
  label: 'YouTube',
  matchesUrl(url: URL) {
    const h = url.hostname.toLowerCase();
    return (
      h === 'youtube.com' ||
      h === 'www.youtube.com' ||
      h === 'm.youtube.com' ||
      h === 'music.youtube.com' ||
      h === 'youtu.be'
    );
  },
  validateAndParse(url, appConfig, fallbackPreference = 'app_first'): ProcessedUrlResult {
    const host = url.hostname.toLowerCase();
    const pathParts = url.pathname.split('/').filter(Boolean);
    let contentId: string | undefined;
    let contentKind = 'page';
    let normalizedUrl = url.toString();

    if (host === 'youtu.be' && pathParts[0]) {
      contentId = pathParts[0];
      contentKind = 'video';
      const t = url.searchParams.get('t');
      normalizedUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(contentId)}${t ? `&t=${encodeURIComponent(t)}` : ''}`;
    } else if (url.pathname === '/watch' && url.searchParams.get('v')) {
      contentId = url.searchParams.get('v') || undefined;
      contentKind = 'video';
      const list = url.searchParams.get('list');
      const t = url.searchParams.get('t');
      const params = new URLSearchParams({ v: contentId! });
      if (list) params.set('list', list);
      if (t) params.set('t', t);
      normalizedUrl = `https://www.youtube.com/watch?${params.toString()}`;
    } else if (pathParts[0] === 'shorts' && pathParts[1]) {
      contentId = pathParts[1];
      contentKind = 'shorts';
      normalizedUrl = `https://www.youtube.com/shorts/${encodeURIComponent(contentId)}`;
    } else if (pathParts[0] === 'live' && pathParts[1]) {
      contentId = pathParts[1];
      contentKind = 'live';
      normalizedUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(contentId)}`;
    } else if (pathParts[0] === 'embed' && pathParts[1]) {
      contentId = pathParts[1];
      contentKind = 'video';
      normalizedUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(contentId)}`;
    } else if (pathParts[0] === 'playlist' && url.searchParams.get('list')) {
      contentId = url.searchParams.get('list') || undefined;
      contentKind = 'playlist';
      normalizedUrl = `https://www.youtube.com/playlist?list=${encodeURIComponent(contentId!)}`;
    } else if (pathParts[0]?.startsWith('@') || pathParts[0] === 'channel' || pathParts[0] === 'c') {
      contentId = pathParts[0]?.startsWith('@') ? pathParts[0] : pathParts[1] || pathParts[0];
      contentKind = 'channel';
      normalizedUrl = `https://www.youtube.com/${pathParts.join('/')}`;
    } else if (!this.matchesUrl(url)) {
      return {
        valid: false,
        error: 'URL does not match a valid YouTube domain (youtube.com or youtu.be).',
        destinationType: 'youtube',
        originalUrl: url.toString(),
        normalizedUrl: url.toString(),
        destinationConfig: { webFallbackUrl: url.toString(), fallbackPreference },
        capabilities: {
          supportsAndroidAppLink: false,
          supportsIosUniversalLink: false,
          supportsAndroidIntent: false,
          summary: 'Invalid YouTube URL',
        },
      };
    }

    const androidPkg = appConfig?.androidPackage || 'com.google.android.youtube';
    const androidIntentUrl = buildAndroidIntentUrl(normalizedUrl, androidPkg, normalizedUrl, 'https');
    // Verified Universal Link on iOS preserves exact content ID; vnd.youtube fallback only for manual in-app escape
    const iosSchemeUrl =
      contentKind === 'video' || contentKind === 'live'
        ? `vnd.youtube://www.youtube.com/watch?v=${encodeURIComponent(contentId || '')}`
        : contentKind === 'shorts'
          ? `vnd.youtube://www.youtube.com/shorts/${encodeURIComponent(contentId || '')}`
          : normalizedUrl;

    return {
      valid: true,
      destinationType: 'youtube',
      originalUrl: url.toString(),
      normalizedUrl,
      contentId,
      contentKind,
      destinationConfig: {
        contentId,
        contentKind,
        androidAppLink: normalizedUrl,
        androidIntentUrl,
        iosUniversalLink: normalizedUrl,
        iosSchemeUrl,
        webFallbackUrl: normalizedUrl,
        fallbackPreference,
      },
      capabilities: {
        supportsAndroidAppLink: true,
        supportsIosUniversalLink: true,
        supportsAndroidIntent: true,
        summary: contentId
          ? `Verified Android App Link + Intent & iOS Universal Link preserving ${contentKind} ID (${contentId})`
          : 'Verified Android App Link & iOS Universal Link with web fallback',
      },
    };
  },
  buildRedirectPlan(normalizedUrl, destinationConfig, appConfig, device) {
    const androidPkg = appConfig?.androidPackage || 'com.google.android.youtube';
    const androidIntent =
      destinationConfig.androidIntentUrl ||
      buildAndroidIntentUrl(normalizedUrl, androidPkg, normalizedUrl, 'https');

    // Inside iOS Instagram/Facebook in-app browsers, Universal Links to youtube.com are often kept inside WKWebView,
    // so offering the verified Universal Link + vnd.youtube manual action gives the best real-world handoff.
    const iosPrimary =
      device.isInAppBrowser && destinationConfig.iosSchemeUrl
        ? destinationConfig.iosSchemeUrl
        : destinationConfig.iosUniversalLink || normalizedUrl;

    return buildStandardRedirectPlan({
      normalizedUrl,
      destinationConfig,
      appConfig,
      device,
      appDisplayName: appConfig?.appName || 'YouTube',
      androidPrimaryUrl: androidIntent,
      androidAutoUrl: androidIntent,
      iosPrimaryUrl: iosPrimary,
      iosAutoUrl: device.isInAppBrowser ? null : destinationConfig.iosUniversalLink || normalizedUrl,
    });
  },
  validateAppConfiguration: validateBasicAppConfig,
};

// 2. WhatsApp Adapter
const whatsappAdapter: ApplicationAdapter = {
  type: 'whatsapp',
  label: 'WhatsApp',
  matchesUrl(url: URL) {
    const h = url.hostname.toLowerCase();
    return h === 'wa.me' || h === 'api.whatsapp.com' || h === 'chat.whatsapp.com' || h === 'www.whatsapp.com';
  },
  validateAndParse(url, appConfig, fallbackPreference = 'app_first'): ProcessedUrlResult {
    if (!this.matchesUrl(url)) {
      return {
        valid: false,
        error: 'URL must be a valid WhatsApp link (wa.me, api.whatsapp.com, or chat.whatsapp.com).',
        destinationType: 'whatsapp',
        originalUrl: url.toString(),
        normalizedUrl: url.toString(),
        destinationConfig: { webFallbackUrl: url.toString(), fallbackPreference },
        capabilities: {
          supportsAndroidAppLink: false,
          supportsIosUniversalLink: false,
          supportsAndroidIntent: false,
          summary: 'Invalid WhatsApp URL',
        },
      };
    }

    const host = url.hostname.toLowerCase();
    let contentId: string | undefined;
    let contentKind = 'chat';
    let normalizedUrl = url.toString();

    if (host === 'wa.me') {
      const digits = url.pathname.replace(/\D/g, '');
      contentId = digits || undefined;
      const text = url.searchParams.get('text');
      normalizedUrl = digits
        ? `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`
        : url.toString();
    } else if (host === 'api.whatsapp.com') {
      const phone = (url.searchParams.get('phone') || '').replace(/\D/g, '');
      const text = url.searchParams.get('text');
      contentId = phone || undefined;
      if (phone) {
        normalizedUrl = `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
      }
    } else if (host === 'chat.whatsapp.com') {
      contentId = url.pathname.split('/').filter(Boolean)[0];
      contentKind = 'group_invite';
      normalizedUrl = `https://chat.whatsapp.com/${encodeURIComponent(contentId || '')}`;
    }

    const androidPkg = appConfig?.androidPackage || 'com.whatsapp';
    const androidIntentUrl = buildAndroidIntentUrl(normalizedUrl, androidPkg, normalizedUrl, 'https');

    return {
      valid: true,
      destinationType: 'whatsapp',
      originalUrl: url.toString(),
      normalizedUrl,
      contentId,
      contentKind,
      destinationConfig: {
        contentId,
        contentKind,
        androidAppLink: normalizedUrl,
        androidIntentUrl,
        iosUniversalLink: normalizedUrl,
        webFallbackUrl: normalizedUrl,
        fallbackPreference,
      },
      capabilities: {
        supportsAndroidAppLink: true,
        supportsIosUniversalLink: true,
        supportsAndroidIntent: true,
        summary: 'Verified WhatsApp Universal Link & Android Intent preserving chat context',
      },
    };
  },
  buildRedirectPlan(normalizedUrl, destinationConfig, appConfig, device) {
    const androidPkg = appConfig?.androidPackage || 'com.whatsapp';
    const androidIntent =
      destinationConfig.androidIntentUrl ||
      buildAndroidIntentUrl(normalizedUrl, androidPkg, normalizedUrl, 'https');

    return buildStandardRedirectPlan({
      normalizedUrl,
      destinationConfig,
      appConfig,
      device,
      appDisplayName: appConfig?.appName || 'WhatsApp',
      androidPrimaryUrl: androidIntent,
      androidAutoUrl: androidIntent,
      iosPrimaryUrl: destinationConfig.iosUniversalLink || normalizedUrl,
      iosAutoUrl: destinationConfig.iosUniversalLink || normalizedUrl,
    });
  },
  validateAppConfiguration: validateBasicAppConfig,
};

// 3. Instagram Adapter
const instagramAdapter: ApplicationAdapter = {
  type: 'instagram',
  label: 'Instagram',
  matchesUrl(url: URL) {
    const h = url.hostname.toLowerCase();
    return h === 'instagram.com' || h === 'www.instagram.com' || h === 'instagr.am';
  },
  validateAndParse(url, appConfig, fallbackPreference = 'app_first'): ProcessedUrlResult {
    if (!this.matchesUrl(url)) {
      return {
        valid: false,
        error: 'URL must belong to instagram.com.',
        destinationType: 'instagram',
        originalUrl: url.toString(),
        normalizedUrl: url.toString(),
        destinationConfig: { webFallbackUrl: url.toString(), fallbackPreference },
        capabilities: {
          supportsAndroidAppLink: false,
          supportsIosUniversalLink: false,
          supportsAndroidIntent: false,
          summary: 'Invalid Instagram URL',
        },
      };
    }

    const parts = url.pathname.split('/').filter(Boolean);
    let contentKind = 'profile';
    let contentId = parts[0];
    if (parts[0] === 'p' || parts[0] === 'reel' || parts[0] === 'tv') {
      contentKind = parts[0] === 'p' ? 'post' : parts[0];
      contentId = parts[1];
    } else if (parts[0] === 'stories') {
      contentKind = 'story';
      contentId = parts[1];
    }

    const normalizedUrl = `https://www.instagram.com/${parts.join('/')}${parts.length ? '/' : ''}`;
    const androidPkg = appConfig?.androidPackage || 'com.instagram.android';
    const androidIntentUrl = buildAndroidIntentUrl(normalizedUrl, androidPkg, normalizedUrl, 'https');

    return {
      valid: true,
      destinationType: 'instagram',
      originalUrl: url.toString(),
      normalizedUrl,
      contentId,
      contentKind,
      destinationConfig: {
        contentId,
        contentKind,
        androidAppLink: normalizedUrl,
        androidIntentUrl,
        iosUniversalLink: normalizedUrl,
        webFallbackUrl: normalizedUrl,
        fallbackPreference,
      },
      capabilities: {
        supportsAndroidAppLink: true,
        supportsIosUniversalLink: true,
        supportsAndroidIntent: true,
        summary: `Verified Instagram Universal Link & Android App Link (${contentKind})`,
      },
    };
  },
  buildRedirectPlan(normalizedUrl, destinationConfig, appConfig, device) {
    const androidPkg = appConfig?.androidPackage || 'com.instagram.android';
    const androidIntent =
      destinationConfig.androidIntentUrl ||
      buildAndroidIntentUrl(normalizedUrl, androidPkg, normalizedUrl, 'https');

    return buildStandardRedirectPlan({
      normalizedUrl,
      destinationConfig,
      appConfig,
      device,
      appDisplayName: appConfig?.appName || 'Instagram',
      androidPrimaryUrl: androidIntent,
      androidAutoUrl: androidIntent,
      iosPrimaryUrl: destinationConfig.iosUniversalLink || normalizedUrl,
      iosAutoUrl: destinationConfig.iosUniversalLink || normalizedUrl,
    });
  },
  validateAppConfiguration: validateBasicAppConfig,
};

// 4. Google Maps Adapter
const googleMapsAdapter: ApplicationAdapter = {
  type: 'google_maps',
  label: 'Google Maps',
  matchesUrl(url: URL) {
    const h = url.hostname.toLowerCase();
    return (
      h === 'maps.google.com' ||
      h === 'maps.app.goo.gl' ||
      ((h === 'google.com' || h === 'www.google.com') && url.pathname.startsWith('/maps'))
    );
  },
  validateAndParse(url, appConfig, fallbackPreference = 'app_first'): ProcessedUrlResult {
    if (!this.matchesUrl(url)) {
      return {
        valid: false,
        error: 'URL must be a valid Google Maps link (maps.google.com, google.com/maps, or maps.app.goo.gl).',
        destinationType: 'google_maps',
        originalUrl: url.toString(),
        normalizedUrl: url.toString(),
        destinationConfig: { webFallbackUrl: url.toString(), fallbackPreference },
        capabilities: {
          supportsAndroidAppLink: false,
          supportsIosUniversalLink: false,
          supportsAndroidIntent: false,
          summary: 'Invalid Google Maps URL',
        },
      };
    }

    const normalizedUrl = url.toString();
    const queryParam = url.searchParams.get('q') || url.searchParams.get('query') || undefined;
    const placeMatch = url.pathname.match(/\/place\/([^/]+)/);
    const contentId = placeMatch ? decodeURIComponent(placeMatch[1]).replace(/\+/g, ' ') : queryParam;
    const androidPkg = appConfig?.androidPackage || 'com.google.android.apps.maps';
    const androidIntentUrl = buildAndroidIntentUrl(normalizedUrl, androidPkg, normalizedUrl, 'https');

    return {
      valid: true,
      destinationType: 'google_maps',
      originalUrl: url.toString(),
      normalizedUrl,
      contentId,
      contentKind: 'location',
      destinationConfig: {
        contentId,
        contentKind: 'location',
        androidAppLink: normalizedUrl,
        androidIntentUrl,
        iosUniversalLink: normalizedUrl,
        webFallbackUrl: normalizedUrl,
        fallbackPreference,
      },
      capabilities: {
        supportsAndroidAppLink: true,
        supportsIosUniversalLink: true,
        supportsAndroidIntent: true,
        summary: 'Verified Google Maps Universal Link & Android Intent preserving coordinates/place',
      },
    };
  },
  buildRedirectPlan(normalizedUrl, destinationConfig, appConfig, device) {
    const androidPkg = appConfig?.androidPackage || 'com.google.android.apps.maps';
    const androidIntent =
      destinationConfig.androidIntentUrl ||
      buildAndroidIntentUrl(normalizedUrl, androidPkg, normalizedUrl, 'https');

    return buildStandardRedirectPlan({
      normalizedUrl,
      destinationConfig,
      appConfig,
      device,
      appDisplayName: appConfig?.appName || 'Google Maps',
      androidPrimaryUrl: androidIntent,
      androidAutoUrl: androidIntent,
      iosPrimaryUrl: destinationConfig.iosUniversalLink || normalizedUrl,
      iosAutoUrl: destinationConfig.iosUniversalLink || normalizedUrl,
    });
  },
  validateAppConfiguration: validateBasicAppConfig,
};

// 5. Google Play Store Adapter
const playStoreAdapter: ApplicationAdapter = {
  type: 'play_store',
  label: 'Google Play Store',
  matchesUrl(url: URL) {
    return url.hostname.toLowerCase() === 'play.google.com';
  },
  validateAndParse(url, appConfig, fallbackPreference = 'app_first'): ProcessedUrlResult {
    if (!this.matchesUrl(url)) {
      return {
        valid: false,
        error: 'URL must be a valid play.google.com store URL.',
        destinationType: 'play_store',
        originalUrl: url.toString(),
        normalizedUrl: url.toString(),
        destinationConfig: { webFallbackUrl: url.toString(), fallbackPreference },
        capabilities: {
          supportsAndroidAppLink: false,
          supportsIosUniversalLink: false,
          supportsAndroidIntent: false,
          summary: 'Invalid Google Play URL',
        },
      };
    }

    const packageId = url.searchParams.get('id') || undefined;
    const normalizedUrl = packageId
      ? `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageId)}`
      : url.toString();

    const androidPkg = appConfig?.androidPackage || 'com.android.vending';
    const androidIntentUrl = packageId
      ? `intent://details?id=${encodeURIComponent(packageId)}#Intent;scheme=market;package=${androidPkg};S.browser_fallback_url=${encodeURIComponent(normalizedUrl)};end`
      : buildAndroidIntentUrl(normalizedUrl, androidPkg, normalizedUrl, 'https');

    return {
      valid: true,
      destinationType: 'play_store',
      originalUrl: url.toString(),
      normalizedUrl,
      contentId: packageId,
      contentKind: 'android_app',
      destinationConfig: {
        contentId: packageId,
        contentKind: 'android_app',
        androidAppLink: normalizedUrl,
        androidIntentUrl,
        iosUniversalLink: normalizedUrl,
        webFallbackUrl: normalizedUrl,
        fallbackPreference,
      },
      capabilities: {
        supportsAndroidAppLink: true,
        supportsIosUniversalLink: false,
        supportsAndroidIntent: true,
        summary: packageId
          ? `Android Play Store Market Intent for ${packageId} with HTTPS fallback`
          : 'Google Play Store HTTPS link with Android Intent support',
      },
    };
  },
  buildRedirectPlan(normalizedUrl, destinationConfig, appConfig, device) {
    return buildStandardRedirectPlan({
      normalizedUrl,
      destinationConfig,
      appConfig,
      device,
      appDisplayName: appConfig?.appName || 'Google Play',
      androidPrimaryUrl: destinationConfig.androidIntentUrl || normalizedUrl,
      androidAutoUrl: destinationConfig.androidIntentUrl || normalizedUrl,
      iosPrimaryUrl: normalizedUrl,
      iosAutoUrl: normalizedUrl,
    });
  },
  validateAppConfiguration: validateBasicAppConfig,
};

// 6. Apple App Store Adapter
const appStoreAdapter: ApplicationAdapter = {
  type: 'app_store',
  label: 'Apple App Store',
  matchesUrl(url: URL) {
    const h = url.hostname.toLowerCase();
    return h === 'apps.apple.com' || h === 'itunes.apple.com';
  },
  validateAndParse(url, appConfig, fallbackPreference = 'app_first'): ProcessedUrlResult {
    if (!this.matchesUrl(url)) {
      return {
        valid: false,
        error: 'URL must be a valid apps.apple.com URL.',
        destinationType: 'app_store',
        originalUrl: url.toString(),
        normalizedUrl: url.toString(),
        destinationConfig: { webFallbackUrl: url.toString(), fallbackPreference },
        capabilities: {
          supportsAndroidAppLink: false,
          supportsIosUniversalLink: false,
          supportsAndroidIntent: false,
          summary: 'Invalid Apple App Store URL',
        },
      };
    }

    const idMatch = url.pathname.match(/\/id(\d+)/);
    const contentId = idMatch ? `id${idMatch[1]}` : undefined;
    const normalizedUrl = url.toString();

    return {
      valid: true,
      destinationType: 'app_store',
      originalUrl: url.toString(),
      normalizedUrl,
      contentId,
      contentKind: 'ios_app',
      destinationConfig: {
        contentId,
        contentKind: 'ios_app',
        iosUniversalLink: normalizedUrl,
        webFallbackUrl: normalizedUrl,
        fallbackPreference,
      },
      capabilities: {
        supportsAndroidAppLink: false,
        supportsIosUniversalLink: true,
        supportsAndroidIntent: false,
        summary: contentId
          ? `iOS Universal Link to App Store listing (${contentId}) with web fallback`
          : 'iOS App Store Universal Link with web fallback',
      },
    };
  },
  buildRedirectPlan(normalizedUrl, destinationConfig, appConfig, device) {
    return buildStandardRedirectPlan({
      normalizedUrl,
      destinationConfig,
      appConfig,
      device,
      appDisplayName: appConfig?.appName || 'App Store',
      androidPrimaryUrl: normalizedUrl,
      androidAutoUrl: normalizedUrl,
      iosPrimaryUrl: destinationConfig.iosUniversalLink || normalizedUrl,
      iosAutoUrl: destinationConfig.iosUniversalLink || normalizedUrl,
    });
  },
  validateAppConfiguration: validateBasicAppConfig,
};

// 7. Website Adapter
const websiteAdapter: ApplicationAdapter = {
  type: 'website',
  label: 'Website',
  matchesUrl() {
    return false;
  },
  validateAndParse(url, _appConfig, fallbackPreference = 'app_first'): ProcessedUrlResult {
    const normalizedUrl = url.toString();
    return {
      valid: true,
      destinationType: 'website',
      originalUrl: normalizedUrl,
      normalizedUrl,
      contentKind: 'webpage',
      destinationConfig: {
        contentKind: 'webpage',
        webFallbackUrl: normalizedUrl,
        fallbackPreference,
      },
      capabilities: {
        supportsAndroidAppLink: false,
        supportsIosUniversalLink: false,
        supportsAndroidIntent: false,
        summary: 'Verified HTTPS web redirect with in-app browser breakout option',
      },
    };
  },
  buildRedirectPlan(normalizedUrl, destinationConfig, appConfig, device) {
    return buildStandardRedirectPlan({
      normalizedUrl,
      destinationConfig,
      appConfig,
      device,
      appDisplayName: appConfig?.appName || 'Website',
      androidPrimaryUrl: normalizedUrl,
      androidAutoUrl: normalizedUrl,
      iosPrimaryUrl: normalizedUrl,
      iosAutoUrl: normalizedUrl,
    });
  },
  validateAppConfiguration: validateBasicAppConfig,
};

// 8. Custom Application Adapter
const customAppAdapter: ApplicationAdapter = {
  type: 'custom_app',
  label: 'Custom Application',
  matchesUrl() {
    return false;
  },
  validateAndParse(url, appConfig, fallbackPreference = 'app_first'): ProcessedUrlResult {
    const normalizedUrl = url.toString();
    const androidPkg = appConfig?.androidPackage || undefined;
    const androidIntentUrl = androidPkg
      ? buildAndroidIntentUrl(normalizedUrl, androidPkg, normalizedUrl, 'https')
      : undefined;

    let iosSchemeUrl: string | undefined;
    if (appConfig?.deepLinkFormat) {
      iosSchemeUrl = appConfig.deepLinkFormat
        .replace('{url}', encodeURIComponent(normalizedUrl))
        .replace('{path}', url.pathname.replace(/^\//, ''))
        .replace('{host}', url.hostname);
    }

    return {
      valid: true,
      destinationType: 'custom_app',
      originalUrl: normalizedUrl,
      normalizedUrl,
      contentId: url.pathname.replace(/^\//, '') || undefined,
      contentKind: 'custom_deep_link',
      destinationConfig: {
        contentId: url.pathname.replace(/^\//, '') || undefined,
        contentKind: 'custom_deep_link',
        androidAppLink: normalizedUrl,
        androidIntentUrl,
        iosUniversalLink: normalizedUrl,
        iosSchemeUrl,
        webFallbackUrl: normalizedUrl,
        fallbackPreference,
      },
      capabilities: {
        supportsAndroidAppLink: Boolean(appConfig?.androidAppLinkDomain || appConfig?.configuration?.supportsAppLinks),
        supportsIosUniversalLink: Boolean(appConfig?.iosUniversalLinkDomain || appConfig?.configuration?.supportsUniversalLinks),
        supportsAndroidIntent: Boolean(androidPkg),
        summary: androidPkg
          ? `Custom adapter (${appConfig?.appName || 'Custom App'}) using Android package ${androidPkg} & HTTPS Universal Link`
          : 'Custom HTTPS Universal Link adapter with documented web fallback',
      },
    };
  },
  buildRedirectPlan(normalizedUrl, destinationConfig, appConfig, device) {
    const androidPrimary = destinationConfig.androidIntentUrl || destinationConfig.androidAppLink || normalizedUrl;
    const iosPrimary =
      device.isInAppBrowser && destinationConfig.iosSchemeUrl
        ? destinationConfig.iosSchemeUrl
        : destinationConfig.iosUniversalLink || normalizedUrl;

    return buildStandardRedirectPlan({
      normalizedUrl,
      destinationConfig,
      appConfig,
      device,
      appDisplayName: appConfig?.appName || 'Custom App',
      androidPrimaryUrl: androidPrimary,
      androidAutoUrl: androidPrimary,
      iosPrimaryUrl: iosPrimary,
      iosAutoUrl: device.isInAppBrowser ? null : destinationConfig.iosUniversalLink || normalizedUrl,
    });
  },
  validateAppConfiguration: validateBasicAppConfig,
};

// 9. Other Supported HTTPS Destinations Adapter
const otherAdapter: ApplicationAdapter = {
  type: 'other',
  label: 'Other HTTPS Destination',
  matchesUrl() {
    return true;
  },
  validateAndParse(url, _appConfig, fallbackPreference = 'app_first'): ProcessedUrlResult {
    const normalizedUrl = url.toString();
    return {
      valid: true,
      destinationType: 'other',
      originalUrl: normalizedUrl,
      normalizedUrl,
      contentKind: 'https_destination',
      destinationConfig: {
        contentKind: 'https_destination',
        webFallbackUrl: normalizedUrl,
        fallbackPreference,
      },
      capabilities: {
        supportsAndroidAppLink: true,
        supportsIosUniversalLink: true,
        supportsAndroidIntent: false,
        summary: 'Standard HTTPS destination relying on OS-level App Links / Universal Links with browser fallback',
      },
    };
  },
  buildRedirectPlan(normalizedUrl, destinationConfig, appConfig, device) {
    return buildStandardRedirectPlan({
      normalizedUrl,
      destinationConfig,
      appConfig,
      device,
      appDisplayName: appConfig?.appName || 'Destination',
      androidPrimaryUrl: normalizedUrl,
      androidAutoUrl: normalizedUrl,
      iosPrimaryUrl: normalizedUrl,
      iosAutoUrl: normalizedUrl,
    });
  },
  validateAppConfiguration: validateBasicAppConfig,
};

export const ADAPTER_REGISTRY: Record<DestinationType, ApplicationAdapter> = {
  youtube: youtubeAdapter,
  whatsapp: whatsappAdapter,
  instagram: instagramAdapter,
  google_maps: googleMapsAdapter,
  play_store: playStoreAdapter,
  app_store: appStoreAdapter,
  website: websiteAdapter,
  custom_app: customAppAdapter,
  other: otherAdapter,
};

export const ORDERED_DETECT_ADAPTERS: ApplicationAdapter[] = [
  youtubeAdapter,
  whatsappAdapter,
  instagramAdapter,
  googleMapsAdapter,
  playStoreAdapter,
  appStoreAdapter,
];

export function getAdapter(destinationType: string): ApplicationAdapter {
  if (destinationType in ADAPTER_REGISTRY) {
    return ADAPTER_REGISTRY[destinationType as DestinationType];
  }
  return customAppAdapter;
}
