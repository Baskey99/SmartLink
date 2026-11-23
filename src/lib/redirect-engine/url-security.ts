const RESERVED_SHORT_CODES = new Set([
  'api',
  'login',
  'logout',
  'register',
  'dashboard',
  'create',
  'links',
  'campaigns',
  'analytics',
  'qr-codes',
  'qr',
  'applications',
  'apps',
  'settings',
  'users',
  'profile',
  'admin',
  'r',
  'go',
  'assets',
  'src',
  'node_modules',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  '.well-known',
]);

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
];

export function isReservedShortCode(code: string): boolean {
  const normalized = code.trim().toLowerCase();
  return RESERVED_SHORT_CODES.has(normalized) || normalized.startsWith('@') || normalized.includes('.');
}

export function validateShortCode(code: string): { valid: boolean; error?: string } {
  const trimmed = code.trim();
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(trimmed)) {
    return {
      valid: false,
      error: 'Short code must be 3–32 characters using letters, numbers, hyphens, or underscores.',
    };
  }
  if (isReservedShortCode(trimmed)) {
    return {
      valid: false,
      error: `"${trimmed}" is a reserved route and cannot be used as a short code.`,
    };
  }
  return { valid: true };
}

export function validateSafeHttpsUrl(rawInput: string): { valid: boolean; url?: URL; error?: string } {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { valid: false, error: 'Destination URL is required.' };
  }
  if (trimmed.length > 2048) {
    return { valid: false, error: 'Destination URL exceeds maximum length of 2,048 characters.' };
  }
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    return { valid: false, error: 'URL contains invalid control characters.' };
  }

  let candidate = trimmed;
  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { valid: false, error: 'Please enter a valid HTTPS destination URL.' };
  }

  // Strictly block unsafe protocols to prevent XSS and open redirect abuse
  if (parsed.protocol !== 'https:') {
    return {
      valid: false,
      error: 'Only verified HTTPS destinations are allowed (http, javascript, and data schemes are blocked).',
    };
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      error: 'URLs containing embedded credentials are not permitted.',
    };
  }

  const host = parsed.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    return {
      valid: false,
      error: 'Private, local, or loopback hostnames are not allowed as redirect targets.',
    };
  }

  const unbracketedHost = host.replace(/^\[|\]$/g, '');
  if (PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(unbracketedHost))) {
    return {
      valid: false,
      error: 'Private or link-local IP addresses are not allowed as redirect targets.',
    };
  }

  if (!host.includes('.')) {
    return {
      valid: false,
      error: 'Destination URL must include a valid public domain name.',
    };
  }

  return { valid: true, url: parsed };
}

export function appendUtmParameters(
  rawUrl: string,
  utm?: { utmSource?: string; utmMedium?: string; utmCampaign?: string }
): string {
  if (!utm || (!utm.utmSource && !utm.utmMedium && !utm.utmCampaign)) {
    return rawUrl;
  }
  try {
    const parsed = new URL(rawUrl);
    if (utm.utmSource && !parsed.searchParams.has('utm_source')) {
      parsed.searchParams.set('utm_source', utm.utmSource);
    }
    if (utm.utmMedium && !parsed.searchParams.has('utm_medium')) {
      parsed.searchParams.set('utm_medium', utm.utmMedium);
    }
    if (utm.utmCampaign && !parsed.searchParams.has('utm_campaign')) {
      parsed.searchParams.set('utm_campaign', utm.utmCampaign);
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
