import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export type UserRole = 'super_admin' | 'admin' | 'user';
export type AccountStatus = 'active' | 'inactive';
export type LinkStatus = 'active' | 'inactive' | 'deleted';
export type CampaignStatus = 'active' | 'paused' | 'completed' | 'archived';

export interface AppConfigurationJson {
  supportsAppLinks: boolean;
  supportsUniversalLinks: boolean;
  androidIntentScheme?: string;
  iosCustomScheme?: string;
  storeRedirectEnabled: boolean;
  documentedCapabilities: string;
  allowedHosts: string[];
}

export interface DestinationConfigJson {
  contentId?: string;
  contentKind?: string;
  androidAppLink?: string;
  androidIntentUrl?: string;
  iosUniversalLink?: string;
  iosSchemeUrl?: string;
  webFallbackUrl: string;
  fallbackPreference: 'app_first' | 'web_only' | 'interstitial_always';
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  customDomain?: string;
}

export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    firebaseUid: text('firebase_uid').notNull().unique(),
    fullName: text('full_name').notNull(),
    email: text('email').notNull().unique(),
    role: text('role').$type<UserRole>().notNull().default('user'),
    status: text('status').$type<AccountStatus>().notNull().default('active'),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_profiles_firebase_uid').on(table.firebaseUid),
    index('idx_profiles_role').on(table.role),
  ]
);

export const supportedApps = pgTable(
  'supported_apps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    appName: text('app_name').notNull(),
    appType: text('app_type').notNull().unique(),
    androidPackage: text('android_package'),
    iosBundleIdentifier: text('ios_bundle_identifier'),
    androidAppLinkDomain: text('android_app_link_domain'),
    iosUniversalLinkDomain: text('ios_universal_link_domain'),
    deepLinkFormat: text('deep_link_format'),
    webFallbackUrl: text('web_fallback_url'),
    appStoreUrl: text('app_store_url'),
    playStoreUrl: text('play_store_url'),
    configuration: jsonb('configuration').$type<AppConfigurationJson>().notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_supported_apps_type').on(table.appType)]
);

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    campaignName: text('campaign_name').notNull(),
    description: text('description'),
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    startDate: timestamp('start_date', { withTimezone: true }),
    endDate: timestamp('end_date', { withTimezone: true }),
    status: text('status').$type<CampaignStatus>().notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_campaigns_user_id').on(table.userId)]
);

export const smartLinks = pgTable(
  'smart_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    appId: uuid('app_id').references(() => supportedApps.id, { onDelete: 'set null' }),
    linkName: text('link_name').notNull(),
    shortCode: text('short_code').notNull().unique(),
    originalUrl: text('original_url').notNull(),
    normalizedUrl: text('normalized_url').notNull(),
    destinationType: text('destination_type').notNull(),
    destinationConfig: jsonb('destination_config').$type<DestinationConfigJson>().notNull(),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    status: text('status').$type<LinkStatus>().notNull().default('active'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    totalClicks: integer('total_clicks').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_smart_links_short_code').on(table.shortCode),
    index('idx_smart_links_user_id').on(table.userId),
    index('idx_smart_links_campaign_id').on(table.campaignId),
    index('idx_smart_links_destination_type').on(table.destinationType),
  ]
);

export const linkAnalytics = pgTable(
  'link_analytics',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    smartLinkId: uuid('smart_link_id')
      .notNull()
      .references(() => smartLinks.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    deviceCategory: text('device_category').notNull(),
    browser: text('browser').notNull(),
    referralSource: text('referral_source').notNull(),
    redirectOutcome: text('redirect_outcome').notNull(),
    dedupHash: text('dedup_hash'),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    clickedAt: timestamp('clicked_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_link_analytics_smart_link_id').on(table.smartLinkId),
    index('idx_link_analytics_campaign_id').on(table.campaignId),
    index('idx_link_analytics_clicked_at').on(table.clickedAt),
  ]
);

export const applicationSettings = pgTable('application_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  settingKey: text('setting_key').notNull().unique(),
  settingValue: jsonb('setting_value').$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const profilesRelations = relations(profiles, ({ many }) => ({
  smartLinks: many(smartLinks),
  campaigns: many(campaigns),
}));

export const supportedAppsRelations = relations(supportedApps, ({ many }) => ({
  smartLinks: many(smartLinks),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  owner: one(profiles, {
    fields: [campaigns.userId],
    references: [profiles.id],
  }),
  smartLinks: many(smartLinks),
  analytics: many(linkAnalytics),
}));

export const smartLinksRelations = relations(smartLinks, ({ one, many }) => ({
  owner: one(profiles, {
    fields: [smartLinks.userId],
    references: [profiles.id],
  }),
  app: one(supportedApps, {
    fields: [smartLinks.appId],
    references: [supportedApps.id],
  }),
  campaign: one(campaigns, {
    fields: [smartLinks.campaignId],
    references: [campaigns.id],
  }),
  analytics: many(linkAnalytics),
}));

export const linkAnalyticsRelations = relations(linkAnalytics, ({ one }) => ({
  smartLink: one(smartLinks, {
    fields: [linkAnalytics.smartLinkId],
    references: [smartLinks.id],
  }),
  campaign: one(campaigns, {
    fields: [linkAnalytics.campaignId],
    references: [campaigns.id],
  }),
}));
