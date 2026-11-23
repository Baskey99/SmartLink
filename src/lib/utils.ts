import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

export function formatShortDate(input: string | Date | null | undefined): string {
  if (!input) return '—';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

export function formatDateTime(input: string | Date | null | undefined): string {
  if (!input) return '—';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export function buildShortUrl(shortCode: string, customDomain?: string | null): string {
  if (customDomain && customDomain.trim()) {
    const cleaned = customDomain.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    return `https://${cleaned}/${shortCode}`;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/r/${shortCode}`;
  }
  return `/r/${shortCode}`;
}

export const DESTINATION_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  google_maps: 'Google Maps',
  play_store: 'Google Play Store',
  app_store: 'Apple App Store',
  website: 'Website',
  custom_app: 'Custom Application',
  other: 'Other HTTPS',
};

export const BROWSER_LABELS: Record<string, string> = {
  instagram_inapp: 'Instagram In-App',
  facebook_inapp: 'Facebook In-App',
  android_chrome: 'Android Chrome',
  ios_safari: 'iOS Safari',
  mobile_browser: 'Other Mobile',
  desktop_browser: 'Desktop Browser',
};

export const REFERRAL_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  youtube: 'YouTube',
  qr_code: 'QR Code',
  direct: 'Direct',
  other: 'Other',
};

export const OUTCOME_LABELS: Record<string, string> = {
  redirect_attempted: 'Redirect Attempted',
  app_launch_attempted: 'App Launch Attempted',
  fallback_shown: 'In-App Fallback Shown',
  manual_app_click: 'Manual "Open in App" Tap',
  manual_browser_click: 'Manual "Open in Browser" Tap',
  direct_web_redirect: 'Direct Web Redirect',
};

export const PLATFORM_LABELS: Record<string, string> = {
  android: 'Android',
  ios: 'iOS',
  desktop: 'Desktop',
  other: 'Other',
};
