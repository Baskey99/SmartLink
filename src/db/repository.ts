import crypto from 'node:crypto';
import { and, count, desc, eq, gte, ilike, lte, ne, or, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  applicationSettings,
  campaigns,
  linkAnalytics,
  profiles,
  smartLinks,
  supportedApps,
  type AccountStatus,
  type AppConfigurationJson,
  type CampaignStatus,
  type DestinationConfigJson,
  type LinkStatus,
  type UserRole,
} from './schema.ts';
import { DEFAULT_SUPPORTED_APPS } from '../lib/redirect-engine/index.ts';

const SUPER_ADMIN_BOOTSTRAP_EMAIL = 'amitbaskey99@gmail.com';

let defaultsSeeded = false;

export async function ensureDefaultSeedData(): Promise<void> {
  if (defaultsSeeded) return;
  try {
    for (const app of DEFAULT_SUPPORTED_APPS) {
      await db
        .insert(supportedApps)
        .values({
          appName: app.appName,
          appType: app.appType,
          androidPackage: app.androidPackage,
          iosBundleIdentifier: app.iosBundleIdentifier,
          androidAppLinkDomain: app.androidAppLinkDomain,
          iosUniversalLinkDomain: app.iosUniversalLinkDomain,
          deepLinkFormat: app.deepLinkFormat,
          webFallbackUrl: app.webFallbackUrl,
          appStoreUrl: app.appStoreUrl,
          playStoreUrl: app.playStoreUrl,
          configuration: app.configuration,
          isActive: app.isActive,
        })
        .onConflictDoNothing({ target: supportedApps.appType });
    }

    const defaultSettings: Array<{ key: string; value: Record<string, unknown> }> = [
      {
        key: 'domain_config',
        value: {
          customShortDomain: '',
          enforceHttps: true,
          defaultFallbackPreference: 'app_first',
          iosTeamId: 'TEAMID1234',
          iosAppBundleId: 'com.smartlink.app',
          androidSha256Fingerprints: [],
          androidAppPackage: 'com.smartlink.app',
        },
      },
      {
        key: 'privacy_config',
        value: {
          storeIpAddresses: false,
          privacySafeDeduplication: true,
          defaultLinkExpirationDays: 0,
        },
      },
    ];

    for (const item of defaultSettings) {
      await db
        .insert(applicationSettings)
        .values({
          settingKey: item.key,
          settingValue: item.value,
        })
        .onConflictDoNothing({ target: applicationSettings.settingKey });
    }

    defaultsSeeded = true;
  } catch (error) {
    console.error('Failed to ensure default seed data:', error);
    throw new Error('Failed to initialize application defaults.', { cause: error });
  }
}

export async function upsertProfileFromFirebase(params: {
  firebaseUid: string;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
}) {
  try {
    const normalizedEmail = params.email.trim().toLowerCase();
    const existingByUid = await db
      .select()
      .from(profiles)
      .where(eq(profiles.firebaseUid, params.firebaseUid))
      .limit(1);

    if (existingByUid.length > 0) {
      const updated = await db
        .update(profiles)
        .set({
          email: normalizedEmail,
          avatarUrl: params.avatarUrl ?? existingByUid[0].avatarUrl,
        })
        .where(eq(profiles.id, existingByUid[0].id))
        .returning();
      return updated[0];
    }

    const [{ total }] = await db.select({ total: count() }).from(profiles);
    const shouldBeSuperAdmin =
      normalizedEmail === SUPER_ADMIN_BOOTSTRAP_EMAIL || Number(total) === 0;

    const inserted = await db
      .insert(profiles)
      .values({
        firebaseUid: params.firebaseUid,
        email: normalizedEmail,
        fullName: params.fullName || normalizedEmail.split('@')[0],
        avatarUrl: params.avatarUrl ?? null,
        role: shouldBeSuperAdmin ? 'super_admin' : 'user',
        status: 'active',
      })
      .onConflictDoUpdate({
        target: profiles.firebaseUid,
        set: {
          email: normalizedEmail,
          avatarUrl: params.avatarUrl ?? null,
        },
      })
      .returning();

    return inserted[0];
  } catch (error) {
    console.error('Failed to upsert user profile:', error);
    throw new Error('Could not synchronize user profile.', { cause: error });
  }
}

export async function updateProfileName(profileId: string, fullName: string) {
  try {
    const [updated] = await db
      .update(profiles)
      .set({ fullName: fullName.trim() })
      .where(eq(profiles.id, profileId))
      .returning();
    return updated;
  } catch (error) {
    console.error('Failed to update profile name:', error);
    throw new Error('Failed to update profile.', { cause: error });
  }
}

export async function listAllProfiles() {
  try {
    return await db.select().from(profiles).orderBy(desc(profiles.createdAt));
  } catch (error) {
    console.error('Failed to list profiles:', error);
    throw new Error('Failed to load users.', { cause: error });
  }
}

export async function updateUserRoleOrStatus(
  targetId: string,
  updates: { role?: UserRole; status?: AccountStatus }
) {
  try {
    const [updated] = await db
      .update(profiles)
      .set(updates)
      .where(eq(profiles.id, targetId))
      .returning();
    return updated;
  } catch (error) {
    console.error('Failed to update user:', error);
    throw new Error('Failed to update user account.', { cause: error });
  }
}

export async function listSupportedApps() {
  try {
    await ensureDefaultSeedData();
    return await db.select().from(supportedApps).orderBy(supportedApps.appName);
  } catch (error) {
    console.error('Failed to list supported apps:', error);
    throw new Error('Failed to load supported applications.', { cause: error });
  }
}

export async function getSupportedAppByType(appType: string) {
  try {
    await ensureDefaultSeedData();
    const rows = await db
      .select()
      .from(supportedApps)
      .where(eq(supportedApps.appType, appType))
      .limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error('Failed to get supported app:', error);
    throw new Error('Failed to load application configuration.', { cause: error });
  }
}

export async function createSupportedApp(data: {
  appName: string;
  appType: string;
  androidPackage?: string | null;
  iosBundleIdentifier?: string | null;
  androidAppLinkDomain?: string | null;
  iosUniversalLinkDomain?: string | null;
  deepLinkFormat?: string | null;
  webFallbackUrl?: string | null;
  appStoreUrl?: string | null;
  playStoreUrl?: string | null;
  configuration: AppConfigurationJson;
  isActive: boolean;
}) {
  try {
    const [created] = await db.insert(supportedApps).values(data).returning();
    return created;
  } catch (error) {
    console.error('Failed to create supported app:', error);
    throw new Error('Failed to create application configuration.', { cause: error });
  }
}

export async function updateSupportedApp(
  id: string,
  data: Partial<{
    appName: string;
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
  }>
) {
  try {
    const [updated] = await db
      .update(supportedApps)
      .set(data)
      .where(eq(supportedApps.id, id))
      .returning();
    return updated;
  } catch (error) {
    console.error('Failed to update supported app:', error);
    throw new Error('Failed to update application configuration.', { cause: error });
  }
}

export function generateUniqueShortCode(length = 6): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export async function findSmartLinkByShortCode(shortCode: string) {
  try {
    const rows = await db
      .select({
        link: smartLinks,
        app: supportedApps,
        campaign: campaigns,
      })
      .from(smartLinks)
      .leftJoin(supportedApps, eq(smartLinks.appId, supportedApps.id))
      .leftJoin(campaigns, eq(smartLinks.campaignId, campaigns.id))
      .where(eq(smartLinks.shortCode, shortCode))
      .limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error('Failed to lookup smart link:', error);
    throw new Error('Failed to resolve short link.', { cause: error });
  }
}

export async function createSmartLink(data: {
  userId: string;
  appId: string | null;
  linkName: string;
  shortCode: string;
  originalUrl: string;
  normalizedUrl: string;
  destinationType: string;
  destinationConfig: DestinationConfigJson;
  campaignId: string | null;
  expiresAt: Date | null;
}) {
  try {
    const [created] = await db.insert(smartLinks).values(data).returning();
    return created;
  } catch (error: unknown) {
    const pgCode = (error as { code?: string; cause?: { code?: string } })?.code ||
      (error as { cause?: { code?: string } })?.cause?.code;
    if (pgCode === '23505') {
      throw new Error('That short code is already in use. Choose another custom slug.', { cause: error });
    }
    console.error('Failed to create smart link:', error);
    throw new Error('Failed to create smart link.', { cause: error });
  }
}

export async function listSmartLinks(params: {
  requesterId: string;
  requesterRole: UserRole;
  search?: string;
  destinationType?: string;
  status?: string;
  campaignId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy?: 'createdAt' | 'totalClicks' | 'linkName';
  sortDir?: 'asc' | 'desc';
  page: number;
  pageSize: number;
}) {
  try {
    const conditions = [ne(smartLinks.status, 'deleted')];

    if (params.requesterRole !== 'super_admin') {
      conditions.push(eq(smartLinks.userId, params.requesterId));
    }
    if (params.search && params.search.trim()) {
      const q = `%${params.search.trim()}%`;
      conditions.push(
        or(
          ilike(smartLinks.linkName, q),
          ilike(smartLinks.shortCode, q),
          ilike(smartLinks.originalUrl, q)
        )!
      );
    }
    if (params.destinationType && params.destinationType !== 'all') {
      conditions.push(eq(smartLinks.destinationType, params.destinationType));
    }
    if (params.status && params.status !== 'all') {
      conditions.push(eq(smartLinks.status, params.status as LinkStatus));
    }
    if (params.campaignId && params.campaignId !== 'all') {
      conditions.push(eq(smartLinks.campaignId, params.campaignId));
    }
    if (params.dateFrom) {
      conditions.push(gte(smartLinks.createdAt, params.dateFrom));
    }
    if (params.dateTo) {
      conditions.push(lte(smartLinks.createdAt, params.dateTo));
    }

    const whereClause = and(...conditions);

    const [{ total }] = await db
      .select({ total: count() })
      .from(smartLinks)
      .where(whereClause);

    const orderCol =
      params.sortBy === 'totalClicks'
        ? smartLinks.totalClicks
        : params.sortBy === 'linkName'
          ? smartLinks.linkName
          : smartLinks.createdAt;

    const orderExpr = params.sortDir === 'asc' ? orderCol : desc(orderCol);

    const rows = await db
      .select({
        link: smartLinks,
        campaignName: campaigns.campaignName,
        appName: supportedApps.appName,
        ownerEmail: profiles.email,
      })
      .from(smartLinks)
      .leftJoin(campaigns, eq(smartLinks.campaignId, campaigns.id))
      .leftJoin(supportedApps, eq(smartLinks.appId, supportedApps.id))
      .leftJoin(profiles, eq(smartLinks.userId, profiles.id))
      .where(whereClause)
      .orderBy(orderExpr)
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize);

    return {
      items: rows.map((r) => ({
        ...r.link,
        campaignName: r.campaignName ?? null,
        appName: r.appName ?? r.link.destinationType,
        ownerEmail: r.ownerEmail ?? null,
      })),
      total: Number(total),
      page: params.page,
      pageSize: params.pageSize,
    };
  } catch (error) {
    console.error('Failed to list smart links:', error);
    throw new Error('Failed to load smart links.', { cause: error });
  }
}

export async function getSmartLinkById(id: string) {
  try {
    const rows = await db
      .select({
        link: smartLinks,
        campaignName: campaigns.campaignName,
        appName: supportedApps.appName,
      })
      .from(smartLinks)
      .leftJoin(campaigns, eq(smartLinks.campaignId, campaigns.id))
      .leftJoin(supportedApps, eq(smartLinks.appId, supportedApps.id))
      .where(eq(smartLinks.id, id))
      .limit(1);
    if (!rows[0]) return null;
    return {
      ...rows[0].link,
      campaignName: rows[0].campaignName ?? null,
      appName: rows[0].appName ?? rows[0].link.destinationType,
    };
  } catch (error) {
    console.error('Failed to fetch smart link:', error);
    throw new Error('Failed to fetch smart link.', { cause: error });
  }
}

export async function updateSmartLink(
  id: string,
  updates: Partial<{
    linkName: string;
    shortCode: string;
    originalUrl: string;
    normalizedUrl: string;
    destinationType: string;
    appId: string | null;
    destinationConfig: DestinationConfigJson;
    campaignId: string | null;
    status: LinkStatus;
    expiresAt: Date | null;
  }>
) {
  try {
    const [updated] = await db
      .update(smartLinks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(smartLinks.id, id))
      .returning();
    return updated;
  } catch (error: unknown) {
    const pgCode = (error as { code?: string; cause?: { code?: string } })?.code ||
      (error as { cause?: { code?: string } })?.cause?.code;
    if (pgCode === '23505') {
      throw new Error('Short code is already taken.', { cause: error });
    }
    console.error('Failed to update smart link:', error);
    throw new Error('Failed to update smart link.', { cause: error });
  }
}

export async function softDeleteSmartLink(id: string) {
  try {
    const [updated] = await db
      .update(smartLinks)
      .set({ status: 'deleted', updatedAt: new Date() })
      .where(eq(smartLinks.id, id))
      .returning();
    return updated;
  } catch (error) {
    console.error('Failed to delete smart link:', error);
    throw new Error('Failed to delete smart link.', { cause: error });
  }
}

export async function recordClickEvent(data: {
  smartLinkId: string;
  platform: string;
  deviceCategory: string;
  browser: string;
  referralSource: string;
  redirectOutcome: string;
  dedupHash?: string | null;
  campaignId?: string | null;
  incrementTotal?: boolean;
}) {
  try {
    await db.insert(linkAnalytics).values({
      smartLinkId: data.smartLinkId,
      platform: data.platform,
      deviceCategory: data.deviceCategory,
      browser: data.browser,
      referralSource: data.referralSource,
      redirectOutcome: data.redirectOutcome,
      dedupHash: data.dedupHash ?? null,
      campaignId: data.campaignId ?? null,
    });

    if (data.incrementTotal !== false) {
      await db
        .update(smartLinks)
        .set({ totalClicks: sql`${smartLinks.totalClicks} + 1` })
        .where(eq(smartLinks.id, data.smartLinkId));
    }
  } catch (error) {
    console.error('Failed to record analytics event:', error);
  }
}

export async function listCampaigns(requesterId: string, requesterRole: UserRole) {
  try {
    const whereClause =
      requesterRole === 'super_admin' ? undefined : eq(campaigns.userId, requesterId);

    const rows = await db
      .select({
        campaign: campaigns,
        ownerEmail: profiles.email,
        linkCount: sql<number>`(SELECT count(*)::int FROM smart_links sl WHERE sl.campaign_id = ${campaigns.id} AND sl.status != 'deleted')`,
        totalClicks: sql<number>`(SELECT coalesce(sum(sl.total_clicks), 0)::int FROM smart_links sl WHERE sl.campaign_id = ${campaigns.id} AND sl.status != 'deleted')`,
      })
      .from(campaigns)
      .leftJoin(profiles, eq(campaigns.userId, profiles.id))
      .where(whereClause)
      .orderBy(desc(campaigns.createdAt));

    return rows.map((r) => ({
      ...r.campaign,
      ownerEmail: r.ownerEmail ?? null,
      linkCount: Number(r.linkCount || 0),
      totalClicks: Number(r.totalClicks || 0),
    }));
  } catch (error) {
    console.error('Failed to list campaigns:', error);
    throw new Error('Failed to load campaigns.', { cause: error });
  }
}

export async function getCampaignById(id: string) {
  try {
    const rows = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error('Failed to load campaign:', error);
    throw new Error('Failed to load campaign.', { cause: error });
  }
}

export async function createCampaign(data: {
  userId: string;
  campaignName: string;
  description?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  status: CampaignStatus;
}) {
  try {
    const [created] = await db.insert(campaigns).values(data).returning();
    return created;
  } catch (error) {
    console.error('Failed to create campaign:', error);
    throw new Error('Failed to create campaign.', { cause: error });
  }
}

export async function updateCampaign(
  id: string,
  data: Partial<{
    campaignName: string;
    description: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    startDate: Date | null;
    endDate: Date | null;
    status: CampaignStatus;
  }>
) {
  try {
    const [updated] = await db
      .update(campaigns)
      .set(data)
      .where(eq(campaigns.id, id))
      .returning();
    return updated;
  } catch (error) {
    console.error('Failed to update campaign:', error);
    throw new Error('Failed to update campaign.', { cause: error });
  }
}

export async function deleteCampaign(id: string) {
  try {
    await db.delete(campaigns).where(eq(campaigns.id, id));
  } catch (error) {
    console.error('Failed to delete campaign:', error);
    throw new Error('Failed to delete campaign.', { cause: error });
  }
}

export async function getAnalyticsSummary(params: {
  requesterId: string;
  requesterRole: UserRole;
  fromDate?: Date;
  toDate?: Date;
  smartLinkId?: string;
  campaignId?: string;
}) {
  try {
    const linkConditions = [ne(smartLinks.status, 'deleted')];
    if (params.requesterRole !== 'super_admin') {
      linkConditions.push(eq(smartLinks.userId, params.requesterId));
    }
    if (params.smartLinkId) {
      linkConditions.push(eq(smartLinks.id, params.smartLinkId));
    }
    if (params.campaignId) {
      linkConditions.push(eq(smartLinks.campaignId, params.campaignId));
    }

    const userLinks = await db
      .select({
        id: smartLinks.id,
        linkName: smartLinks.linkName,
        shortCode: smartLinks.shortCode,
        destinationType: smartLinks.destinationType,
        originalUrl: smartLinks.originalUrl,
        totalClicks: smartLinks.totalClicks,
        status: smartLinks.status,
        createdAt: smartLinks.createdAt,
        campaignId: smartLinks.campaignId,
      })
      .from(smartLinks)
      .where(and(...linkConditions))
      .orderBy(desc(smartLinks.createdAt));

    const linkIds = userLinks.map((l) => l.id);

    const emptyResult = {
      totals: {
        totalLinks: userLinks.length,
        totalClicks: 0,
        uniqueClicks: 0,
        androidClicks: 0,
        iosClicks: 0,
        desktopClicks: 0,
        instagramTraffic: 0,
        whatsappTraffic: 0,
        facebookTraffic: 0,
        manualAppClicks: 0,
        manualBrowserClicks: 0,
      },
      clicksByDate: [] as Array<{ date: string; clicks: number; unique: number }>,
      clicksByPlatform: [] as Array<{ name: string; value: number }>,
      clicksByBrowser: [] as Array<{ name: string; value: number }>,
      clicksByReferral: [] as Array<{ name: string; value: number }>,
      clicksByDestination: [] as Array<{ name: string; value: number }>,
      clicksByOutcome: [] as Array<{ name: string; value: number }>,
      topLinks: userLinks
        .slice()
        .sort((a, b) => b.totalClicks - a.totalClicks)
        .slice(0, 6),
      recentLinks: userLinks.slice(0, 6),
    };

    if (linkIds.length === 0) {
      return emptyResult;
    }

    const analyticsConditions = [
      sql`${linkAnalytics.smartLinkId} IN (${sql.join(
        linkIds.map((id) => sql`${id}`),
        sql`, `
      )})`,
    ];

    if (params.fromDate) {
      analyticsConditions.push(gte(linkAnalytics.clickedAt, params.fromDate));
    }
    if (params.toDate) {
      analyticsConditions.push(lte(linkAnalytics.clickedAt, params.toDate));
    }

    const events = await db
      .select({
        smartLinkId: linkAnalytics.smartLinkId,
        platform: linkAnalytics.platform,
        browser: linkAnalytics.browser,
        referralSource: linkAnalytics.referralSource,
        redirectOutcome: linkAnalytics.redirectOutcome,
        dedupHash: linkAnalytics.dedupHash,
        clickedAt: linkAnalytics.clickedAt,
      })
      .from(linkAnalytics)
      .where(and(...analyticsConditions))
      .orderBy(linkAnalytics.clickedAt);

    const linkTypeMap = new Map(userLinks.map((l) => [l.id, l.destinationType]));
    const linkClicksInRange = new Map<string, number>();

    // Separate primary redirect attempts from follow-up manual button beacon clicks
    const primaryEvents = events.filter(
      (e) => e.redirectOutcome !== 'manual_app_click' && e.redirectOutcome !== 'manual_browser_click'
    );
    const manualAppClicks = events.filter((e) => e.redirectOutcome === 'manual_app_click').length;
    const manualBrowserClicks = events.filter((e) => e.redirectOutcome === 'manual_browser_click').length;

    const uniqueSet = new Set<string>();
    const dateMap = new Map<string, { clicks: number; uniques: Set<string> }>();
    const platformMap = new Map<string, number>();
    const browserMap = new Map<string, number>();
    const referralMap = new Map<string, number>();
    const destMap = new Map<string, number>();
    const outcomeMap = new Map<string, number>();

    let androidClicks = 0;
    let iosClicks = 0;
    let desktopClicks = 0;
    let instagramTraffic = 0;
    let whatsappTraffic = 0;
    let facebookTraffic = 0;

    for (const ev of events) {
      outcomeMap.set(ev.redirectOutcome, (outcomeMap.get(ev.redirectOutcome) || 0) + 1);
    }

    for (const ev of primaryEvents) {
      const dayKey = ev.clickedAt.toISOString().slice(0, 10);
      const dedupKey = ev.dedupHash || `${ev.smartLinkId}:${dayKey}:${ev.platform}:${ev.browser}`;
      uniqueSet.add(dedupKey);

      if (!dateMap.has(dayKey)) {
        dateMap.set(dayKey, { clicks: 0, uniques: new Set() });
      }
      const bucket = dateMap.get(dayKey)!;
      bucket.clicks += 1;
      bucket.uniques.add(dedupKey);

      platformMap.set(ev.platform, (platformMap.get(ev.platform) || 0) + 1);
      browserMap.set(ev.browser, (browserMap.get(ev.browser) || 0) + 1);
      referralMap.set(ev.referralSource, (referralMap.get(ev.referralSource) || 0) + 1);

      const destType = linkTypeMap.get(ev.smartLinkId) || 'other';
      destMap.set(destType, (destMap.get(destType) || 0) + 1);
      linkClicksInRange.set(ev.smartLinkId, (linkClicksInRange.get(ev.smartLinkId) || 0) + 1);

      if (ev.platform === 'android') androidClicks++;
      if (ev.platform === 'ios') iosClicks++;
      if (ev.platform === 'desktop') desktopClicks++;
      if (ev.referralSource === 'instagram') instagramTraffic++;
      if (ev.referralSource === 'whatsapp') whatsappTraffic++;
      if (ev.referralSource === 'facebook') facebookTraffic++;
    }

    const toSortedArray = (map: Map<string, number>) =>
      Array.from(map.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    const clicksByDate = Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        clicks: v.clicks,
        unique: v.uniques.size,
      }));

    const topLinks = userLinks
      .map((l) => ({
        ...l,
        rangeClicks: linkClicksInRange.get(l.id) ?? 0,
      }))
      .sort((a, b) => b.totalClicks - a.totalClicks)
      .slice(0, 6);

    return {
      totals: {
        totalLinks: userLinks.length,
        totalClicks: primaryEvents.length,
        uniqueClicks: uniqueSet.size,
        androidClicks,
        iosClicks,
        desktopClicks,
        instagramTraffic,
        whatsappTraffic,
        facebookTraffic,
        manualAppClicks,
        manualBrowserClicks,
      },
      clicksByDate,
      clicksByPlatform: toSortedArray(platformMap),
      clicksByBrowser: toSortedArray(browserMap),
      clicksByReferral: toSortedArray(referralMap),
      clicksByDestination: toSortedArray(destMap),
      clicksByOutcome: toSortedArray(outcomeMap),
      topLinks,
      recentLinks: userLinks.slice(0, 6),
    };
  } catch (error) {
    console.error('Failed to aggregate analytics:', error);
    throw new Error('Failed to load analytics summary.', { cause: error });
  }
}

export async function getAllSettings() {
  try {
    await ensureDefaultSeedData();
    const rows = await db.select().from(applicationSettings);
    const result: Record<string, Record<string, unknown>> = {};
    for (const row of rows) {
      result[row.settingKey] = row.settingValue;
    }
    return result;
  } catch (error) {
    console.error('Failed to fetch settings:', error);
    throw new Error('Failed to load application settings.', { cause: error });
  }
}

export async function upsertSetting(key: string, value: Record<string, unknown>) {
  try {
    const [updated] = await db
      .insert(applicationSettings)
      .values({
        settingKey: key,
        settingValue: value,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: applicationSettings.settingKey,
        set: {
          settingValue: value,
          updatedAt: new Date(),
        },
      })
      .returning();
    return updated;
  } catch (error) {
    console.error('Failed to save setting:', error);
    throw new Error('Failed to save application setting.', { cause: error });
  }
}
