import type {
  BrowserEnvironment,
  DeviceCategory,
  DeviceContext,
  DevicePlatform,
  ReferralSource,
} from './types.ts';

export function detectDeviceContext(
  userAgentRaw: string,
  refererRaw = '',
  querySource = ''
): DeviceContext {
  const ua = userAgentRaw || '';
  const uaLower = ua.toLowerCase();
  const refLower = (refererRaw || '').toLowerCase();
  const srcLower = (querySource || '').toLowerCase();

  let platform: DevicePlatform = 'desktop';
  if (/android/i.test(ua)) {
    platform = 'android';
  } else if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && /mobile/i.test(ua))) {
    platform = 'ios';
  } else if (/windows|macintosh|linux|cros/i.test(ua)) {
    platform = 'desktop';
  } else {
    platform = 'other';
  }

  let deviceCategory: DeviceCategory = 'desktop';
  if (/ipad|tablet|playbook|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) {
    deviceCategory = 'tablet';
  } else if (platform === 'android' || platform === 'ios' || /mobile|phone/i.test(ua)) {
    deviceCategory = 'mobile';
  }

  let browser: BrowserEnvironment = 'desktop_browser';
  let isInAppBrowser = false;

  if (/instagram/i.test(ua)) {
    browser = 'instagram_inapp';
    isInAppBrowser = true;
  } else if (/fban|fbav|fb_iab|fbios|messenger/i.test(ua)) {
    browser = 'facebook_inapp';
    isInAppBrowser = true;
  } else if (platform === 'android') {
    if (/chrome|crios/i.test(ua) && !/edg|opr|samsungbrowser/i.test(ua)) {
      browser = 'android_chrome';
    } else {
      browser = 'mobile_browser';
    }
  } else if (platform === 'ios') {
    if (/safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua)) {
      browser = 'ios_safari';
    } else {
      browser = 'mobile_browser';
    }
  } else if (deviceCategory !== 'desktop') {
    browser = 'mobile_browser';
  }

  // Detect referral source from explicit UTM/query tag, UA in-app browser, or HTTP Referer
  let referralSource: ReferralSource = 'direct';
  if (srcLower === 'qr' || srcLower === 'qr_code') {
    referralSource = 'qr_code';
  } else if (srcLower.includes('instagram') || srcLower === 'ig' || browser === 'instagram_inapp' || refLower.includes('instagram.com') || refLower.includes('l.instagram.com')) {
    referralSource = 'instagram';
  } else if (srcLower.includes('whatsapp') || srcLower === 'wa' || refLower.includes('whatsapp.com') || uaLower.includes('whatsapp')) {
    referralSource = 'whatsapp';
  } else if (srcLower.includes('facebook') || srcLower === 'fb' || browser === 'facebook_inapp' || refLower.includes('facebook.com') || refLower.includes('fb.com') || refLower.includes('lm.facebook.com')) {
    referralSource = 'facebook';
  } else if (srcLower.includes('youtube') || srcLower === 'yt' || refLower.includes('youtube.com') || refLower.includes('youtu.be')) {
    referralSource = 'youtube';
  } else if (refLower.length > 0) {
    referralSource = 'other';
  }

  return {
    platform,
    deviceCategory,
    browser,
    referralSource,
    isInAppBrowser,
    userAgent: ua,
  };
}

export const SIMULATED_USER_AGENTS: Record<string, { label: string; ua: string; referer: string }> = {
  instagram_ios: {
    label: 'Instagram In-App (iOS)',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Instagram 354.0.0.29.90',
    referer: 'https://l.instagram.com/',
  },
  instagram_android: {
    label: 'Instagram In-App (Android)',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 Instagram 354.0.0.46.96',
    referer: 'https://l.instagram.com/',
  },
  facebook_ios: {
    label: 'Facebook In-App (iOS)',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 [FBAN/FBIOS;FBAV/486.0.0]',
    referer: 'https://lm.facebook.com/',
  },
  android_chrome: {
    label: 'Android Chrome',
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.106 Mobile Safari/537.36',
    referer: 'https://wa.me/',
  },
  ios_safari: {
    label: 'iOS Safari',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    referer: '',
  },
  desktop_chrome: {
    label: 'Desktop Browser',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    referer: '',
  },
};
