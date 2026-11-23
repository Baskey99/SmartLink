import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express, { type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  createCampaign,
  createSmartLink,
  createSupportedApp,
  deleteCampaign,
  findSmartLinkByShortCode,
  generateUniqueShortCode,
  getAllSettings,
  getAnalyticsSummary,
  getCampaignById,
  getSmartLinkById,
  getSupportedAppByType,
  listAllProfiles,
  listCampaigns,
  listSmartLinks,
  listSupportedApps,
  recordClickEvent,
  softDeleteSmartLink,
  updateCampaign,
  updateProfileName,
  updateSmartLink,
  updateSupportedApp,
  updateUserRoleOrStatus,
  upsertSetting,
} from './src/db/repository.ts';
import {
  detectDeviceContext,
  getAdapter,
  isReservedShortCode,
  processDestinationUrl,
  renderRedirectInterstitialHtml,
  renderStatusErrorHtml,
  resolveRedirection,
  SIMULATED_USER_AGENTS,
  validateSafeHttpsUrl,
  validateShortCode,
} from './src/lib/redirect-engine/index.ts';
import { requireAuth, requireRole, type AuthRequest } from './src/middleware/auth.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

// Daily rotating ephemeral salt for privacy-friendly click deduplication (never stores IPs or persistent identifiers)
let currentSaltDay = new Date().toISOString().slice(0, 10);
let dailySalt = crypto.randomBytes(16).toString('hex');

function computePrivacySafeDedupHash(smartLinkId: string, platform: string, browser: string, acceptLang: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== currentSaltDay) {
    currentSaltDay = today;
    dailySalt = crypto.randomBytes(16).toString('hex');
  }
  const hourBucket = new Date().toISOString().slice(0, 13);
  return crypto
    .createHash('sha256')
    .update(`${dailySalt}:${smartLinkId}:${hourBucket}:${platform}:${browser}:${acceptLang.slice(0, 16)}`)
    .digest('hex')
    .slice(0, 20);
}

const createLinkSchema = z.object({
  linkName: z.string().trim().min(1, 'Link name is required').max(120),
  destinationType: z.string().trim().min(1).max(40).default('auto'),
  destinationUrl: z.string().trim().min(1, 'Destination URL is required').max(2048),
  customShortCode: z.string().trim().max(32).optional().or(z.literal('')),
  campaignId: z.string().uuid().nullable().optional().or(z.literal('')),
  fallbackPreference: z.enum(['app_first', 'web_only', 'interstitial_always']).default('app_first'),
  expiresAt: z.string().datetime().nullable().optional().or(z.literal('')),
  utmSource: z.string().trim().max(80).optional().or(z.literal('')),
  utmMedium: z.string().trim().max(80).optional().or(z.literal('')),
  utmCampaign: z.string().trim().max(80).optional().or(z.literal('')),
  customDomain: z.string().trim().max(120).optional().or(z.literal('')),
});

const updateLinkSchema = createLinkSchema.partial().extend({
  status: z.enum(['active', 'inactive']).optional(),
});

const campaignSchema = z.object({
  campaignName: z.string().trim().min(1, 'Campaign name is required').max(120),
  description: z.string().trim().max(500).nullable().optional(),
  utmSource: z.string().trim().max(80).nullable().optional(),
  utmMedium: z.string().trim().max(80).nullable().optional(),
  utmCampaign: z.string().trim().max(80).nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  status: z.enum(['active', 'paused', 'completed', 'archived']).default('active'),
});

const appConfigSchema = z.object({
  appName: z.string().trim().min(2).max(80),
  appType: z.string().trim().regex(/^[a-z0-9_]{2,40}$/),
  androidPackage: z.string().trim().max(160).nullable().optional(),
  iosBundleIdentifier: z.string().trim().max(160).nullable().optional(),
  androidAppLinkDomain: z.string().trim().max(160).nullable().optional(),
  iosUniversalLinkDomain: z.string().trim().max(160).nullable().optional(),
  deepLinkFormat: z.string().trim().max(240).nullable().optional(),
  webFallbackUrl: z.string().trim().max(300).nullable().optional(),
  appStoreUrl: z.string().trim().max(300).nullable().optional(),
  playStoreUrl: z.string().trim().max(300).nullable().optional(),
  isActive: z.boolean().default(true),
  configuration: z.object({
    supportsAppLinks: z.boolean().default(true),
    supportsUniversalLinks: z.boolean().default(true),
    androidIntentScheme: z.string().trim().max(40).optional(),
    iosCustomScheme: z.string().trim().max(40).optional(),
    storeRedirectEnabled: z.boolean().default(false),
    documentedCapabilities: z.string().trim().max(400).default(''),
    allowedHosts: z.array(z.string().trim()).default([]),
  }),
});

function parseDateRange(query: Request['query']): { fromDate?: Date; toDate?: Date } {
  const preset = typeof query.range === 'string' ? query.range : '30d';
  const now = new Date();
  if (preset === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { fromDate: start, toDate: now };
  }
  if (preset === '7d') {
    return { fromDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), toDate: now };
  }
  if (preset === '30d') {
    return { fromDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), toDate: now };
  }
  if (preset === 'custom') {
    const fromRaw = typeof query.from === 'string' ? query.from : undefined;
    const toRaw = typeof query.to === 'string' ? query.to : undefined;
    const fromDate = fromRaw && !Number.isNaN(Date.parse(fromRaw)) ? new Date(fromRaw) : undefined;
    const toDate = toRaw && !Number.isNaN(Date.parse(toRaw)) ? new Date(toRaw) : undefined;
    return { fromDate, toDate };
  }
  return {};
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '256kb' }));

  // Rate limiting for write operations and short URL redirects
  const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a moment and try again.' },
  });

  const redirectLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 240,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many redirect requests. Please try again shortly.',
  });

  // =========================================================================
  // Domain Verification Files (iOS Universal Links & Android App Links)
  // =========================================================================
  app.get('/.well-known/apple-app-site-association', async (_req: Request, res: Response) => {
    try {
      const settings = await getAllSettings();
      const domainCfg = (settings.domain_config || {}) as Record<string, string>;
      const teamId = domainCfg.iosTeamId || 'TEAMID1234';
      const bundleId = domainCfg.iosAppBundleId || 'com.smartlink.app';

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.json({
        applinks: {
          apps: [],
          details: [
            {
              appIDs: [`${teamId}.${bundleId}`],
              components: [
                {
                  '/': '/r/*',
                  comment: 'Matches SmartLink universal short link paths',
                },
                {
                  '/': '/*',
                  exclude: false,
                  comment: 'Matches root short-code routes excluding web app paths',
                },
              ],
            },
          ],
        },
      });
    } catch {
      res.status(500).json({ error: 'Unable to generate AASA file.' });
    }
  });

  app.get('/.well-known/assetlinks.json', async (_req: Request, res: Response) => {
    try {
      const settings = await getAllSettings();
      const domainCfg = (settings.domain_config || {}) as Record<string, unknown>;
      const pkg = typeof domainCfg.androidAppPackage === 'string' && domainCfg.androidAppPackage
        ? domainCfg.androidAppPackage
        : 'com.smartlink.app';
      const fingerprints = Array.isArray(domainCfg.androidSha256Fingerprints)
        ? (domainCfg.androidSha256Fingerprints as string[]).filter(Boolean)
        : [];

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.json([
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: pkg,
            sha256_cert_fingerprints: fingerprints,
          },
        },
      ]);
    } catch {
      res.status(500).json({ error: 'Unable to generate assetlinks.json.' });
    }
  });

  // =========================================================================
  // Auth & Profile API
  // =========================================================================
  app.get('/api/auth/profile', requireAuth, (req: AuthRequest, res: Response) => {
    res.json({ profile: req.profile });
  });

  app.post('/api/auth/sync', requireAuth, (req: AuthRequest, res: Response) => {
    res.json({ profile: req.profile });
  });

  app.put('/api/auth/profile', requireAuth, writeLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({ fullName: z.string().trim().min(2).max(100) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid name.' });
        return;
      }
      const updated = await updateProfileName(req.profile!.id, parsed.data.fullName);
      res.json({ profile: updated });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // =========================================================================
  // Super Admin: User Management
  // =========================================================================
  app.get('/api/users', requireAuth, requireRole(['super_admin']), async (_req: AuthRequest, res: Response) => {
    try {
      const users = await listAllProfiles();
      res.json({ users });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.put('/api/users/:id', requireAuth, requireRole(['super_admin']), writeLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        role: z.enum(['super_admin', 'admin', 'user']).optional(),
        status: z.enum(['active', 'inactive']).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid user update payload.' });
        return;
      }
      if (req.params.id === req.profile!.id && parsed.data.status === 'inactive') {
        res.status(400).json({ error: 'You cannot deactivate your own Super Admin account.' });
        return;
      }
      const updated = await updateUserRoleOrStatus(req.params.id, parsed.data);
      if (!updated) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      res.json({ user: updated });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // =========================================================================
  // Applications (Supported Destination Adapters)
  // =========================================================================
  app.get('/api/apps', requireAuth, async (_req: AuthRequest, res: Response) => {
    try {
      const apps = await listSupportedApps();
      res.json({ apps });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/apps', requireAuth, requireRole(['super_admin']), writeLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = appConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid application config.' });
        return;
      }
      const adapter = getAdapter(parsed.data.appType);
      const validation = adapter.validateAppConfiguration(parsed.data);
      if (!validation.valid) {
        res.status(400).json({ error: validation.errors[0] });
        return;
      }
      const created = await createSupportedApp({
        ...parsed.data,
        androidPackage: parsed.data.androidPackage || null,
        iosBundleIdentifier: parsed.data.iosBundleIdentifier || null,
        androidAppLinkDomain: parsed.data.androidAppLinkDomain || null,
        iosUniversalLinkDomain: parsed.data.iosUniversalLinkDomain || null,
        deepLinkFormat: parsed.data.deepLinkFormat || null,
        webFallbackUrl: parsed.data.webFallbackUrl || null,
        appStoreUrl: parsed.data.appStoreUrl || null,
        playStoreUrl: parsed.data.playStoreUrl || null,
      });
      res.status(201).json({ app: created });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.put('/api/apps/:id', requireAuth, requireRole(['super_admin']), writeLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = appConfigSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid application config.' });
        return;
      }
      const updated = await updateSupportedApp(req.params.id, parsed.data);
      if (!updated) {
        res.status(404).json({ error: 'Application configuration not found.' });
        return;
      }
      res.json({ app: updated });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // =========================================================================
  // Smart Links API
  // =========================================================================
  app.post('/api/links/preview-url', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        destinationUrl: z.string().trim().min(1),
        destinationType: z.string().trim().optional().default('auto'),
        fallbackPreference: z.enum(['app_first', 'web_only', 'interstitial_always']).optional().default('app_first'),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Please provide a destination URL to inspect.' });
        return;
      }
      const appConfig =
        parsed.data.destinationType !== 'auto'
          ? await getSupportedAppByType(parsed.data.destinationType)
          : null;
      const result = processDestinationUrl(
        parsed.data.destinationUrl,
        parsed.data.destinationType,
        appConfig,
        parsed.data.fallbackPreference
      );
      res.json({ inspection: result });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/links', requireAuth, writeLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = createLinkSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid link payload.' });
        return;
      }

      const data = parsed.data;
      const requestedType = data.destinationType === 'auto' ? undefined : data.destinationType;
      const preConfig = requestedType ? await getSupportedAppByType(requestedType) : null;
      const processed = processDestinationUrl(
        data.destinationUrl,
        requestedType || 'auto',
        preConfig,
        data.fallbackPreference
      );

      if (!processed.valid) {
        res.status(400).json({ error: processed.error || 'Destination URL failed validation.' });
        return;
      }

      const resolvedApp = await getSupportedAppByType(processed.destinationType);
      if (resolvedApp && !resolvedApp.isActive) {
        res.status(400).json({ error: `${resolvedApp.appName} links are currently disabled by an administrator.` });
        return;
      }

      // Short code validation or collision-checked random generation
      let shortCode = data.customShortCode?.trim() || '';
      if (shortCode) {
        const scCheck = validateShortCode(shortCode);
        if (!scCheck.valid) {
          res.status(400).json({ error: scCheck.error });
          return;
        }
      } else {
        for (let attempt = 0; attempt < 5; attempt++) {
          const candidate = generateUniqueShortCode(6);
          if (!isReservedShortCode(candidate)) {
            const exists = await findSmartLinkByShortCode(candidate);
            if (!exists) {
              shortCode = candidate;
              break;
            }
          }
        }
        if (!shortCode) {
          shortCode = generateUniqueShortCode(8);
        }
      }

      // Validate campaign ownership if provided
      let campaignId: string | null = null;
      if (data.campaignId) {
        const camp = await getCampaignById(data.campaignId);
        if (!camp) {
          res.status(404).json({ error: 'Selected campaign does not exist.' });
          return;
        }
        if (req.profile!.role !== 'super_admin' && camp.userId !== req.profile!.id) {
          res.status(403).json({ error: 'You do not have access to the selected campaign.' });
          return;
        }
        campaignId = camp.id;
      }

      const destinationConfig = {
        ...processed.destinationConfig,
        utmSource: data.utmSource || undefined,
        utmMedium: data.utmMedium || undefined,
        utmCampaign: data.utmCampaign || undefined,
        customDomain: data.customDomain || undefined,
      };

      const created = await createSmartLink({
        userId: req.profile!.id,
        appId: resolvedApp?.id ?? null,
        linkName: data.linkName,
        shortCode,
        originalUrl: processed.originalUrl,
        normalizedUrl: processed.normalizedUrl,
        destinationType: processed.destinationType,
        destinationConfig,
        campaignId,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      });

      res.status(201).json({ link: created, inspection: processed });
    } catch (error) {
      const msg = (error as Error).message || 'Failed to create smart link.';
      const status = msg.includes('already in use') ? 409 : 500;
      res.status(status).json({ error: msg });
    }
  });

  app.get('/api/links', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(50, Math.max(5, Number(req.query.pageSize) || 12));
      const sortBy =
        req.query.sortBy === 'totalClicks' || req.query.sortBy === 'linkName'
          ? req.query.sortBy
          : 'createdAt';
      const sortDir = req.query.sortDir === 'asc' ? 'asc' : 'desc';
      const dateFrom =
        typeof req.query.dateFrom === 'string' && !Number.isNaN(Date.parse(req.query.dateFrom))
          ? new Date(req.query.dateFrom)
          : undefined;
      const dateTo =
        typeof req.query.dateTo === 'string' && !Number.isNaN(Date.parse(req.query.dateTo))
          ? new Date(req.query.dateTo)
          : undefined;

      const result = await listSmartLinks({
        requesterId: req.profile!.id,
        requesterRole: req.profile!.role,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        destinationType: typeof req.query.destinationType === 'string' ? req.query.destinationType : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        campaignId: typeof req.query.campaignId === 'string' ? req.query.campaignId : undefined,
        dateFrom,
        dateTo,
        sortBy,
        sortDir,
        page,
        pageSize,
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/links/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const link = await getSmartLinkById(req.params.id);
      if (!link || link.status === 'deleted') {
        res.status(404).json({ error: 'Smart link not found.' });
        return;
      }
      if (req.profile!.role !== 'super_admin' && link.userId !== req.profile!.id) {
        res.status(403).json({ error: 'You do not have permission to view this link.' });
        return;
      }
      res.json({ link });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.put('/api/links/:id', requireAuth, writeLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const existing = await getSmartLinkById(req.params.id);
      if (!existing || existing.status === 'deleted') {
        res.status(404).json({ error: 'Smart link not found.' });
        return;
      }
      if (req.profile!.role !== 'super_admin' && existing.userId !== req.profile!.id) {
        res.status(403).json({ error: 'You do not have permission to edit this link.' });
        return;
      }

      const parsed = updateLinkSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid update payload.' });
        return;
      }

      const data = parsed.data;
      const updates: Parameters<typeof updateSmartLink>[1] = {};

      if (data.linkName !== undefined) updates.linkName = data.linkName;
      if (data.status !== undefined) updates.status = data.status;
      if (data.campaignId !== undefined) {
        updates.campaignId = data.campaignId ? data.campaignId : null;
      }
      if (data.expiresAt !== undefined) {
        updates.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
      }

      if (data.customShortCode && data.customShortCode !== existing.shortCode) {
        const scCheck = validateShortCode(data.customShortCode);
        if (!scCheck.valid) {
          res.status(400).json({ error: scCheck.error });
          return;
        }
        updates.shortCode = data.customShortCode.trim();
      }

      if (data.destinationUrl || data.destinationType || data.fallbackPreference) {
        const targetUrl = data.destinationUrl || existing.originalUrl;
        const targetType = data.destinationType || existing.destinationType;
        const fallbackPref =
          data.fallbackPreference || existing.destinationConfig.fallbackPreference || 'app_first';
        const appRecord = targetType !== 'auto' ? await getSupportedAppByType(targetType) : null;
        const processed = processDestinationUrl(targetUrl, targetType, appRecord, fallbackPref);
        if (!processed.valid) {
          res.status(400).json({ error: processed.error || 'Destination URL failed validation.' });
          return;
        }
        const resolvedApp = await getSupportedAppByType(processed.destinationType);
        updates.originalUrl = processed.originalUrl;
        updates.normalizedUrl = processed.normalizedUrl;
        updates.destinationType = processed.destinationType;
        updates.appId = resolvedApp?.id ?? null;
        updates.destinationConfig = {
          ...processed.destinationConfig,
          utmSource: data.utmSource ?? existing.destinationConfig.utmSource,
          utmMedium: data.utmMedium ?? existing.destinationConfig.utmMedium,
          utmCampaign: data.utmCampaign ?? existing.destinationConfig.utmCampaign,
          customDomain: data.customDomain ?? existing.destinationConfig.customDomain,
        };
      }

      const updated = await updateSmartLink(existing.id, updates);
      res.json({ link: updated });
    } catch (error) {
      const msg = (error as Error).message || 'Failed to update link.';
      res.status(msg.includes('taken') ? 409 : 500).json({ error: msg });
    }
  });

  app.post('/api/links/:id/deactivate', requireAuth, writeLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const existing = await getSmartLinkById(req.params.id);
      if (!existing || existing.status === 'deleted') {
        res.status(404).json({ error: 'Smart link not found.' });
        return;
      }
      if (req.profile!.role !== 'super_admin' && existing.userId !== req.profile!.id) {
        res.status(403).json({ error: 'Insufficient permissions.' });
        return;
      }
      const nextStatus = existing.status === 'active' ? 'inactive' : 'active';
      const updated = await updateSmartLink(existing.id, { status: nextStatus });
      res.json({ link: updated });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.delete('/api/links/:id', requireAuth, writeLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const existing = await getSmartLinkById(req.params.id);
      if (!existing || existing.status === 'deleted') {
        res.status(404).json({ error: 'Smart link not found.' });
        return;
      }
      if (req.profile!.role !== 'super_admin' && existing.userId !== req.profile!.id) {
        res.status(403).json({ error: 'Insufficient permissions.' });
        return;
      }
      await softDeleteSmartLink(existing.id);
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // =========================================================================
  // Campaigns API
  // =========================================================================
  app.get('/api/campaigns', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const items = await listCampaigns(req.profile!.id, req.profile!.role);
      res.json({ campaigns: items });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/campaigns', requireAuth, requireRole(['super_admin', 'admin', 'user']), writeLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = campaignSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid campaign payload.' });
        return;
      }
      const data = parsed.data;
      const created = await createCampaign({
        userId: req.profile!.id,
        campaignName: data.campaignName,
        description: data.description || null,
        utmSource: data.utmSource || null,
        utmMedium: data.utmMedium || null,
        utmCampaign: data.utmCampaign || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        status: data.status,
      });
      res.status(201).json({ campaign: created });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.put('/api/campaigns/:id', requireAuth, writeLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const existing = await getCampaignById(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Campaign not found.' });
        return;
      }
      if (req.profile!.role !== 'super_admin' && existing.userId !== req.profile!.id) {
        res.status(403).json({ error: 'Insufficient permissions.' });
        return;
      }
      const parsed = campaignSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid campaign update.' });
        return;
      }
      const d = parsed.data;
      const updated = await updateCampaign(existing.id, {
        ...(d.campaignName !== undefined ? { campaignName: d.campaignName } : {}),
        ...(d.description !== undefined ? { description: d.description } : {}),
        ...(d.utmSource !== undefined ? { utmSource: d.utmSource } : {}),
        ...(d.utmMedium !== undefined ? { utmMedium: d.utmMedium } : {}),
        ...(d.utmCampaign !== undefined ? { utmCampaign: d.utmCampaign } : {}),
        ...(d.startDate !== undefined ? { startDate: d.startDate ? new Date(d.startDate) : null } : {}),
        ...(d.endDate !== undefined ? { endDate: d.endDate ? new Date(d.endDate) : null } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
      });
      res.json({ campaign: updated });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.delete('/api/campaigns/:id', requireAuth, writeLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const existing = await getCampaignById(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Campaign not found.' });
        return;
      }
      if (req.profile!.role !== 'super_admin' && existing.userId !== req.profile!.id) {
        res.status(403).json({ error: 'Insufficient permissions.' });
        return;
      }
      await deleteCampaign(existing.id);
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // =========================================================================
  // Analytics API
  // =========================================================================
  app.get('/api/analytics/dashboard', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { fromDate, toDate } = parseDateRange(req.query);
      const summary = await getAnalyticsSummary({
        requesterId: req.profile!.id,
        requesterRole: req.profile!.role,
        fromDate,
        toDate,
      });
      res.json(summary);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/analytics/links/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const link = await getSmartLinkById(req.params.id);
      if (!link || link.status === 'deleted') {
        res.status(404).json({ error: 'Smart link not found.' });
        return;
      }
      if (req.profile!.role !== 'super_admin' && link.userId !== req.profile!.id) {
        res.status(403).json({ error: 'Insufficient permissions.' });
        return;
      }
      const { fromDate, toDate } = parseDateRange(req.query);
      const summary = await getAnalyticsSummary({
        requesterId: req.profile!.id,
        requesterRole: req.profile!.role,
        smartLinkId: link.id,
        fromDate,
        toDate,
      });
      res.json({ link, ...summary });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/analytics/campaigns/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const camp = await getCampaignById(req.params.id);
      if (!camp) {
        res.status(404).json({ error: 'Campaign not found.' });
        return;
      }
      if (req.profile!.role !== 'super_admin' && camp.userId !== req.profile!.id) {
        res.status(403).json({ error: 'Insufficient permissions.' });
        return;
      }
      const { fromDate, toDate } = parseDateRange(req.query);
      const summary = await getAnalyticsSummary({
        requesterId: req.profile!.id,
        requesterRole: req.profile!.role,
        campaignId: camp.id,
        fromDate,
        toDate,
      });
      res.json({ campaign: camp, ...summary });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Public lightweight outcome beacon from the redirect interstitial buttons
  app.post('/api/analytics/outcome', redirectLimiter, async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        smartLinkId: z.string().uuid(),
        platform: z.enum(['android', 'ios', 'desktop', 'other']),
        browser: z.string().max(40),
        referralSource: z.string().max(40),
        outcome: z.enum(['manual_app_click', 'manual_browser_click']),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ ok: false });
        return;
      }
      const link = await getSmartLinkById(parsed.data.smartLinkId);
      if (!link || link.status !== 'active') {
        res.status(404).json({ ok: false });
        return;
      }
      await recordClickEvent({
        smartLinkId: link.id,
        platform: parsed.data.platform,
        deviceCategory: parsed.data.platform === 'desktop' ? 'desktop' : 'mobile',
        browser: parsed.data.browser,
        referralSource: parsed.data.referralSource,
        redirectOutcome: parsed.data.outcome,
        campaignId: link.campaignId,
        incrementTotal: false,
      });
      res.status(204).end();
    } catch {
      res.status(204).end();
    }
  });

  // =========================================================================
  // Application Settings API
  // =========================================================================
  app.get('/api/settings', requireAuth, async (_req: AuthRequest, res: Response) => {
    try {
      const settings = await getAllSettings();
      res.json({ settings });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.put('/api/settings', requireAuth, requireRole(['super_admin']), writeLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        key: z.enum(['domain_config', 'privacy_config']),
        value: z.record(z.string(), z.unknown()),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid settings update.' });
        return;
      }
      const saved = await upsertSetting(parsed.data.key, parsed.data.value);
      res.json({ setting: saved });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // =========================================================================
  // Universal Short URL Redirection Handler (GET /r/:shortCode & GET /:shortCode)
  // =========================================================================
  async function handleShortRedirect(req: Request, res: Response, next: NextFunction) {
    const shortCode = req.params.shortCode;
    if (!shortCode || isReservedShortCode(shortCode)) {
      next();
      return;
    }

    // Never hijack Vite dev internals or static asset requests
    if (shortCode.includes('.') || shortCode.startsWith('@') || shortCode.startsWith('__')) {
      next();
      return;
    }

    try {
      const found = await findSmartLinkByShortCode(shortCode);
      if (!found) {
        res
          .status(404)
          .setHeader('Content-Type', 'text/html; charset=utf-8')
          .send(
            renderStatusErrorHtml(
              404,
              'Link not found',
              'This SmartLink short URL does not exist or may have been mistyped.'
            )
          );
        return;
      }

      const { link, app: appRecord, campaign } = found;

      if (link.status === 'deleted' || link.status === 'inactive') {
        res
          .status(410)
          .setHeader('Content-Type', 'text/html; charset=utf-8')
          .send(
            renderStatusErrorHtml(
              410,
              'Link unavailable',
              'This SmartLink has been deactivated by its owner and is no longer active.'
            )
          );
        return;
      }

      if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) {
        res
          .status(410)
          .setHeader('Content-Type', 'text/html; charset=utf-8')
          .send(
            renderStatusErrorHtml(
              410,
              'Link expired',
              'This SmartLink has passed its scheduled expiration date.'
            )
          );
        return;
      }

      // Defense-in-depth destination safety validation before redirect
      const urlSafety = validateSafeHttpsUrl(link.normalizedUrl);
      if (!urlSafety.valid) {
        res
          .status(400)
          .setHeader('Content-Type', 'text/html; charset=utf-8')
          .send(
            renderStatusErrorHtml(
              400,
              'Blocked destination',
              'This link destination failed HTTPS safety validation and was blocked.'
            )
          );
        return;
      }

      const isPreview = req.query.preview === '1';
      const simKey = typeof req.query.sim === 'string' ? req.query.sim : '';
      const simPreset = isPreview && simKey in SIMULATED_USER_AGENTS ? SIMULATED_USER_AGENTS[simKey] : null;

      const userAgent = simPreset ? simPreset.ua : req.get('user-agent') || '';
      const referer = simPreset ? simPreset.referer : req.get('referer') || '';
      const srcQuery = typeof req.query.src === 'string' ? req.query.src : typeof req.query.utm_source === 'string' ? req.query.utm_source : '';

      const device = detectDeviceContext(userAgent, referer, srcQuery);

      const mergedConfig = {
        ...link.destinationConfig,
        utmSource: link.destinationConfig.utmSource || campaign?.utmSource || undefined,
        utmMedium: link.destinationConfig.utmMedium || campaign?.utmMedium || undefined,
        utmCampaign: link.destinationConfig.utmCampaign || campaign?.utmCampaign || undefined,
      };

      const plan = resolveRedirection({
        destinationType: link.destinationType,
        normalizedUrl: link.normalizedUrl,
        destinationConfig: mergedConfig,
        appConfig: appRecord,
        device,
      });

      // Record analytics unless running a non-recording dry preview (record when record=1 or real click)
      const shouldRecord = !isPreview || req.query.record === '1';
      if (shouldRecord) {
        const dedupHash = computePrivacySafeDedupHash(
          link.id,
          device.platform,
          device.browser,
          req.get('accept-language') || ''
        );
        void recordClickEvent({
          smartLinkId: link.id,
          platform: device.platform,
          deviceCategory: device.deviceCategory,
          browser: device.browser,
          referralSource: device.referralSource,
          redirectOutcome: plan.outcome,
          dedupHash,
          campaignId: link.campaignId,
          incrementTotal: true,
        });
      }

      if (plan.strategy === 'direct_302' && !isPreview) {
        res.redirect(302, plan.webFallbackUrl);
        return;
      }

      const html = renderRedirectInterstitialHtml({
        linkName: link.linkName,
        shortCode: link.shortCode,
        smartLinkId: link.id,
        plan,
        device,
        isPreview,
      });

      res
        .status(200)
        .setHeader('Content-Type', 'text/html; charset=utf-8')
        .setHeader('Cache-Control', 'no-store')
        .send(html);
    } catch (error) {
      console.error('Short link redirect error:', error);
      res
        .status(500)
        .setHeader('Content-Type', 'text/html; charset=utf-8')
        .send(
          renderStatusErrorHtml(
            500,
            'Temporary redirect error',
            'We encountered an error resolving this link. Please try again in a moment.'
          )
        );
    }
  }

  app.get('/r/:shortCode', redirectLimiter, handleShortRedirect);
  app.get('/:shortCode', redirectLimiter, handleShortRedirect);

  // =========================================================================
  // Frontend Serving (Vite Middleware in Dev / Static dist in Production)
  // =========================================================================
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SmartLink server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
