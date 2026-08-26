import { pgTable, text, varchar, serial, integer, bigint, bigserial, boolean, timestamp, jsonb, pgEnum, numeric, unique, uniqueIndex, index, date, real, foreignKey, uuid, vector } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import type { CalendarAdvancedSettings } from "./types/calendar-types";
import { LEGACY_NODE_TYPE_MAPPINGS, NodeType } from "./types/node-types";
import {
  CONTACT_APPOINTMENT_STATUSES,
  DENTAL_BOOKING_SOURCES,
  DEFAULT_DENTAL_BOOKING_SOURCE,
} from "./types/dental-booking-types";
import {
  CONTEXT_TEMPLATE,
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_RAG_CONFIG,
} from "./rag-defaults";

export const userRoleEnum = pgEnum('user_role', ['super_admin', 'admin', 'agent']);
export const userPermissionModeEnum = pgEnum('user_permission_mode', ['inherit', 'custom']);

// Shared payment method enum used by paymentTransactions and invoicePayments
export const paymentMethodEnum = pgEnum('payment_method', [
  'cash',
  'check',
  'credit_card',
  'debit_card',
  'bank_transfer',
  'stripe',
  'paypal',
  'mercadopago',
  'moyasar',
  'mpesa',
  'paystack',
  'other'
]);

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  subdomain: text("subdomain").unique(),
  logo: text("logo"),
  primaryColor: text("primary_color").default("#333235"),
  active: boolean("active").default(true),
  plan: text("plan").default("free"),
  planId: integer("plan_id").references(() => plans.id),
  subscriptionStatus: text("subscription_status", {
    enum: ['active', 'inactive', 'pending', 'cancelled', 'overdue', 'trial', 'grace_period', 'paused', 'past_due']
  }).default("inactive"),
  subscriptionStartDate: timestamp("subscription_start_date"),
  subscriptionEndDate: timestamp("subscription_end_date"),
  trialStartDate: timestamp("trial_start_date"),
  trialEndDate: timestamp("trial_end_date"),
  isInTrial: boolean("is_in_trial").default(false),
  maxUsers: integer("max_users").default(5),


  registerNumber: text("register_number"),
  companyEmail: text("company_email"),
  contactPerson: text("contact_person"),
  iban: text("iban"),
  whatsappNumber: text("whatsapp_number"),

  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  billingCycleAnchor: timestamp("billing_cycle_anchor"),
  gracePeriodEnd: timestamp("grace_period_end"),
  pauseStartDate: timestamp("pause_start_date"),
  pauseEndDate: timestamp("pause_end_date"),
  autoRenewal: boolean("auto_renewal").default(true),
  dunningAttempts: integer("dunning_attempts").default(0),
  lastDunningAttempt: timestamp("last_dunning_attempt"),
  subscriptionMetadata: jsonb("subscription_metadata").default('{}'),


  currentStorageUsed: integer("current_storage_used").notNull().default(0), // in MB
  currentBandwidthUsed: bigint("current_bandwidth_used", { mode: "number" }).notNull().default(0), // monthly bandwidth used in bytes
  filesCount: integer("files_count").notNull().default(0), // current number of files
  lastUsageUpdate: timestamp("last_usage_update").notNull().defaultNow(),

  /** Monotonic ordering guard for Stripe/billing state transitions (webhook `created` / event time). */
  lastProcessedBillingEventAt: timestamp("last_processed_billing_event_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const insertCompanySchema = createInsertSchema(companies).pick({
  name: true,
  slug: true,
  logo: true,
  primaryColor: true,
  active: true,
  plan: true,
  planId: true,
  subscriptionStatus: true,
  subscriptionStartDate: true,
  subscriptionEndDate: true,
  trialStartDate: true,
  trialEndDate: true,
  isInTrial: true,
  maxUsers: true,
  registerNumber: true,
  companyEmail: true,
  contactPerson: true,
  iban: true,
  whatsappNumber: true,
  stripeCustomerId: true,
  stripeSubscriptionId: true,
  billingCycleAnchor: true,
  gracePeriodEnd: true,
  pauseStartDate: true,
  pauseEndDate: true,
  autoRenewal: true,
  dunningAttempts: true,
  lastDunningAttempt: true,
  subscriptionMetadata: true,

  currentStorageUsed: true,
  currentBandwidthUsed: true,
  filesCount: true,
  lastUsageUpdate: true,
  lastProcessedBillingEventAt: true
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  avatarUrl: text("avatar_url"),
  role: userRoleEnum("role").default("agent"),
  companyId: integer("company_id").references(() => companies.id),
  isSuperAdmin: boolean("is_super_admin").default(false),
  active: boolean("active").default(true),
  languagePreference: text("language_preference").default("en"),
  permissions: jsonb("permissions").default('{}'),
  permissionMode: userPermissionModeEnum("permission_mode").notNull().default("inherit"),
  customPermissions: jsonb("custom_permissions").notNull().default('{}'),
  /** When set, member is agent-tier and inherits (or seeds) from this company custom role. */
  customRoleId: integer("custom_role_id").references(() => companyCustomRoles.id, { onDelete: 'restrict' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  whatsappNumber: text("whatsapp_number")
}, (table) => [
  unique("idx_users_id_company").on(table.id, table.companyId),
]);

export const rolePermissions = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  role: userRoleEnum("role").notNull(),
  permissions: jsonb("permissions").notNull().default('{}'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

/** Company-defined roles (agent-tier). Built-in admin/agent stay in user_role enum. */
export const companyCustomRoles = pgTable("company_custom_roles", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: 'cascade' }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  permissions: jsonb("permissions").notNull().default('{}'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueCompanyCustomRoleName: unique("company_custom_roles_company_name_unique").on(table.companyId, table.name),
}));

export const companyPages = pgTable("company_pages", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  title: varchar("title", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull(),
  content: text("content").notNull(),
  metaTitle: varchar("meta_title", { length: 255 }),
  metaDescription: text("meta_description"),
  metaKeywords: text("meta_keywords"),
  isPublished: boolean("is_published").default(true),
  isFeatured: boolean("is_featured").default(false),
  template: varchar("template", { length: 100 }).default('default'),
  customCss: text("custom_css"),
  customJs: text("custom_js"),
  authorId: integer("author_id").references(() => users.id),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
}, (table) => ({
  uniqueCompanyPageSlug: unique("unique_company_page_slug").on(table.companyId, table.slug)
}));

export const mediaFileOwnership = pgTable("media_file_ownership", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  publicUrl: text("public_url").notNull().unique(),
  bucket: text("bucket").notNull(),
  fileSize: bigint("file_size", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  fullName: true,
  email: true,
  avatarUrl: true,
  role: true,
  companyId: true,
  isSuperAdmin: true,
  active: true,
  languagePreference: true,
  permissions: true,
  permissionMode: true,
  customPermissions: true,
  customRoleId: true,
  whatsappNumber: true
});

export const insertRolePermissionSchema = createInsertSchema(rolePermissions).pick({
  companyId: true,
  role: true,
  permissions: true
});

export const insertCompanyCustomRoleSchema = createInsertSchema(companyCustomRoles).pick({
  companyId: true,
  name: true,
  description: true,
  permissions: true
});

export const insertCompanyPageSchema = createInsertSchema(companyPages).pick({
  companyId: true,
  title: true,
  slug: true,
  content: true,
  metaTitle: true,
  metaDescription: true,
  metaKeywords: true,
  isPublished: true,
  isFeatured: true,
  template: true,
  customCss: true,
  customJs: true,
  authorId: true
});

export const PERMISSIONS = {
  VIEW_ALL_CONVERSATIONS: 'view_all_conversations',
  VIEW_ASSIGNED_CONVERSATIONS: 'view_assigned_conversations',
  ASSIGN_CONVERSATIONS: 'assign_conversations',
  MANAGE_CONVERSATIONS: 'manage_conversations',

  VIEW_CONTACTS: 'view_contacts',
  VIEW_OWN_CONTACTS: 'view_own_contacts',
  VIEW_ASSIGNED_CONTACTS: 'view_assigned_contacts',
  VIEW_COMPANY_CONTACTS: 'view_company_contacts',
  MANAGE_CONTACTS: 'manage_contacts',
  VIEW_CONTACT_PHONE: 'view_contact_phone',
  CREATE_CONTACTS: 'create_contacts',
  DELETE_CONTACTS: 'delete_contacts',

  VIEW_CHANNELS: 'view_channels',
  MANAGE_CHANNELS: 'manage_channels',

  VIEW_FLOWS: 'view_flows',
  MANAGE_FLOWS: 'manage_flows',

  VIEW_ANALYTICS: 'view_analytics',
  VIEW_DETAILED_ANALYTICS: 'view_detailed_analytics',

  VIEW_TEAM: 'view_team',
  MANAGE_TEAM: 'manage_team',

  VIEW_SETTINGS: 'view_settings',
  MANAGE_SETTINGS: 'manage_settings',

  VIEW_PIPELINE: 'view_pipeline',
  MANAGE_PIPELINE: 'manage_pipeline',
  VIEW_OWN_PIPELINES: 'view_own_pipelines',
  CREATE_DEALS: 'create_deals',
  DELETE_DEALS: 'delete_deals',
  EDIT_DEALS: 'edit_deals',
  MANAGE_PIPELINE_STAGES: 'manage_pipeline_stages',

  VIEW_CALENDAR: 'view_calendar',
  MANAGE_CALENDAR: 'manage_calendar',

  VIEW_CAMPAIGNS: 'view_campaigns',
  CREATE_CAMPAIGNS: 'create_campaigns',
  EDIT_CAMPAIGNS: 'edit_campaigns',
  DELETE_CAMPAIGNS: 'delete_campaigns',
  MANAGE_TEMPLATES: 'manage_templates',
  MANAGE_SEGMENTS: 'manage_segments',
  VIEW_CAMPAIGN_ANALYTICS: 'view_campaign_analytics',
  MANAGE_WHATSAPP_ACCOUNTS: 'manage_whatsapp_accounts',
  CONFIGURE_CHANNELS: 'configure_channels',

  VIEW_PAGES: 'view_pages',
  MANAGE_PAGES: 'manage_pages',

  VIEW_TASKS: 'view_tasks',
  MANAGE_TASKS: 'manage_tasks',

  CREATE_BACKUPS: 'create_backups',
  RESTORE_BACKUPS: 'restore_backups',
  MANAGE_BACKUPS: 'manage_backups',

  VIEW_CALL_LOGS: 'view_call_logs',
  MANAGE_CALL_LOGS: 'manage_call_logs',
  EXPORT_CALL_LOGS: 'export_call_logs',
  DELETE_CALL_LOGS: 'delete_call_logs',

  VIEW_REPORTS: 'view_reports',
  EXPORT_REPORTS: 'export_reports',
  VIEW_AGENT_REPORTS: 'view_agent_reports',
  VIEW_RESPONSE_TIME_REPORTS: 'view_response_time_reports',
  VIEW_CAPTURED_DATA: 'view_captured_data',
  MANAGE_CAPTURED_DATA: 'manage_captured_data',

  // ERP Permissions
  VIEW_ERP: 'view_erp',
  VIEW_PRODUCTS: 'view_products',
  MANAGE_PRODUCTS: 'manage_products',
  VIEW_INVENTORY: 'view_inventory',
  MANAGE_INVENTORY: 'manage_inventory',
  VIEW_SALES_ORDERS: 'view_sales_orders',
  MANAGE_SALES_ORDERS: 'manage_sales_orders',
  DELETE_SALES_ORDERS: 'delete_sales_orders',
  CREATE_QUOTATIONS: 'create_quotations',

  VIEW_SUPPLIERS: 'view_suppliers',
  MANAGE_SUPPLIERS: 'manage_suppliers',
  VIEW_PURCHASE_ORDERS: 'view_purchase_orders',
  MANAGE_PURCHASE_ORDERS: 'manage_purchase_orders',

  VIEW_INVOICES: 'view_invoices',
  MANAGE_INVOICES: 'manage_invoices',
  RECORD_PAYMENTS: 'record_payments',

  VIEW_ACCOUNTING: 'view_accounting',
  MANAGE_ACCOUNTING: 'manage_accounting',
  POST_JOURNAL_ENTRIES: 'post_journal_entries',
  CLOSE_FISCAL_YEAR: 'close_fiscal_year',

  VIEW_HR: 'view_hr',
  MANAGE_HR: 'manage_hr',
  VIEW_PAYROLL: 'view_payroll',
  MANAGE_PAYROLL: 'manage_payroll',
  APPROVE_LEAVE: 'approve_leave',

  VIEW_ERP_SETTINGS: 'view_erp_settings',
  MANAGE_ERP_SETTINGS: 'manage_erp_settings',

  VIEW_ERP_DASHBOARD: 'view_erp_dashboard',
  VIEW_ERP_REPORTS: 'view_erp_reports',

  // Dental clinical permissions (billing/inventory reuse existing ERP perms)
  VIEW_DENTAL_PATIENTS: 'view_dental_patients',
  MANAGE_DENTAL_PATIENTS: 'manage_dental_patients',
  VIEW_DENTAL_SCHEDULE: 'view_dental_schedule',
  MANAGE_DENTAL_SCHEDULE: 'manage_dental_schedule',
  VIEW_DENTAL_CHART: 'view_dental_chart',
  EDIT_DENTAL_CHART: 'edit_dental_chart',
  VIEW_DENTAL_IMAGING: 'view_dental_imaging',
  MANAGE_DENTAL_IMAGING: 'manage_dental_imaging',
  VIEW_DENTAL_TREATMENT_PLANS: 'view_dental_treatment_plans',
  MANAGE_DENTAL_TREATMENT_PLANS: 'manage_dental_treatment_plans',
  MANAGE_DENTAL_PRESCRIPTIONS: 'manage_dental_prescriptions',
  USE_DENTAL_AI: 'use_dental_ai',
} as const;

export const DEFAULT_ROLE_PERMISSIONS = {
  admin: {
    [PERMISSIONS.VIEW_ALL_CONVERSATIONS]: true,
    [PERMISSIONS.VIEW_ASSIGNED_CONVERSATIONS]: true,
    [PERMISSIONS.ASSIGN_CONVERSATIONS]: true,
    [PERMISSIONS.MANAGE_CONVERSATIONS]: true,
    [PERMISSIONS.VIEW_CONTACTS]: true,
    [PERMISSIONS.VIEW_OWN_CONTACTS]: true,
    [PERMISSIONS.VIEW_ASSIGNED_CONTACTS]: true,
    [PERMISSIONS.VIEW_COMPANY_CONTACTS]: true,
    [PERMISSIONS.MANAGE_CONTACTS]: true,
    [PERMISSIONS.VIEW_CONTACT_PHONE]: true,
    [PERMISSIONS.CREATE_CONTACTS]: true,
    [PERMISSIONS.DELETE_CONTACTS]: true,
    [PERMISSIONS.VIEW_CHANNELS]: true,
    [PERMISSIONS.MANAGE_CHANNELS]: true,
    [PERMISSIONS.VIEW_FLOWS]: true,
    [PERMISSIONS.MANAGE_FLOWS]: true,
    [PERMISSIONS.VIEW_ANALYTICS]: true,
    [PERMISSIONS.VIEW_DETAILED_ANALYTICS]: true,
    [PERMISSIONS.VIEW_TEAM]: true,
    [PERMISSIONS.MANAGE_TEAM]: true,
    [PERMISSIONS.VIEW_SETTINGS]: true,
    [PERMISSIONS.MANAGE_SETTINGS]: true,
    [PERMISSIONS.VIEW_PIPELINE]: true,
    [PERMISSIONS.MANAGE_PIPELINE]: true,
    [PERMISSIONS.VIEW_OWN_PIPELINES]: true,
    [PERMISSIONS.CREATE_DEALS]: true,
    [PERMISSIONS.DELETE_DEALS]: true,
    [PERMISSIONS.VIEW_CALENDAR]: true,
    [PERMISSIONS.MANAGE_CALENDAR]: true,
    [PERMISSIONS.VIEW_CAMPAIGNS]: true,
    [PERMISSIONS.CREATE_CAMPAIGNS]: true,
    [PERMISSIONS.EDIT_CAMPAIGNS]: true,
    [PERMISSIONS.DELETE_CAMPAIGNS]: true,
    [PERMISSIONS.MANAGE_TEMPLATES]: true,
    [PERMISSIONS.MANAGE_SEGMENTS]: true,
    [PERMISSIONS.VIEW_CAMPAIGN_ANALYTICS]: true,
    [PERMISSIONS.MANAGE_WHATSAPP_ACCOUNTS]: true,
    [PERMISSIONS.CONFIGURE_CHANNELS]: true,
    [PERMISSIONS.VIEW_PAGES]: true,
    [PERMISSIONS.MANAGE_PAGES]: true,
    [PERMISSIONS.VIEW_TASKS]: true,
    [PERMISSIONS.MANAGE_TASKS]: true,
    [PERMISSIONS.CREATE_BACKUPS]: true,
    [PERMISSIONS.RESTORE_BACKUPS]: true,
    [PERMISSIONS.MANAGE_BACKUPS]: true,
    [PERMISSIONS.VIEW_CALL_LOGS]: true,
    [PERMISSIONS.MANAGE_CALL_LOGS]: true,
    [PERMISSIONS.EXPORT_CALL_LOGS]: true,
    [PERMISSIONS.DELETE_CALL_LOGS]: true,
    [PERMISSIONS.VIEW_REPORTS]: true,
    [PERMISSIONS.EXPORT_REPORTS]: true,
    [PERMISSIONS.VIEW_AGENT_REPORTS]: true,
    [PERMISSIONS.VIEW_RESPONSE_TIME_REPORTS]: true,
    [PERMISSIONS.VIEW_CAPTURED_DATA]: true,
    [PERMISSIONS.MANAGE_CAPTURED_DATA]: true,
    [PERMISSIONS.VIEW_ERP]: true,
    [PERMISSIONS.VIEW_PRODUCTS]: true,
    [PERMISSIONS.MANAGE_PRODUCTS]: true,
    [PERMISSIONS.VIEW_INVENTORY]: true,
    [PERMISSIONS.MANAGE_INVENTORY]: true,
    [PERMISSIONS.VIEW_SALES_ORDERS]: true,
    [PERMISSIONS.MANAGE_SALES_ORDERS]: true,
    [PERMISSIONS.DELETE_SALES_ORDERS]: true,
    [PERMISSIONS.CREATE_QUOTATIONS]: true,
    [PERMISSIONS.VIEW_SUPPLIERS]: true,
    [PERMISSIONS.MANAGE_SUPPLIERS]: true,
    [PERMISSIONS.VIEW_PURCHASE_ORDERS]: true,
    [PERMISSIONS.MANAGE_PURCHASE_ORDERS]: true,
    [PERMISSIONS.VIEW_INVOICES]: true,
    [PERMISSIONS.MANAGE_INVOICES]: true,
    [PERMISSIONS.RECORD_PAYMENTS]: true,
    [PERMISSIONS.VIEW_ACCOUNTING]: true,
    [PERMISSIONS.MANAGE_ACCOUNTING]: true,
    [PERMISSIONS.POST_JOURNAL_ENTRIES]: true,
    [PERMISSIONS.CLOSE_FISCAL_YEAR]: true,
    [PERMISSIONS.VIEW_HR]: true,
    [PERMISSIONS.MANAGE_HR]: true,
    [PERMISSIONS.VIEW_PAYROLL]: true,
    [PERMISSIONS.MANAGE_PAYROLL]: true,
    [PERMISSIONS.APPROVE_LEAVE]: true,
    [PERMISSIONS.VIEW_ERP_SETTINGS]: true,
    [PERMISSIONS.MANAGE_ERP_SETTINGS]: true,
    [PERMISSIONS.VIEW_ERP_DASHBOARD]: true,
    [PERMISSIONS.VIEW_ERP_REPORTS]: true,
    [PERMISSIONS.VIEW_DENTAL_PATIENTS]: true,
    [PERMISSIONS.MANAGE_DENTAL_PATIENTS]: true,
    [PERMISSIONS.VIEW_DENTAL_SCHEDULE]: true,
    [PERMISSIONS.MANAGE_DENTAL_SCHEDULE]: true,
    [PERMISSIONS.VIEW_DENTAL_CHART]: true,
    [PERMISSIONS.EDIT_DENTAL_CHART]: true,
    [PERMISSIONS.VIEW_DENTAL_IMAGING]: true,
    [PERMISSIONS.MANAGE_DENTAL_IMAGING]: true,
    [PERMISSIONS.VIEW_DENTAL_TREATMENT_PLANS]: true,
    [PERMISSIONS.MANAGE_DENTAL_TREATMENT_PLANS]: true,
    [PERMISSIONS.MANAGE_DENTAL_PRESCRIPTIONS]: true,
    [PERMISSIONS.USE_DENTAL_AI]: true,
  },
  agent: {
    [PERMISSIONS.VIEW_ALL_CONVERSATIONS]: false,
    [PERMISSIONS.VIEW_ASSIGNED_CONVERSATIONS]: true,
    [PERMISSIONS.ASSIGN_CONVERSATIONS]: false,
    [PERMISSIONS.MANAGE_CONVERSATIONS]: true,
    [PERMISSIONS.VIEW_CONTACTS]: true,
    [PERMISSIONS.VIEW_OWN_CONTACTS]: true,
    [PERMISSIONS.VIEW_ASSIGNED_CONTACTS]: true,
    [PERMISSIONS.VIEW_COMPANY_CONTACTS]: false,
    [PERMISSIONS.MANAGE_CONTACTS]: false,
    [PERMISSIONS.VIEW_CONTACT_PHONE]: false,
    [PERMISSIONS.CREATE_CONTACTS]: true,
    [PERMISSIONS.DELETE_CONTACTS]: false,
    [PERMISSIONS.VIEW_CHANNELS]: false,
    [PERMISSIONS.MANAGE_CHANNELS]: false,
    [PERMISSIONS.VIEW_FLOWS]: false,
    [PERMISSIONS.MANAGE_FLOWS]: false,
    [PERMISSIONS.VIEW_ANALYTICS]: false,
    [PERMISSIONS.VIEW_DETAILED_ANALYTICS]: false,
    [PERMISSIONS.VIEW_TEAM]: false,
    [PERMISSIONS.MANAGE_TEAM]: false,
    [PERMISSIONS.VIEW_SETTINGS]: false,
    [PERMISSIONS.MANAGE_SETTINGS]: false,
    [PERMISSIONS.VIEW_PIPELINE]: false,
    [PERMISSIONS.MANAGE_PIPELINE]: false,
    [PERMISSIONS.VIEW_OWN_PIPELINES]: true,
    [PERMISSIONS.CREATE_DEALS]: true,
    [PERMISSIONS.DELETE_DEALS]: false,
    [PERMISSIONS.VIEW_CALENDAR]: true,
    [PERMISSIONS.MANAGE_CALENDAR]: false,
    [PERMISSIONS.VIEW_CAMPAIGNS]: true,
    [PERMISSIONS.CREATE_CAMPAIGNS]: false,
    [PERMISSIONS.EDIT_CAMPAIGNS]: false,
    [PERMISSIONS.DELETE_CAMPAIGNS]: false,
    [PERMISSIONS.MANAGE_TEMPLATES]: false,
    [PERMISSIONS.MANAGE_SEGMENTS]: false,
    [PERMISSIONS.VIEW_CAMPAIGN_ANALYTICS]: true,
    [PERMISSIONS.MANAGE_WHATSAPP_ACCOUNTS]: false,
    [PERMISSIONS.CONFIGURE_CHANNELS]: false,
    [PERMISSIONS.VIEW_PAGES]: false,
    [PERMISSIONS.MANAGE_PAGES]: false,
    [PERMISSIONS.VIEW_TASKS]: true,
    [PERMISSIONS.MANAGE_TASKS]: false,
    [PERMISSIONS.CREATE_BACKUPS]: false,
    [PERMISSIONS.RESTORE_BACKUPS]: false,
    [PERMISSIONS.MANAGE_BACKUPS]: false,
    [PERMISSIONS.VIEW_CALL_LOGS]: true,
    [PERMISSIONS.MANAGE_CALL_LOGS]: false,
    [PERMISSIONS.EXPORT_CALL_LOGS]: false,
    [PERMISSIONS.DELETE_CALL_LOGS]: false,
    [PERMISSIONS.VIEW_REPORTS]: false,
    [PERMISSIONS.EXPORT_REPORTS]: false,
    [PERMISSIONS.VIEW_AGENT_REPORTS]: false,
    [PERMISSIONS.VIEW_RESPONSE_TIME_REPORTS]: false,
    [PERMISSIONS.VIEW_CAPTURED_DATA]: false,
    [PERMISSIONS.MANAGE_CAPTURED_DATA]: false,
    [PERMISSIONS.VIEW_ERP]: false,
    [PERMISSIONS.VIEW_PRODUCTS]: false,
    [PERMISSIONS.MANAGE_PRODUCTS]: false,
    [PERMISSIONS.VIEW_INVENTORY]: false,
    [PERMISSIONS.MANAGE_INVENTORY]: false,
    [PERMISSIONS.VIEW_SALES_ORDERS]: false,
    [PERMISSIONS.MANAGE_SALES_ORDERS]: false,
    [PERMISSIONS.DELETE_SALES_ORDERS]: false,
    [PERMISSIONS.CREATE_QUOTATIONS]: false,
    [PERMISSIONS.VIEW_SUPPLIERS]: false,
    [PERMISSIONS.MANAGE_SUPPLIERS]: false,
    [PERMISSIONS.VIEW_PURCHASE_ORDERS]: false,
    [PERMISSIONS.MANAGE_PURCHASE_ORDERS]: false,
    [PERMISSIONS.VIEW_INVOICES]: false,
    [PERMISSIONS.MANAGE_INVOICES]: false,
    [PERMISSIONS.RECORD_PAYMENTS]: false,
    [PERMISSIONS.VIEW_ACCOUNTING]: false,
    [PERMISSIONS.MANAGE_ACCOUNTING]: false,
    [PERMISSIONS.POST_JOURNAL_ENTRIES]: false,
    [PERMISSIONS.CLOSE_FISCAL_YEAR]: false,
    [PERMISSIONS.VIEW_HR]: false,
    [PERMISSIONS.MANAGE_HR]: false,
    [PERMISSIONS.VIEW_PAYROLL]: false,
    [PERMISSIONS.MANAGE_PAYROLL]: false,
    [PERMISSIONS.APPROVE_LEAVE]: false,
    [PERMISSIONS.VIEW_ERP_SETTINGS]: false,
    [PERMISSIONS.MANAGE_ERP_SETTINGS]: false,
    [PERMISSIONS.VIEW_ERP_DASHBOARD]: false,
    [PERMISSIONS.VIEW_ERP_REPORTS]: false,
    [PERMISSIONS.VIEW_DENTAL_PATIENTS]: false,
    [PERMISSIONS.MANAGE_DENTAL_PATIENTS]: false,
    [PERMISSIONS.VIEW_DENTAL_SCHEDULE]: false,
    [PERMISSIONS.MANAGE_DENTAL_SCHEDULE]: false,
    [PERMISSIONS.VIEW_DENTAL_CHART]: false,
    [PERMISSIONS.EDIT_DENTAL_CHART]: false,
    [PERMISSIONS.VIEW_DENTAL_IMAGING]: false,
    [PERMISSIONS.MANAGE_DENTAL_IMAGING]: false,
    [PERMISSIONS.VIEW_DENTAL_TREATMENT_PLANS]: false,
    [PERMISSIONS.MANAGE_DENTAL_TREATMENT_PLANS]: false,
    [PERMISSIONS.MANAGE_DENTAL_PRESCRIPTIONS]: false,
    [PERMISSIONS.USE_DENTAL_AI]: false,
  }
};

export const USER_PERMISSION_MODES = {
  INHERIT: 'inherit',
  CUSTOM: 'custom',
} as const;

/** Admin capabilities always enforced for company admins with custom permission snapshots. */
export const RESERVED_ADMIN_PERMISSIONS = [
  PERMISSIONS.VIEW_TEAM,
  PERMISSIONS.MANAGE_TEAM,
  PERMISSIONS.VIEW_SETTINGS,
  PERMISSIONS.MANAGE_SETTINGS,
] as const;

export const channelTypes = z.enum([
  "whatsapp_official",
  "whatsapp_unofficial",
  "messenger",
  "instagram",
  "email",
  "telegram",
  "tiktok",
  "webchat",
  "twilio_sms",
  "twilio_voice"
]);

export const whatsappProxyServers = pgTable("whatsapp_proxy_servers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  type: text("type", { enum: ['http', 'https', 'socks5'] }).notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull(),
  username: text("username"),
  password: text("password"),
  testStatus: text("test_status", { enum: ['untested', 'working', 'failed'] }).default('untested'),
  lastTested: timestamp("last_tested"),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const channelConnections = pgTable("channel_connections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  companyId: integer("company_id").references(() => companies.id),
  channelType: text("channel_type").notNull(),
  accountId: text("account_id").notNull(),
  accountName: text("account_name").notNull(),
  accessToken: text("access_token"),
  status: text("status").default("active"),
  connectionData: jsonb("connection_data"),
  historySyncEnabled: boolean("history_sync_enabled").default(false),
  historySyncStatus: text("history_sync_status", {
    enum: ['pending', 'syncing', 'completed', 'failed', 'disabled']
  }).default("pending"),
  historySyncProgress: integer("history_sync_progress").default(0),
  historySyncTotal: integer("history_sync_total").default(0),
  lastHistorySyncAt: timestamp("last_history_sync_at"),
  historySyncError: text("history_sync_error"),
  proxyServerId: integer("proxy_server_id").references(() => whatsappProxyServers.id, { onDelete: 'set null' }),
  proxyEnabled: boolean("proxy_enabled").default(false),
  proxyType: text("proxy_type", { enum: ['http', 'https', 'socks5'] }),
  proxyHost: text("proxy_host"),
  proxyPort: integer("proxy_port"),
  proxyUsername: text("proxy_username"),
  proxyPassword: text("proxy_password"),
  proxyTestStatus: text("proxy_test_status", { enum: ['untested', 'working', 'failed'] }).default('untested'),
  proxyLastTested: timestamp("proxy_last_tested"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const whatsappAuthState = pgTable(
  "whatsapp_auth_state",
  {
    id: serial("id").primaryKey(),
    connectionId: integer("connection_id").notNull().references(() => channelConnections.id, { onDelete: "cascade" }),
    keyType: text("key_type").notNull(),
    keyId: text("key_id").notNull(),
    data: jsonb("data").notNull(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [unique("idx_whatsapp_auth_state_lookup").on(table.connectionId, table.keyType, table.keyId)]
);

export type WhatsappAuthState = typeof whatsappAuthState.$inferSelect;
export type InsertWhatsappAuthState = typeof whatsappAuthState.$inferInsert;

export const partnerConfigurations = pgTable("partner_configurations", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  partnerApiKey: text("partner_api_key").notNull(),
  partnerId: text("partner_id").notNull(),
  partnerSecret: text("partner_secret"),
  webhookVerifyToken: text("webhook_verify_token"),
  accessToken: text("access_token"),
  configId: text("config_id"),
  instagramConfigId: text("instagram_config_id"),
  messengerConfigId: text("messenger_config_id"),
  metaChannelsConfigId: text("meta_channels_config_id"),
  instagramWebhookUrl: text("instagram_webhook_url"),
  messengerWebhookUrl: text("messenger_webhook_url"),
  partnerWebhookUrl: text("partner_webhook_url"),
  redirectUrl: text("redirect_url"),
  publicProfile: jsonb("public_profile"),
  isActive: boolean("is_active").notNull().default(true),
  webhookSubscriptionStatus: text("webhook_subscription_status"),
  lastValidatedAt: timestamp("last_validated_at"),
  validationStatus: text("validation_status"),
  usageCount: integer("usage_count").default(0),
  lastUsedAt: timestamp("last_used_at"),
  apiVersion: text("api_version"),
  webhookFieldSubscriptions: jsonb("webhook_field_subscriptions"),
  healthCheckStatus: jsonb("health_check_status"),
  partnerName: text("partner_name"),
  apiBaseUrl: text("api_base_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});


export const metaWhatsappClients = pgTable("meta_whatsapp_clients", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  businessAccountId: text("business_account_id").notNull().unique(),
  businessAccountName: text("business_account_name"),
  status: text("status").notNull().default('active'),
  onboardedAt: timestamp("onboarded_at").defaultNow(),
  onboardingState: text("onboarding_state"),
  webhookConfiguredAt: timestamp("webhook_configured_at"),
  configurationErrors: jsonb("configuration_errors"),
  lastHealthCheckAt: timestamp("last_health_check_at"),
  healthCheckStatus: text("health_check_status"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const metaWhatsappPhoneNumbers = pgTable("meta_whatsapp_phone_numbers", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => metaWhatsappClients.id, { onDelete: 'cascade' }),
  phoneNumberId: text("phone_number_id").notNull().unique(),
  phoneNumber: text("phone_number").notNull(),
  displayName: text("display_name"),
  status: text("status").notNull().default('pending'),
  qualityRating: text("quality_rating"),
  messagingLimit: integer("messaging_limit"),
  accessToken: text("access_token"),
  webhookSubscriptionId: text("webhook_subscription_id"),
  lastWebhookReceivedAt: timestamp("last_webhook_received_at"),
  webhookErrorCount: integer("webhook_error_count").default(0),
  lastWebhookError: text("last_webhook_error"),
  throughputLimit: integer("throughput_limit"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const emailAttachments = pgTable("email_attachments", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => messages.id, { onDelete: 'cascade' }),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  contentId: text("content_id"),
  isInline: boolean("is_inline").default(false),
  filePath: text("file_path").notNull(),
  downloadUrl: text("download_url"),
  createdAt: timestamp("created_at").notNull().defaultNow()
});

export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  createdById: integer("created_by_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").default("general"),
  subject: text("subject").notNull(),
  htmlContent: text("html_content"),
  plainTextContent: text("plain_text_content"),
  variables: jsonb("variables").default([]),
  isActive: boolean("is_active").default(true),
  usageCount: integer("usage_count").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const emailSignatures = pgTable("email_signatures", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  companyId: integer("company_id").notNull().references(() => companies.id),
  name: text("name").notNull(),
  htmlContent: text("html_content"),
  plainTextContent: text("plain_text_content"),
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const emailConfigs = pgTable("email_configs", {
  id: serial("id").primaryKey(),
  channelConnectionId: integer("channel_connection_id").notNull().references(() => channelConnections.id, { onDelete: 'cascade' }),

  imapHost: text("imap_host").notNull(),
  imapPort: integer("imap_port").notNull().default(993),
  imapSecure: boolean("imap_secure").default(true),
  imapUsername: text("imap_username").notNull(),
  imapPassword: text("imap_password"),

  smtpHost: text("smtp_host").notNull(),
  smtpPort: integer("smtp_port").notNull().default(465),
  smtpSecure: boolean("smtp_secure").default(false),
  smtpUsername: text("smtp_username").notNull(),
  smtpPassword: text("smtp_password"),

  oauthProvider: text("oauth_provider"),
  oauthClientId: text("oauth_client_id"),
  oauthClientSecret: text("oauth_client_secret"),
  oauthRefreshToken: text("oauth_refresh_token"),
  oauthAccessToken: text("oauth_access_token"),
  oauthTokenExpiry: timestamp("oauth_token_expiry"),

  emailAddress: text("email_address").notNull(),
  displayName: text("display_name"),
  signature: text("signature"),
  syncFolder: text("sync_folder").default("INBOX"),
  syncFrequency: integer("sync_frequency").default(60),
  maxSyncMessages: integer("max_sync_messages").default(100),

  status: text("status").notNull().default("active"),
  lastSyncAt: timestamp("last_sync_at"),
  lastError: text("last_error"),
  connectionData: jsonb("connection_data"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  permissions: jsonb("permissions").default('["messages:send", "channels:read"]'),
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  rateLimitPerMinute: integer("rate_limit_per_minute").default(60),
  rateLimitPerHour: integer("rate_limit_per_hour").default(1000),
  rateLimitPerDay: integer("rate_limit_per_day").default(10000),
  allowedIps: jsonb("allowed_ips").default('[]'),
  webhookUrl: text("webhook_url"),
  webhookSecret: text("webhook_secret"),
  webhookEvents: jsonb("webhook_events").default('["message.sent", "message.delivered", "message.failed"]'),
  features: jsonb("features").default('{}'),
  metadata: jsonb("metadata").default('{}'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const apiUsage = pgTable("api_usage", {
  id: serial("id").primaryKey(),
  apiKeyId: integer("api_key_id").notNull().references(() => apiKeys.id, { onDelete: 'cascade' }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull(),
  statusCode: integer("status_code").notNull(),
  requestSize: integer("request_size"),
  responseSize: integer("response_size"),
  duration: integer("duration"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  requestId: text("request_id").unique(),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").default('{}'),
  createdAt: timestamp("created_at").defaultNow()
});

export const apiRateLimits = pgTable("api_rate_limits", {
  id: serial("id").primaryKey(),
  apiKeyId: integer("api_key_id").notNull().references(() => apiKeys.id, { onDelete: 'cascade' }),
  windowType: text("window_type").notNull(),
  windowStart: timestamp("window_start").notNull(),
  requestCount: integer("request_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
}, (table) => ({
  apiRateLimitsBucketUnique: unique().on(table.apiKeyId, table.windowType, table.windowStart)
}));

export const apiWebhooks = pgTable("api_webhooks", {
  id: serial("id").primaryKey(),
  apiKeyId: integer("api_key_id").notNull().references(() => apiKeys.id, { onDelete: 'cascade' }),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default('pending'),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  nextRetryAt: timestamp("next_retry_at"),
  responseStatus: integer("response_status"),
  responseBody: text("response_body"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const insertChannelConnectionSchema = createInsertSchema(channelConnections).pick({
  userId: true,
  companyId: true,
  channelType: true,
  accountId: true,
  accountName: true,
  accessToken: true,
  status: true,
  connectionData: true,
  historySyncEnabled: true,
  historySyncStatus: true,
  historySyncProgress: true,
  historySyncTotal: true,
  lastHistorySyncAt: true,
  historySyncError: true,
  proxyServerId: true,
  proxyEnabled: true,
  proxyType: true,
  proxyHost: true,
  proxyPort: true,
  proxyUsername: true,
  proxyPassword: true,
  proxyTestStatus: true,
  proxyLastTested: true
}).superRefine((data, ctx) => {

  if (data.proxyEnabled === true) {
    if (!data.proxyType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['proxyType'],
        message: 'Proxy type is required when proxy is enabled'
      });
    }
    if (!data.proxyHost) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['proxyHost'],
        message: 'Proxy host is required when proxy is enabled'
      });
    }
    if (!data.proxyPort) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['proxyPort'],
        message: 'Proxy port is required when proxy is enabled'
      });
    } else if (data.proxyPort < 1 || data.proxyPort > 65535) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['proxyPort'],
        message: 'Proxy port must be between 1 and 65535'
      });
    }
  }
});

export const insertPartnerConfigurationSchema = createInsertSchema(partnerConfigurations).pick({
  provider: true,
  partnerApiKey: true,
  partnerId: true,
  partnerSecret: true,
  webhookVerifyToken: true,
  accessToken: true,
  configId: true,
  instagramConfigId: true,
  messengerConfigId: true,
  metaChannelsConfigId: true,
  instagramWebhookUrl: true,
  messengerWebhookUrl: true,
  partnerWebhookUrl: true,
  redirectUrl: true,
  publicProfile: true,
  isActive: true,
  apiVersion: true
});

export const insertMetaWhatsappClientSchema = createInsertSchema(metaWhatsappClients).pick({
  companyId: true,
  businessAccountId: true,
  businessAccountName: true,
  status: true,
  onboardedAt: true
});

export const insertMetaWhatsappPhoneNumberSchema = createInsertSchema(metaWhatsappPhoneNumbers).pick({
  clientId: true,
  phoneNumberId: true,
  phoneNumber: true,
  displayName: true,
  status: true,
  qualityRating: true,
  messagingLimit: true,
  accessToken: true
});

export const insertEmailAttachmentSchema = createInsertSchema(emailAttachments).pick({
  messageId: true,
  filename: true,
  contentType: true,
  size: true,
  contentId: true,
  isInline: true,
  filePath: true,
  downloadUrl: true
});

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).pick({
  companyId: true,
  createdById: true,
  name: true,
  description: true,
  category: true,
  subject: true,
  htmlContent: true,
  plainTextContent: true,
  variables: true,
  isActive: true
});

export const insertEmailSignatureSchema = createInsertSchema(emailSignatures).pick({
  userId: true,
  companyId: true,
  name: true,
  htmlContent: true,
  plainTextContent: true,
  isDefault: true,
  isActive: true
});

export const insertEmailConfigSchema = createInsertSchema(emailConfigs).pick({
  channelConnectionId: true,
  imapHost: true,
  imapPort: true,
  imapSecure: true,
  imapUsername: true,
  imapPassword: true,
  smtpHost: true,
  smtpPort: true,
  smtpSecure: true,
  smtpUsername: true,
  smtpPassword: true,
  oauthProvider: true,
  oauthClientId: true,
  oauthClientSecret: true,
  oauthRefreshToken: true,
  oauthAccessToken: true,
  oauthTokenExpiry: true,
  emailAddress: true,
  displayName: true,
  signature: true,
  syncFolder: true,
  syncFrequency: true,
  maxSyncMessages: true,
  status: true,
  connectionData: true
});

export const insertApiKeySchema = createInsertSchema(apiKeys).pick({
  companyId: true,
  userId: true,
  name: true,
  keyHash: true,
  keyPrefix: true,
  permissions: true,
  isActive: true,
  expiresAt: true,
  rateLimitPerMinute: true,
  rateLimitPerHour: true,
  rateLimitPerDay: true,
  allowedIps: true,
  webhookUrl: true,
  metadata: true
});

export const insertApiUsageSchema = createInsertSchema(apiUsage).pick({
  apiKeyId: true,
  companyId: true,
  endpoint: true,
  method: true,
  statusCode: true,
  requestSize: true,
  responseSize: true,
  duration: true,
  ipAddress: true,
  userAgent: true,
  requestId: true,
  errorMessage: true,
  metadata: true
});

export const insertApiRateLimitSchema = createInsertSchema(apiRateLimits).pick({
  apiKeyId: true,
  windowType: true,
  windowStart: true,
  requestCount: true
});

export const insertApiWebhookSchema = createInsertSchema(apiWebhooks).pick({
  apiKeyId: true,
  eventType: true,
  payload: true,
  status: true,
  attemptCount: true,
  lastAttemptAt: true,
  nextRetryAt: true,
  responseStatus: true,
  responseBody: true,
  errorMessage: true
});

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  email: text("email"),
  phone: text("phone"),
  phoneDigits: text("phone_digits"),
  company: text("company"),
  tags: text("tags").array(),
  isActive: boolean("is_active").default(true),
  isArchived: boolean("is_archived").default(false),
  identifier: text("identifier"),
  identifierType: text("identifier_type"),
  source: text("source"),
  notes: text("notes"),
  customFields: jsonb("custom_fields").default('{}'),
  createdBy: integer("created_by").references(() => users.id),

  isHistorySync: boolean("is_history_sync").default(false),
  historySyncBatchId: text("history_sync_batch_id"),

  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
  deletionReason: text("deletion_reason"),
  deletionMetadata: jsonb("deletion_metadata"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const insertContactSchema = createInsertSchema(contacts).pick({
  companyId: true,
  name: true,
  avatarUrl: true,
  email: true,
  phone: true,
  company: true,
  tags: true,
  customFields: true,
  isActive: true,
  isArchived: true,
  identifier: true,
  identifierType: true,
  source: true,
  notes: true,
  createdBy: true,
  isHistorySync: true,
  historySyncBatchId: true,
  deletedAt: true,
  anonymizedAt: true,
  deletionReason: true,
  deletionMetadata: true
});

export const webchatSessions = pgTable("webchat_sessions", {
  sessionId: text("session_id").primaryKey(),
  connectionId: integer("connection_id").notNull().references(() => channelConnections.id, { onDelete: "cascade" }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  visitorName: text("visitor_name"),
  visitorEmail: text("visitor_email"),
  visitorPhone: text("visitor_phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow()
}, (table) => ({
  companyContactIdx: index("idx_webchat_sessions_company_contact").on(table.companyId, table.contactId),
  connectionIdx: index("idx_webchat_sessions_connection").on(table.connectionId)
}));

export const insertWebChatSessionSchema = createInsertSchema(webchatSessions).pick({
  sessionId: true,
  connectionId: true,
  companyId: true,
  contactId: true,
  visitorName: true,
  visitorEmail: true,
  visitorPhone: true
});

export const metaOnboardingSessions = pgTable("meta_onboarding_sessions", {
  sessionId: text("session_id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  encryptedUserAccessToken: text("encrypted_user_access_token").notNull(),
  discoveredAssetIds: jsonb("discovered_asset_ids").notNull().$type<string[]>().default([]),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  expiresAtIdx: index("idx_meta_onboarding_sessions_expires_at").on(table.expiresAt),
  userCompanyIdx: index("idx_meta_onboarding_sessions_user_company").on(table.userId, table.companyId),
}));

export const insertMetaOnboardingSessionSchema = createInsertSchema(metaOnboardingSessions).pick({
  sessionId: true,
  userId: true,
  companyId: true,
  channel: true,
  encryptedUserAccessToken: true,
  discoveredAssetIds: true,
  expiresAt: true,
});

export const userContactPins = pgTable("user_contact_pins", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
}, (table) => ({
  uniqueUserContact: unique("unique_user_contact_pin").on(table.userId, table.contactId)
}));

export const insertUserContactPinSchema = createInsertSchema(userContactPins).pick({
  userId: true,
  contactId: true,
  companyId: true
});

export type UserContactPin = typeof userContactPins.$inferSelect;
export type InsertUserContactPin = typeof userContactPins.$inferInsert;

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  contactId: integer("contact_id"),
  channelType: text("channel_type").notNull(),
  channelId: integer("channel_id").notNull(),
  status: text("status").default("open"),
  assignedToUserId: integer("assigned_to_user_id"),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  unreadCount: integer("unread_count").default(0),
  botDisabled: boolean("bot_disabled").default(false),
  disabledAt: timestamp("disabled_at"),
  disableDuration: integer("disable_duration"),
  disableReason: text("disable_reason"),

  isGroup: boolean("is_group").default(false),
  groupJid: text("group_jid"),
  groupName: text("group_name"),
  groupDescription: text("group_description"),
  groupParticipantCount: integer("group_participant_count").default(0),
  groupCreatedAt: timestamp("group_created_at"),
  groupMetadata: jsonb("group_metadata"),

  isHistorySync: boolean("is_history_sync").default(false),
  historySyncBatchId: text("history_sync_batch_id"),

  isStarred: boolean("is_starred").default(false),
  isArchived: boolean("is_archived").default(false),
  starredAt: timestamp("starred_at"),
  archivedAt: timestamp("archived_at"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const contactBotSuppressions = pgTable("contact_bot_suppressions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  suppressedUntil: timestamp("suppressed_until", { withTimezone: true }).notNull(),
  reason: text("reason"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  uniqueCompanyContactSuppression: unique("contact_bot_suppressions_company_contact_unique").on(table.companyId, table.contactId)
}));

export const insertContactBotSuppressionSchema = createInsertSchema(contactBotSuppressions).pick({
  companyId: true,
  contactId: true,
  suppressedUntil: true,
  reason: true,
  createdBy: true
});

export const userConversationPins = pgTable("user_conversation_pins", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
}, (table) => ({
  uniqueUserConversation: unique("unique_user_conversation_pin").on(table.userId, table.conversationId)
}));

export const insertUserConversationPinSchema = createInsertSchema(userConversationPins).pick({
  userId: true,
  conversationId: true,
  companyId: true
});

export type UserConversationPin = typeof userConversationPins.$inferSelect;
export type InsertUserConversationPin = typeof userConversationPins.$inferInsert;

export const insertConversationSchema = createInsertSchema(conversations).pick({
  companyId: true,
  contactId: true,
  channelType: true,
  channelId: true,
  status: true,
  assignedToUserId: true,
  lastMessageAt: true,
  unreadCount: true,
  botDisabled: true,
  disabledAt: true,
  disableDuration: true,
  disableReason: true,
  isGroup: true,
  groupJid: true,
  groupName: true,
  groupDescription: true,
  groupParticipantCount: true,
  groupCreatedAt: true,
  groupMetadata: true,
  isHistorySync: true,
  historySyncBatchId: true,
  isStarred: true,
  isArchived: true,
  starredAt: true,
  archivedAt: true
});

export const groupParticipants = pgTable("group_participants", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id),
  contactId: integer("contact_id").references(() => contacts.id),
  participantJid: text("participant_jid").notNull(),
  participantName: text("participant_name"),
  isAdmin: boolean("is_admin").default(false),
  isSuperAdmin: boolean("is_super_admin").default(false),
  joinedAt: timestamp("joined_at").defaultNow(),
  leftAt: timestamp("left_at"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const insertGroupParticipantSchema = createInsertSchema(groupParticipants).pick({
  conversationId: true,
  contactId: true,
  participantJid: true,
  participantName: true,
  isAdmin: true,
  isSuperAdmin: true,
  joinedAt: true,
  leftAt: true,
  isActive: true
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  externalId: text("external_id"),
  direction: text("direction").notNull(),
  type: text("type").default("text"),
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  senderId: integer("sender_id"),
  senderType: text("sender_type"),
  status: text("status").default("sending"),
  sentAt: timestamp("sent_at"),
  readAt: timestamp("read_at"),
  isFromBot: boolean("is_from_bot").default(false),
  mediaUrl: text("media_url"),

  groupParticipantJid: text("group_participant_jid"),
  groupParticipantName: text("group_participant_name"),

  emailMessageId: text("email_message_id"),
  emailInReplyTo: text("email_in_reply_to"),
  emailReferences: text("email_references"),
  emailSubject: text("email_subject"),
  emailFrom: text("email_from"),
  emailTo: text("email_to"),
  emailCc: text("email_cc"),
  emailBcc: text("email_bcc"),
  emailHtml: text("email_html"),
  emailPlainText: text("email_plain_text"),
  emailHeaders: jsonb("email_headers"),

  isHistorySync: boolean("is_history_sync").default(false),
  historySyncBatchId: text("history_sync_batch_id"),

  anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
  anonymizationReason: text("anonymization_reason"),

  createdAt: timestamp("created_at").defaultNow()
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  conversationId: true,
  externalId: true,
  direction: true,
  type: true,
  content: true,
  metadata: true,
  senderId: true,
  senderType: true,
  status: true,
  sentAt: true,
  readAt: true,
  isFromBot: true,
  mediaUrl: true,
  groupParticipantJid: true,
  groupParticipantName: true,
  isHistorySync: true,
  historySyncBatchId: true,
  anonymizedAt: true,
  anonymizationReason: true,
  createdAt: true
});

export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull(),
  userId: integer("created_by_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const insertNoteSchema = createInsertSchema(notes).pick({
  contactId: true,
  userId: true,
  content: true
});


export const calls = pgTable("calls", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  channelId: integer("channel_id").references(() => channelConnections.id),
  contactId: integer("contact_id").references(() => contacts.id),
  conversationId: integer("conversation_id").references(() => conversations.id),
  flowId: integer("flow_id").references(() => flows.id),
  nodeId: text("node_id"),
  direction: text("direction"), // 'inbound' | 'outbound'
  status: text("status"), // 'ringing' | 'in-progress' | 'completed' | 'failed' | 'busy' | 'no-answer'
  from: text("from"),
  to: text("to"),
  durationSec: integer("duration_sec"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  recordingUrl: text("recording_url"),
  recordingSid: text("recording_sid"),
  /** Whether recording was enabled for this call at initiation */
  recordingRequested: boolean("recording_requested"),
  /** Which system serves playable audio: Twilio recording vs ElevenLabs post-call */
  recordingAudioProvider: text("recording_audio_provider"), // 'twilio' | 'elevenlabs'
  /** Where the UI should wait for audio (Twilio webhook/API vs ElevenLabs analysis) */
  recordingExpectedFrom: text("recording_expected_from"), // 'twilio' | 'elevenlabs'
  twilioCallSid: text("twilio_call_sid"),
  transcript: jsonb("transcript"),
  conversationData: jsonb("conversation_data"),
  agentConfig: jsonb("agent_config"),
  cost: numeric("cost", { precision: 10, scale: 4 }),
  costCurrency: text("cost_currency").default("USD"),
  metadata: jsonb("metadata"),
  notes: text("notes"),
  isStarred: boolean("is_starred").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const callElevenlabsWebhookEvents = pgTable("call_elevenlabs_webhook_events", {
  id: serial("id").primaryKey(),
  callLogId: integer("call_log_id").references(() => calls.id, { onDelete: "set null" }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  elevenlabsConversationId: text("elevenlabs_conversation_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at").defaultNow()
});

export const conversationMetrics = pgTable(
  "conversation_metrics",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    assignedToUserId: integer("assigned_to_user_id").references(() => users.id, { onDelete: "set null" }),
    channelType: text("channel_type").notNull(),
    contactedAt: timestamp("contacted_at").notNull(),
    assignedAt: timestamp("assigned_at"),
    firstResponseAt: timestamp("first_response_at"),
    resolvedAt: timestamp("resolved_at"),
    firstResponseTimeSec: integer("first_response_time_sec"),
    resolutionTimeSec: integer("resolution_time_sec"),
    totalMessages: integer("total_messages").notNull().default(0),
    agentMessages: integer("agent_messages").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow()
  },
  (table) => [unique("conversation_metrics_conversation_id_unique").on(table.conversationId)]
);

export const insertConversationMetricSchema = createInsertSchema(conversationMetrics).pick({
  companyId: true,
  conversationId: true,
  assignedToUserId: true,
  channelType: true,
  contactedAt: true,
  assignedAt: true,
  firstResponseAt: true,
  resolvedAt: true,
  firstResponseTimeSec: true,
  resolutionTimeSec: true,
  totalMessages: true,
  agentMessages: true
});

export type ConversationMetric = typeof conversationMetrics.$inferSelect;
export type InsertConversationMetric = z.infer<typeof insertConversationMetricSchema>;

export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type ChannelConnection = typeof channelConnections.$inferSelect;
export type InsertChannelConnection = z.infer<typeof insertChannelConnectionSchema>;

export type PartnerConfiguration = typeof partnerConfigurations.$inferSelect;
export type InsertPartnerConfiguration = z.infer<typeof insertPartnerConfigurationSchema>;

export type MetaWhatsappClient = typeof metaWhatsappClients.$inferSelect;
export type InsertMetaWhatsappClient = z.infer<typeof insertMetaWhatsappClientSchema>;

export type MetaWhatsappPhoneNumber = typeof metaWhatsappPhoneNumbers.$inferSelect;
export type InsertMetaWhatsappPhoneNumber = z.infer<typeof insertMetaWhatsappPhoneNumberSchema>;

export type EmailAttachment = typeof emailAttachments.$inferSelect;
export type InsertEmailAttachment = z.infer<typeof insertEmailAttachmentSchema>;

export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;

export type EmailSignature = typeof emailSignatures.$inferSelect;
export type InsertEmailSignature = z.infer<typeof insertEmailSignatureSchema>;

export type EmailConfig = typeof emailConfigs.$inferSelect;
export type InsertEmailConfig = z.infer<typeof insertEmailConfigSchema>;

export type Call = typeof calls.$inferSelect;
export type InsertCall = typeof calls.$inferInsert;

/** Which backend hosts the call recording for playback */
export type RecordingAudioProvider = 'twilio' | 'elevenlabs';

export interface CallRecordingNormalization {
  recordingRequested: boolean;
  recordingAudioProvider: RecordingAudioProvider | null;
  recordingExpectedFrom: RecordingAudioProvider | null;
}

/**
 * Consistent recording flags for call logs across initiation paths.
 * When recording is off, expectation fields are null so the UI can show a definite "not recorded" state.
 */
export function buildCallRecordingFields(input: {
  recordCall: boolean;
  telephonyProvider: 'twilio' | 'telnyx';
  callType: 'direct' | 'ai-powered';
  elevenLabsNativeOutbound?: boolean;
}): CallRecordingNormalization {
  if (!input.recordCall) {
    return {
      recordingRequested: false,
      recordingAudioProvider: null,
      recordingExpectedFrom: null
    };
  }
  if (input.elevenLabsNativeOutbound) {
    return {
      recordingRequested: true,
      recordingAudioProvider: 'elevenlabs',
      recordingExpectedFrom: 'elevenlabs'
    };
  }
  if (input.telephonyProvider === 'twilio') {
    return {
      recordingRequested: true,
      recordingAudioProvider: 'twilio',
      recordingExpectedFrom: 'twilio'
    };
  }
  return {
    recordingRequested: true,
    recordingAudioProvider: null,
    recordingExpectedFrom: null
  };
}

export type CallElevenlabsWebhookEvent = typeof callElevenlabsWebhookEvents.$inferSelect;
export type InsertCallElevenlabsWebhookEvent = typeof callElevenlabsWebhookEvents.$inferInsert;

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;

export type ApiUsage = typeof apiUsage.$inferSelect;
export type InsertApiUsage = z.infer<typeof insertApiUsageSchema>;

export type ApiRateLimit = typeof apiRateLimits.$inferSelect;
export type InsertApiRateLimit = z.infer<typeof insertApiRateLimitSchema>;

export type ApiWebhook = typeof apiWebhooks.$inferSelect;
export type InsertApiWebhook = z.infer<typeof insertApiWebhookSchema>;

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type WebChatSession = typeof webchatSessions.$inferSelect;
export type InsertWebChatSession = z.infer<typeof insertWebChatSessionSchema>;
export type MetaOnboardingSession = typeof metaOnboardingSessions.$inferSelect;
export type InsertMetaOnboardingSession = z.infer<typeof insertMetaOnboardingSessionSchema>;


export const contactDocuments = pgTable("contact_documents", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: 'cascade' }),


  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),


  filePath: text("file_path").notNull(),
  fileUrl: text("file_url").notNull(),


  category: text("category").notNull().default('general'),
  description: text("description"),


  uploadedBy: integer("uploaded_by").references(() => users.id),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export type ContactDocument = typeof contactDocuments.$inferSelect;
export type InsertContactDocument = typeof contactDocuments.$inferInsert;


/** Operatories / chairs for dental clinics. One company = one clinic. */
export const dentalChairs = pgTable("dental_chairs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("dental_chairs_id_company_unique").on(table.id, table.companyId),
  unique("dental_chairs_company_code_unique").on(table.companyId, table.code),
  index("dental_chairs_company_idx").on(table.companyId),
]);

/** Immutable odontogram chart snapshots; append-only per patient. */
export const dentalChartSnapshots = pgTable("dental_chart_snapshots", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  contactId: integer("contact_id").notNull(),
  version: integer("version").notNull(),
  numberingSystem: text("numbering_system").notNull().default('FDI'),
  payload: jsonb("payload").notNull(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("dental_chart_snapshots_company_contact_version_unique").on(table.companyId, table.contactId, table.version),
  foreignKey({
    name: "dental_chart_snapshots_contact_company_fk",
    columns: [table.contactId, table.companyId],
    foreignColumns: [contacts.id, contacts.companyId],
  }).onDelete("cascade"),
  index("dental_chart_snapshots_company_contact_created_idx").on(table.companyId, table.contactId, table.createdAt),
]);

/** Clinical notes on the dental patient timeline (notes, diagnoses, observations). */
export const dentalClinicalNotes = pgTable("dental_clinical_notes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  contactId: integer("contact_id").notNull(),
  noteType: text("note_type").notNull().default('note'),
  body: text("body").notNull(),
  toothRefs: jsonb("tooth_refs").$type<string[] | null>(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  foreignKey({
    name: "dental_clinical_notes_contact_company_fk",
    columns: [table.contactId, table.companyId],
    foreignColumns: [contacts.id, contacts.companyId],
  }).onDelete("cascade"),
  index("dental_clinical_notes_company_contact_created_idx").on(table.companyId, table.contactId, table.createdAt),
]);

export const contactAppointments = pgTable("contact_appointments", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  /** Tenant scope; required for dental schedule queries. Backfilled from contacts for existing rows. */
  companyId: integer("company_id").references(() => companies.id, { onDelete: 'cascade' }),

  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),

  scheduledAt: timestamp("scheduled_at").notNull(),
  durationMinutes: integer("duration_minutes").default(60),

  type: text("type").notNull().default('meeting'),
  /** `held` / `pending_request` are the dental hold & request authority states. */
  status: text("status", { enum: CONTACT_APPOINTMENT_STATUSES })
    .notNull()
    .default('scheduled'),

  /** Dental: treating provider. Tenant match validated on write. */
  providerUserId: integer("provider_user_id").references(() => users.id, { onDelete: 'set null' }),
  /** Dental: operatory. Tenant match validated on write. */
  chairId: integer("chair_id").references(() => dentalChairs.id, { onDelete: 'set null' }),
  isRecall: boolean("is_recall").notNull().default(false),
  recallDueAt: timestamp("recall_due_at"),

  /** Set while status is `held`; the expiry sweep releases the slot after this instant. */
  holdExpiresAt: timestamp("hold_expires_at"),
  /** Which surface created the booking. Existing rows backfill to `staff`. */
  bookingSource: text("booking_source", { enum: DENTAL_BOOKING_SOURCES })
    .notNull()
    .default(DEFAULT_DENTAL_BOOKING_SOURCE),
  /** Snapshot of the booking-policy catalog item used, so later catalog edits do not rewrite history. */
  bookingServiceKey: text("booking_service_key"),
  bookingServiceLabel: text("booking_service_label"),

  createdBy: integer("created_by").references(() => users.id),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
}, (table) => [
  index("contact_appointments_company_scheduled_idx").on(table.companyId, table.scheduledAt),
  index("contact_appointments_provider_idx").on(table.providerUserId),
  index("contact_appointments_chair_idx").on(table.chairId),
  index("contact_appointments_hold_expiry_idx")
    .on(table.holdExpiresAt)
    .where(sql`${table.holdExpiresAt} IS NOT NULL`),
]);

export type DentalChair = typeof dentalChairs.$inferSelect;
export type InsertDentalChair = typeof dentalChairs.$inferInsert;
export type DentalChartSnapshot = typeof dentalChartSnapshots.$inferSelect;
export type InsertDentalChartSnapshot = typeof dentalChartSnapshots.$inferInsert;
export type DentalClinicalNote = typeof dentalClinicalNotes.$inferSelect;
export type InsertDentalClinicalNote = typeof dentalClinicalNotes.$inferInsert;
export type ContactAppointment = typeof contactAppointments.$inferSelect;
export type InsertContactAppointment = typeof contactAppointments.$inferInsert;

export const insertDentalChairSchema = createInsertSchema(dentalChairs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDentalChartSnapshotSchema = createInsertSchema(dentalChartSnapshots).omit({
  id: true,
  createdAt: true,
});

export const insertDentalClinicalNoteSchema = createInsertSchema(dentalClinicalNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});


export const contactTasks = pgTable("contact_tasks", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),


  title: text("title").notNull(),
  description: text("description"),
  priority: text("priority", {
    enum: ['low', 'medium', 'high', 'urgent']
  }).notNull().default('medium'),
  status: text("status", {
    enum: ['not_started', 'in_progress', 'completed', 'cancelled']
  }).notNull().default('not_started'),


  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),


  assignedTo: text("assigned_to"),
  category: text("category"),
  tags: text("tags").array(),
  backgroundColor: text("background_color").default('#ffffff'),


  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: 'set null' }),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export type ContactTask = typeof contactTasks.$inferSelect;
export type InsertContactTask = typeof contactTasks.$inferInsert;

export const taskCategories = pgTable("task_categories", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  color: text("color"),
  icon: text("icon"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export type TaskCategory = typeof taskCategories.$inferSelect;
export type InsertTaskCategory = typeof taskCategories.$inferInsert;


export const contactAuditLogs = pgTable("contact_audit_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  userId: integer("user_id").references(() => users.id, { onDelete: 'set null' }),


  actionType: text("action_type").notNull(),
  actionCategory: text("action_category").notNull().default('contact'),
  description: text("description").notNull(),


  oldValues: jsonb("old_values"),
  newValues: jsonb("new_values"),
  metadata: jsonb("metadata"),


  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),

  createdAt: timestamp("created_at").defaultNow()
});

export type ContactAuditLog = typeof contactAuditLogs.$inferSelect;
export type InsertContactAuditLog = typeof contactAuditLogs.$inferInsert;

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

export type ContactBotSuppression = typeof contactBotSuppressions.$inferSelect;
export type InsertContactBotSuppression = z.infer<typeof insertContactBotSuppressionSchema>;

export type GroupParticipant = typeof groupParticipants.$inferSelect;
export type InsertGroupParticipant = z.infer<typeof insertGroupParticipantSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type Note = typeof notes.$inferSelect;
export type InsertNote = z.infer<typeof insertNoteSchema>;

export type ChannelType = z.infer<typeof channelTypes>;

export const flowNodeTypes = z.enum([
  'start',
  'message',
  'condition',
  'input',
  'api_call',
  'delay',
  'end',
  'attachment',
  'template',
  'contact_property',
  'trigger',
  'image',
  'video',
  'audio',
  'document',
  'wait',
  'whatsapp_interactive_buttons',
  'whatsapp_interactive_list',
  'whatsapp_cta_url',
  'whatsapp_location_request',
  'whatsapp_poll',
  'whatsapp_flows',
  'follow_up',
  'translation',
  'webhook',
  'http_request',
  'database_query',
  'shopify',
  'woocommerce',
  'typebot',
  'flowise',
  'n8n',
  'google_sheets',
  'data_capture',
  'erp_domain_event',
  'bot_disable',
  'bot_reset',
  'notes'
]);

const calendarNodeTypes = ['google_calendar_event', 'google_calendar_availability'] as const;
const aiNodeTypes = ['ai_assistant'] as const;
const pipelineNodeTypes = ['update_pipeline_stage'] as const;
const mcpNodeTypes = ['mcp_client_tool', 'mcp_execute_tool'] as const;

const persistedFlowNodeTypeAliasKeys = Object.keys(LEGACY_NODE_TYPE_MAPPINGS).filter((k) =>
  /^[a-zA-Z][a-zA-Z0-9_]*$/.test(k)
);

export const updatedFlowNodeTypes = Array.from(
  new Set([
    ...flowNodeTypes.options,
    ...calendarNodeTypes,
    ...aiNodeTypes,
    ...pipelineNodeTypes,
    ...mcpNodeTypes,
    ...(Object.values(NodeType) as string[]),
    ...persistedFlowNodeTypeAliasKeys,
    'zohoCalendar',
  ])
);
export const extendedFlowNodeTypes = z.enum(updatedFlowNodeTypes as [string, ...string[]]);

export const erpDomainEventTypeEnum = z.enum([
  'erp.order.confirmed',
  'erp.goods.receipt.created',
  'erp.invoice.sent',
  'erp.payment.recorded',
  'erp.payroll.completed',
]);

export const flowStatusTypes = z.enum([
  'draft',
  'active',
  'inactive',
  'archived'
]);

export const flows = pgTable("flows", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  companyId: integer("company_id").references(() => companies.id),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status", { enum: ['draft', 'active', 'inactive', 'archived'] }).notNull().default('draft'),
  nodes: jsonb("nodes").notNull().default([]),
  edges: jsonb("edges").notNull().default([]),
  customVariables: jsonb("custom_variables").notNull().default([]),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

const insertFlowSchemaBase = createInsertSchema(flows).pick({
  userId: true,
  companyId: true,
  name: true,
  description: true,
  status: true,
  nodes: true,
  edges: true,
  customVariables: true,
  version: true,
});

const persistedFlowNodeSchema = z
  .object({
    type: extendedFlowNodeTypes,
  })
  .passthrough();

export const insertFlowSchema = insertFlowSchemaBase.extend({
  nodes: z.array(persistedFlowNodeSchema),
});

/** Partial flow update: same graph field shapes as create when present; omits userId/companyId. */
export const patchFlowSchema = insertFlowSchema
  .pick({
    name: true,
    description: true,
    status: true,
    nodes: true,
    edges: true,
    customVariables: true,
    version: true,
  })
  .partial();

export type PatchFlow = z.infer<typeof patchFlowSchema>;

export const flowAssignments = pgTable("flow_assignments", {
  id: serial("id").primaryKey(),
  flowId: integer("flow_id").notNull().references(() => flows.id),
  channelId: integer("channel_id").notNull().references(() => channelConnections.id),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const flowSessions = pgTable("flow_sessions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  flowId: integer("flow_id").notNull().references(() => flows.id),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id),
  contactId: integer("contact_id").notNull().references(() => contacts.id),
  companyId: integer("company_id").references(() => companies.id),
  status: text("status", { enum: ['active', 'waiting', 'paused', 'completed', 'failed', 'abandoned', 'timeout'] }).notNull().default('active'),

  currentNodeId: text("current_node_id"),
  triggerNodeId: text("trigger_node_id").notNull(),
  executionPath: jsonb("execution_path").notNull().default([]),
  branchingHistory: jsonb("branching_history").notNull().default([]),

  sessionData: jsonb("session_data").notNull().default({}),
  nodeStates: jsonb("node_states").notNull().default({}),
  waitingContext: jsonb("waiting_context"),

  startedAt: timestamp("started_at").notNull().defaultNow(),
  lastActivityAt: timestamp("last_activity_at").notNull().defaultNow(),
  pausedAt: timestamp("paused_at"),
  resumedAt: timestamp("resumed_at"),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at"),

  totalDurationMs: integer("total_duration_ms"),
  nodeExecutionCount: integer("node_execution_count").default(0),
  userInteractionCount: integer("user_interaction_count").default(0),
  errorCount: integer("error_count").default(0),
  lastErrorMessage: text("last_error_message"),

  checkpointData: jsonb("checkpoint_data"),
  debugInfo: jsonb("debug_info"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const flowExecutions = pgTable("flow_executions", {
  id: serial("id").primaryKey(),
  runId: text("run_id").notNull().unique(),
  executionId: text("execution_id").notNull().unique(),
  runtimeType: text("runtime_type", { enum: ['legacy', 'session'] }).notNull().default('legacy'),
  sessionId: text("session_id").references(() => flowSessions.sessionId),
  flowId: integer("flow_id").notNull().references(() => flows.id),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id),
  contactId: integer("contact_id").notNull().references(() => contacts.id),
  companyId: integer("company_id").references(() => companies.id),
  status: text("status", { enum: ['running', 'waiting', 'completed', 'failed', 'abandoned', 'timeout'] }).notNull().default('running'),
  triggerNodeId: text("trigger_node_id").notNull(),
  currentNodeId: text("current_node_id"),
  executionPath: jsonb("execution_path").notNull().default([]),
  contextData: jsonb("context_data").notNull().default({}),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  lastActivityAt: timestamp("last_activity_at").notNull().defaultNow(),
  totalDurationMs: integer("total_duration_ms"),
  completionRate: numeric("completion_rate", { precision: 5, scale: 2 }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const flowSessionVariables = pgTable("flow_session_variables", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => flowSessions.sessionId),
  variableKey: text("variable_key").notNull(),
  variableValue: jsonb("variable_value").notNull(),
  variableType: text("variable_type", { enum: ['string', 'number', 'boolean', 'object', 'array'] }).notNull().default('string'),
  scope: text("scope", { enum: ['global', 'flow', 'node', 'user', 'session'] }).notNull().default('session'),
  nodeId: text("node_id"),
  isEncrypted: boolean("is_encrypted").default(false),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const flowSessionCursors = pgTable("flow_session_cursors", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => flowSessions.sessionId),
  currentNodeId: text("current_node_id").notNull(),
  previousNodeId: text("previous_node_id"),
  nextPossibleNodes: jsonb("next_possible_nodes").notNull().default([]),
  branchConditions: jsonb("branch_conditions").notNull().default({}),
  loopState: jsonb("loop_state"),
  waitingForInput: boolean("waiting_for_input").default(false),
  inputExpectedType: text("input_expected_type"),
  inputValidationRules: jsonb("input_validation_rules"),
  timeoutAt: timestamp("timeout_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const flowStepExecutions = pgTable("flow_step_executions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").references(() => flowSessions.sessionId),
  flowExecutionId: integer("flow_execution_id").references(() => flowExecutions.id),
  nodeId: text("node_id").notNull(),
  nodeType: text("node_type").notNull(),
  stepOrder: integer("step_order").notNull(),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  status: text("status", { enum: ['running', 'completed', 'failed', 'skipped', 'waiting', 'timeout'] }).notNull().default('running'),
  inputData: jsonb("input_data"),
  outputData: jsonb("output_data"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow()
});

export const capturedFormSubmissions = pgTable("captured_form_submissions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  flowId: integer("flow_id").notNull().references(() => flows.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  nodeId: text("node_id").notNull(),
  sessionId: text("session_id").references(() => flowSessions.sessionId, { onDelete: "set null" }),
  capturedFields: jsonb("captured_fields").notNull().default({}),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow()
});

export const insertCapturedFormSubmissionSchema = createInsertSchema(capturedFormSubmissions).pick({
  companyId: true,
  flowId: true,
  contactId: true,
  nodeId: true,
  sessionId: true,
  capturedFields: true,
  submittedAt: true
});

export const insertFlowAssignmentSchema = createInsertSchema(flowAssignments).pick({
  flowId: true,
  channelId: true,
  isActive: true,
});

export const insertFlowSessionSchema = createInsertSchema(flowSessions).pick({
  sessionId: true,
  flowId: true,
  conversationId: true,
  contactId: true,
  companyId: true,
  status: true,
  currentNodeId: true,
  triggerNodeId: true,
  executionPath: true,
  branchingHistory: true,
  sessionData: true,
  nodeStates: true,
  waitingContext: true,
  expiresAt: true
});

export const insertFlowSessionVariableSchema = createInsertSchema(flowSessionVariables).pick({
  sessionId: true,
  variableKey: true,
  variableValue: true,
  variableType: true,
  scope: true,
  nodeId: true,
  isEncrypted: true,
  expiresAt: true
});

export const insertFlowSessionCursorSchema = createInsertSchema(flowSessionCursors).pick({
  sessionId: true,
  currentNodeId: true,
  previousNodeId: true,
  nextPossibleNodes: true,
  branchConditions: true,
  loopState: true,
  waitingForInput: true,
  inputExpectedType: true,
  inputValidationRules: true,
  timeoutAt: true
});

export type Flow = typeof flows.$inferSelect;
export type InsertFlow = z.infer<typeof insertFlowSchema>;
export type FlowAssignment = typeof flowAssignments.$inferSelect;
export type InsertFlowAssignment = z.infer<typeof insertFlowAssignmentSchema>;
export type FlowNodeType = z.infer<typeof extendedFlowNodeTypes>;
export type ExtendedFlowNodeType = FlowNodeType;
export type FlowStatus = z.infer<typeof flowStatusTypes>;

export type FlowSession = typeof flowSessions.$inferSelect;
export type InsertFlowSession = z.infer<typeof insertFlowSessionSchema>;
export type FlowSessionVariable = typeof flowSessionVariables.$inferSelect;
export type InsertFlowSessionVariable = z.infer<typeof insertFlowSessionVariableSchema>;
export type FlowSessionCursor = typeof flowSessionCursors.$inferSelect;
export type InsertFlowSessionCursor = z.infer<typeof insertFlowSessionCursorSchema>;
export type CapturedFormSubmission = typeof capturedFormSubmissions.$inferSelect;
export type InsertCapturedFormSubmission = typeof capturedFormSubmissions.$inferInsert;

export type FlowExecution = typeof flowExecutions.$inferSelect;
export type FlowStepExecution = typeof flowStepExecutions.$inferSelect;

// Webhook triggers for flows
export const webhookTriggers = pgTable("webhook_triggers", {
  id: serial("id").primaryKey(),
  flowId: integer("flow_id").notNull().references(() => flows.id, { onDelete: "cascade" }),
  nodeId: text("node_id").notNull(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  webhookToken: text("webhook_token").notNull().unique(),
  customPath: text("custom_path").unique(),
  isActive: boolean("is_active").notNull().default(true),
  filterConditions: jsonb("filter_conditions").notNull().default([]),
  contactMapping: jsonb("contact_mapping").notNull().default({}),
  responseConfig: jsonb("response_config")
    .notNull()
    .default({ statusCode: 200, mode: "async", bodyTemplate: "", headers: {} }),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const webhookTriggerLogStatusEnum = pgEnum("webhook_trigger_log_status", [
  "received",
  "filtered",
  "triggered",
  "failed"
]);

export const webhookTriggerLogs = pgTable("webhook_trigger_logs", {
  id: serial("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  triggerId: integer("trigger_id").references(() => webhookTriggers.id, { onDelete: "cascade" }),
  flowId: integer("flow_id").references(() => flows.id),
  executionId: text("execution_id"),
  payload: jsonb("payload").notNull(),
  headers: jsonb("headers").default({}),
  queryParams: jsonb("query_params").default({}),
  status: webhookTriggerLogStatusEnum("status").notNull(),
  filterResult: jsonb("filter_result"),
  contactId: integer("contact_id").references(() => contacts.id),
  conversationId: integer("conversation_id").references(() => conversations.id),
  responseStatus: integer("response_status"),
  responseBody: text("response_body"),
  errorMessage: text("error_message"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  processingTimeMs: integer("processing_time_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow()
});

const insertWebhookTriggerSchemaBase = createInsertSchema(webhookTriggers).pick({
  flowId: true,
  nodeId: true,
  companyId: true,
  webhookToken: true,
  customPath: true,
  isActive: true,
  filterConditions: true,
  contactMapping: true,
  responseConfig: true,
  metadata: true
});

const customPathRegex = /^[a-zA-Z0-9\-_\/]+$/;
export const insertWebhookTriggerSchema = insertWebhookTriggerSchemaBase
  .refine((data) => !data.webhookToken || data.webhookToken.length >= 32, {
    message: "Token must be at least 32 characters",
    path: ["webhookToken"]
  })
  .refine((data) => data.customPath === null || data.customPath === undefined || customPathRegex.test(data.customPath), {
    message: "Custom path must be URL-safe (alphanumeric, hyphens, underscores, slashes only)",
    path: ["customPath"]
  })
  .refine(
    (data) =>
      data.filterConditions === undefined ||
      (Array.isArray(data.filterConditions) &&
        data.filterConditions.every(
          (c: { fieldPath?: unknown; operator?: unknown }) =>
            typeof c === "object" && c !== null && typeof (c as { fieldPath?: string }).fieldPath === "string" && typeof (c as { operator?: string }).operator === "string"
        )),
    { message: "filterConditions must be an array of objects with fieldPath and operator", path: ["filterConditions"] }
  )
  .refine(
    (data) =>
      data.contactMapping === undefined ||
      (typeof data.contactMapping === "object" &&
        data.contactMapping !== null &&
        ["extract", "create", "system"].includes((data.contactMapping as { strategy?: string }).strategy as string)),
    { message: "contactMapping.strategy must be one of: extract, create, system", path: ["contactMapping"] }
  )
  .refine(
    (data) => {
      const rc = data.responseConfig;
      if (rc === undefined || typeof rc !== "object" || rc === null) return true;
      const statusCode = (rc as { statusCode?: number }).statusCode;
      if (typeof statusCode !== "number") return false;
      return statusCode >= 100 && statusCode <= 599;
    },
    { message: "responseConfig.statusCode is required and must be between 100 and 599", path: ["responseConfig"] }
  )
  .refine(
    (data) => {
      const rc = data.responseConfig;
      if (rc === undefined || typeof rc !== "object" || rc === null) return true;
      const mode = (rc as { mode?: string }).mode;
      if (typeof mode !== "string") return false;
      return ["sync", "async"].includes(mode);
    },
    { message: "responseConfig.mode is required and must be sync or async", path: ["responseConfig"] }
  )
  .refine(
    (data) =>
      data.responseConfig === undefined ||
      (typeof data.responseConfig === "object" &&
        data.responseConfig !== null &&
        typeof (data.responseConfig as { bodyTemplate?: string }).bodyTemplate === "string"),
    { message: "responseConfig.bodyTemplate is required and must be a string", path: ["responseConfig"] }
  )
  .refine(
    (data) => {
      const rc = data.responseConfig as { timeout?: number } | undefined;
      if (rc?.timeout === undefined || rc?.timeout === null) return true;
      return Number(rc.timeout) >= 1000 && Number(rc.timeout) <= 120000;
    },
    { message: "responseConfig.timeout must be between 1000 and 120000 ms", path: ["responseConfig"] }
  );

export const insertWebhookTriggerLogSchema = createInsertSchema(webhookTriggerLogs).pick({
  requestId: true,
  triggerId: true,
  flowId: true,
  executionId: true,
  payload: true,
  headers: true,
  queryParams: true,
  status: true,
  filterResult: true,
  contactId: true,
  conversationId: true,
  responseStatus: true,
  responseBody: true,
  errorMessage: true,
  ipAddress: true,
  userAgent: true,
  processingTimeMs: true
});

export type WebhookTrigger = typeof webhookTriggers.$inferSelect;
export type InsertWebhookTrigger = z.infer<typeof insertWebhookTriggerSchema>;
export type WebhookTriggerLog = typeof webhookTriggerLogs.$inferSelect;
export type InsertWebhookTriggerLog = z.infer<typeof insertWebhookTriggerLogSchema>;

export type FollowUpSchedule = typeof followUpSchedules.$inferSelect;
export type InsertFollowUpSchedule = z.infer<typeof insertFollowUpScheduleSchema>;
export type FollowUpTemplate = typeof followUpTemplates.$inferSelect;
export type InsertFollowUpTemplate = z.infer<typeof insertFollowUpTemplateSchema>;
export type FollowUpExecutionLog = typeof followUpExecutionLog.$inferSelect;
export type InsertFollowUpExecutionLog = z.infer<typeof insertFollowUpExecutionLogSchema>;



export const followUpSchedules = pgTable("follow_up_schedules", {
  id: serial("id").primaryKey(),
  scheduleId: text("schedule_id").notNull().unique(),
  sessionId: text("session_id").references(() => flowSessions.sessionId),
  flowId: integer("flow_id").notNull().references(() => flows.id),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id),
  contactId: integer("contact_id").notNull().references(() => contacts.id),
  companyId: integer("company_id").references(() => companies.id),
  nodeId: text("node_id").notNull(),

  messageType: text("message_type", {
    enum: ['text', 'image', 'video', 'audio', 'document', 'reaction']
  }).notNull().default('text'),
  messageContent: text("message_content"),
  mediaUrl: text("media_url"),
  caption: text("caption"),
  templateId: integer("template_id"),

  triggerEvent: text("trigger_event", {
    enum: ['conversation_start', 'node_execution', 'specific_datetime', 'relative_delay']
  }).notNull().default('conversation_start'),
  triggerNodeId: text("trigger_node_id"),
  delayAmount: integer("delay_amount"),
  delayUnit: text("delay_unit", { enum: ['minutes', 'hours', 'days', 'weeks'] }),
  scheduledFor: timestamp("scheduled_for"),
  specificDatetime: timestamp("specific_datetime"),
  timezone: text("timezone").default('UTC'),

  status: text("status", {
    enum: ['scheduled', 'processing', 'sent', 'failed', 'cancelled', 'expired']
  }).notNull().default('scheduled'),
  sentAt: timestamp("sent_at"),
  failedReason: text("failed_reason"),
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),

  processingLeaseExpiresAt: timestamp("processing_lease_expires_at"),
  processingClaimId: text("processing_claim_id"),
  /** Set when outbound send begins; rows with this set are not cancellable until terminal. */
  dispatchStartedAt: timestamp("dispatch_started_at"),

  channelType: text("channel_type").notNull(),
  channelConnectionId: integer("channel_connection_id").references(() => channelConnections.id),

  variables: jsonb("variables").default({}),
  executionContext: jsonb("execution_context").default({}),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),

  cancelOnUserResponse: boolean("cancel_on_user_response").default(false),
  cancelCondition: text("cancel_condition", { enum: ['any_message', 'specific_topic', 'none'] }).default('none'),
  monitoringStartedAt: timestamp("monitoring_started_at"),
  lastUserMessageAt: timestamp("last_user_message_at")
});

export const followUpTemplates = pgTable("follow_up_templates", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  name: text("name").notNull(),
  description: text("description"),
  messageType: text("message_type", {
    enum: ['text', 'image', 'video', 'audio', 'document', 'reaction']
  }).notNull().default('text'),
  content: text("content").notNull(),
  mediaUrl: text("media_url"),
  caption: text("caption"),
  defaultDelayAmount: integer("default_delay_amount").default(24),
  defaultDelayUnit: text("default_delay_unit", { enum: ['minutes', 'hours', 'days', 'weeks'] }).default('hours'),
  variables: jsonb("variables").default([]),
  category: text("category").default('general'),
  isActive: boolean("is_active").default(true),
  usageCount: integer("usage_count").default(0),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, (table) => ({
  uniqueCompanyName: unique().on(table.companyId, table.name)
}));

export const followUpExecutionLog = pgTable("follow_up_execution_log", {
  id: serial("id").primaryKey(),
  scheduleId: text("schedule_id").notNull().references(() => followUpSchedules.scheduleId),
  executionAttempt: integer("execution_attempt").notNull().default(1),
  status: text("status", { enum: ['success', 'failed', 'expired', 'skipped', 'retry'] }).notNull(),
  messageId: text("message_id"),
  errorMessage: text("error_message"),
  executionDurationMs: integer("execution_duration_ms"),
  executedAt: timestamp("executed_at").notNull().defaultNow(),

  responseReceived: boolean("response_received").default(false),
  responseAt: timestamp("response_at"),
  responseContent: text("response_content")
});

export const insertFollowUpScheduleSchema = createInsertSchema(followUpSchedules).pick({
  scheduleId: true,
  sessionId: true,
  flowId: true,
  conversationId: true,
  contactId: true,
  companyId: true,
  nodeId: true,
  messageType: true,
  messageContent: true,
  mediaUrl: true,
  caption: true,
  templateId: true,
  triggerEvent: true,
  triggerNodeId: true,
  delayAmount: true,
  delayUnit: true,
  scheduledFor: true,
  specificDatetime: true,
  timezone: true,
  status: true,
  maxRetries: true,
  channelType: true,
  channelConnectionId: true,
  variables: true,
  executionContext: true,
  expiresAt: true,
  cancelOnUserResponse: true,
  cancelCondition: true,
  monitoringStartedAt: true,
  lastUserMessageAt: true
});

export const insertFollowUpTemplateSchema = createInsertSchema(followUpTemplates).pick({
  companyId: true,
  name: true,
  description: true,
  messageType: true,
  content: true,
  mediaUrl: true,
  caption: true,
  defaultDelayAmount: true,
  defaultDelayUnit: true,
  variables: true,
  category: true,
  isActive: true,
  createdBy: true
});

export const insertFollowUpExecutionLogSchema = createInsertSchema(followUpExecutionLog).pick({
  scheduleId: true,
  executionAttempt: true,
  status: true,
  messageId: true,
  errorMessage: true,
  executionDurationMs: true,
  responseReceived: true,
  responseAt: true,
  responseContent: true
});

export const googleCalendarTokens = pgTable("google_calendar_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  companyId: integer("company_id").notNull().references(() => companies.id),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  tokenType: text("token_type"),
  expiryDate: timestamp("expiry_date"),
  scope: text("scope"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const insertGoogleCalendarTokenSchema = createInsertSchema(googleCalendarTokens).pick({
  userId: true,
  companyId: true,
  accessToken: true,
  refreshToken: true,
  idToken: true,
  tokenType: true,
  expiryDate: true,
  scope: true
});

export type GoogleCalendarToken = typeof googleCalendarTokens.$inferSelect;
export type InsertGoogleCalendarToken = z.infer<typeof insertGoogleCalendarTokenSchema>;

export const zohoCalendarTokens = pgTable("zoho_calendar_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  companyId: integer("company_id").notNull().references(() => companies.id),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  tokenType: text("token_type"),
  expiresIn: integer("expires_in"),
  scope: text("scope"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const insertZohoCalendarTokenSchema = createInsertSchema(zohoCalendarTokens).pick({
  userId: true,
  companyId: true,
  accessToken: true,
  refreshToken: true,
  tokenType: true,
  expiresIn: true,
  scope: true
});

export type ZohoCalendarToken = typeof zohoCalendarTokens.$inferSelect;
export type InsertZohoCalendarToken = z.infer<typeof insertZohoCalendarTokenSchema>;

export const calendlyCalendarTokens = pgTable("calendly_calendar_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  companyId: integer("company_id").notNull().references(() => companies.id),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  tokenType: text("token_type"),
  expiresIn: integer("expires_in"),
  scope: text("scope"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const insertCalendlyCalendarTokenSchema = createInsertSchema(calendlyCalendarTokens).pick({
  userId: true,
  companyId: true,
  accessToken: true,
  refreshToken: true,
  tokenType: true,
  expiresIn: true,
  scope: true
});

export type CalendlyCalendarToken = typeof calendlyCalendarTokens.$inferSelect;
export type InsertCalendlyCalendarToken = z.infer<typeof insertCalendlyCalendarTokenSchema>;

export const mcpOauthTokens = pgTable(
  "mcp_oauth_tokens",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    serverId: text("server_id").notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    tokenType: text("token_type").notNull().default("Bearer"),
    scope: text("scope"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("idx_mcp_oauth_tokens_company_node_server").on(
      t.companyId,
      t.nodeId,
      t.serverId,
    ),
  ],
);

export const insertMcpOauthTokenSchema = createInsertSchema(mcpOauthTokens).pick({
  companyId: true,
  nodeId: true,
  serverId: true,
  accessToken: true,
  refreshToken: true,
  tokenType: true,
  scope: true,
  expiresAt: true,
});

export type MCPOauthToken = typeof mcpOauthTokens.$inferSelect;
export type InsertMCPOauthToken = z.infer<typeof insertMcpOauthTokenSchema>;

export const calendarBookings = pgTable("calendar_bookings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  companyId: integer("company_id").notNull().references(() => companies.id),
  calendarType: text("calendar_type").notNull(), // 'google', 'zoho', etc.
  calendarId: text("calendar_id").notNull().default('primary'),
  startDateTime: timestamp("start_date_time", { withTimezone: true }).notNull(),
  endDateTime: timestamp("end_date_time", { withTimezone: true }).notNull(),
  bufferStartDateTime: timestamp("buffer_start_date_time", { withTimezone: true }).notNull(),
  bufferEndDateTime: timestamp("buffer_end_date_time", { withTimezone: true }).notNull(),
  bufferMinutes: integer("buffer_minutes").notNull().default(0),
  eventId: text("event_id"), // Calendar provider's event ID (Google Calendar event ID, etc.)
  eventLink: text("event_link"), // Full calendar event link URL for direct lookups
  status: text("status", { enum: ['pending', 'confirmed', 'cancelled', 'orphaned'] }).notNull().default('confirmed'),
  idempotencyKey: text("idempotency_key"),
  etag: text("etag"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const insertCalendarBookingSchema = createInsertSchema(calendarBookings).pick({
  userId: true,
  companyId: true,
  calendarType: true,
  calendarId: true,
  startDateTime: true,
  endDateTime: true,
  bufferStartDateTime: true,
  bufferEndDateTime: true,
  bufferMinutes: true,
  eventId: true,
  eventLink: true,
  status: true,
  idempotencyKey: true,
  etag: true,
  lastSyncedAt: true,
  cancelledAt: true
});

export type CalendarBooking = typeof calendarBookings.$inferSelect;
export type InsertCalendarBooking = z.infer<typeof insertCalendarBookingSchema>;

export const calendarSlotLocks = pgTable("calendar_slot_locks", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  calendarType: text("calendar_type").notNull(),
  startDateTime: timestamp("start_date_time", { withTimezone: true }).notNull(),
  endDateTime: timestamp("end_date_time", { withTimezone: true }).notNull(),
  lockToken: uuid("lock_token").notNull(),
  acquiredBy: text("acquired_by"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  lockTokenIdx: uniqueIndex("idx_calendar_slot_locks_lock_token").on(t.lockToken),
  rangeIdx: index("idx_calendar_slot_locks_range").on(t.userId, t.companyId, t.calendarType, t.startDateTime, t.endDateTime, t.expiresAt)
}));

export const insertCalendarSlotLockSchema = createInsertSchema(calendarSlotLocks).pick({
  userId: true,
  companyId: true,
  calendarType: true,
  startDateTime: true,
  endDateTime: true,
  lockToken: true,
  acquiredBy: true,
  expiresAt: true
});

export type CalendarSlotLock = typeof calendarSlotLocks.$inferSelect;
export type InsertCalendarSlotLock = z.infer<typeof insertCalendarSlotLockSchema>;

export const calendarAuditLog = pgTable("calendar_audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: 'set null' }),
  userId: integer("user_id").references(() => users.id, { onDelete: 'set null' }),
  action: text("action").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  result: jsonb("result").$type<Record<string, unknown>>(),
  latencyMs: integer("latency_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  lookupIdx: index("idx_calendar_audit_log_lookup").on(t.companyId, t.userId, t.action, t.createdAt)
}));

export const insertCalendarAuditLogSchema = createInsertSchema(calendarAuditLog).pick({
  companyId: true,
  userId: true,
  action: true,
  payload: true,
  result: true,
  latencyMs: true
});

export type CalendarAuditLog = typeof calendarAuditLog.$inferSelect;
export type InsertCalendarAuditLog = z.infer<typeof insertCalendarAuditLogSchema>;

export const agentCalendarSettings = pgTable("agent_calendar_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  calendarType: text("calendar_type").notNull().default('google'),
  isEnabled: boolean("is_enabled").notNull().default(false),
  businessHoursStart: text("business_hours_start").default('09:00'),
  businessHoursEnd: text("business_hours_end").default('17:00'),
  advancedSettings: jsonb("advanced_settings").$type<CalendarAdvancedSettings>(),
  timezone: text("timezone").default('UTC'),
  bufferMinutes: integer("buffer_minutes").default(0),
  scheduleMode: text("schedule_mode").notNull().default('simple'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, (t) => ({
  unq: unique().on(t.userId, t.companyId)
}));

export const insertAgentCalendarSettingsSchema = createInsertSchema(agentCalendarSettings).pick({
  userId: true,
  companyId: true,
  calendarType: true,
  isEnabled: true,
  businessHoursStart: true,
  businessHoursEnd: true,
  advancedSettings: true,
  timezone: true,
  bufferMinutes: true,
  scheduleMode: true
});

export type AgentCalendarSettings = typeof agentCalendarSettings.$inferSelect;
export type InsertAgentCalendarSettings = z.infer<typeof insertAgentCalendarSettingsSchema>;

export const agentInboxAvailabilitySettings = pgTable("agent_inbox_availability_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  isScheduleEnabled: boolean("is_schedule_enabled").notNull().default(true),
  isOnDuty: boolean("is_on_duty").notNull().default(true),
  scheduleMode: text("schedule_mode").notNull().default('simple'),
  businessHoursStart: text("business_hours_start").default('09:00'),
  businessHoursEnd: text("business_hours_end").default('17:00'),
  advancedSettings: jsonb("advanced_settings").$type<CalendarAdvancedSettings>(),
  timezone: text("timezone").default('UTC'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, (t) => ({
  unq: unique().on(t.userId, t.companyId)
}));

export const insertAgentInboxAvailabilitySettingsSchema = createInsertSchema(agentInboxAvailabilitySettings).pick({
  userId: true,
  companyId: true,
  isScheduleEnabled: true,
  isOnDuty: true,
  scheduleMode: true,
  businessHoursStart: true,
  businessHoursEnd: true,
  advancedSettings: true,
  timezone: true
});

export type AgentInboxAvailabilitySettings = typeof agentInboxAvailabilitySettings.$inferSelect;
export type InsertAgentInboxAvailabilitySettings = z.infer<typeof insertAgentInboxAvailabilitySettingsSchema>;

export const invitationStatusTypes = z.enum([
  'pending',
  'accepted',
  'expired',
  'revoked'
]);

export const teamInvitations = pgTable("team_invitations", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  invitedByUserId: integer("invited_by_user_id").notNull().references(() => users.id),
  companyId: integer("company_id").notNull().references(() => companies.id),
  role: text("role").notNull().default("agent"),
  token: text("token").notNull().unique(),
  status: text("status", { enum: ['pending', 'accepted', 'expired', 'revoked'] }).notNull().default('pending'),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const insertTeamInvitationSchema = createInsertSchema(teamInvitations).pick({
  email: true,
  invitedByUserId: true,
  companyId: true,
  role: true,
  token: true,
  status: true,
  expiresAt: true
});

export type TeamInvitation = typeof teamInvitations.$inferSelect;
export type InsertTeamInvitation = z.infer<typeof insertTeamInvitationSchema>;
export type InvitationStatus = z.infer<typeof invitationStatusTypes>;

export const dealStatusTypes = z.enum([
  'lead',
  'qualified',
  'contacted',
  'demo_scheduled',
  'proposal',
  'negotiation',
  'closed_won',
  'closed_lost'
]);

export const dealPriorityTypes = z.enum([
  'low',
  'medium',
  'high'
]);

export const pipelineStages = pgTable("pipeline_stages", {
  id: serial("id").primaryKey(),
  pipelineId: integer("pipeline_id").notNull().references(() => pipelines.id, { onDelete: 'cascade' }),
  companyId: integer("company_id").references(() => companies.id),
  name: text("name").notNull(),
  color: text("color").notNull(),
  order: integer("order_num").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, (table) => [
  index("idx_pipeline_stages_pipeline_order").on(table.pipelineId, table.order),
]);

export const pipelines = pgTable("pipelines", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"),
  color: text("color"),
  isDefault: boolean("is_default").default(false),
  isTemplate: boolean("is_template").default(false),
  templateCategory: text("template_category"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  orderNum: integer("order_num").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, (table) => [
  unique("idx_pipelines_id_company").on(table.id, table.companyId),
]);

export const insertPipelineStageSchema = createInsertSchema(pipelineStages).pick({
  pipelineId: true,
  companyId: true,
  name: true,
  color: true,
  order: true
});

export const insertPipelineSchema = createInsertSchema(pipelines).pick({
  companyId: true,
  name: true,
  description: true,
  icon: true,
  color: true,
  isDefault: true,
  isTemplate: true,
  templateCategory: true,
  createdBy: true,
  orderNum: true
});

export const pipelineAgentAssignments = pgTable(
  "pipeline_agent_assignments",
  {
    id:          serial("id").primaryKey(),
    pipelineId:  integer("pipeline_id").notNull(),
    userId:      integer("user_id").notNull(),
    companyId:   integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
    assignedBy:  integer("assigned_by").notNull(),
    createdAt:   timestamp("created_at").notNull().defaultNow()
  },
  (table) => [
    unique("idx_paa_pipeline_user").on(table.pipelineId, table.userId),
    foreignKey({
      name: "paa_pipeline_company_fk",
      columns: [table.pipelineId, table.companyId],
      foreignColumns: [pipelines.id, pipelines.companyId],
    }).onDelete("cascade"),
    foreignKey({
      name: "paa_user_company_fk",
      columns: [table.userId, table.companyId],
      foreignColumns: [users.id, users.companyId],
    }).onDelete("cascade"),
    foreignKey({
      name: "paa_assigned_by_company_fk",
      columns: [table.assignedBy, table.companyId],
      foreignColumns: [users.id, users.companyId],
    }).onDelete("restrict"),
  ]
);

export const insertPipelineAgentAssignmentSchema = createInsertSchema(pipelineAgentAssignments).pick({
  pipelineId: true,
  userId: true,
  companyId: true,
  assignedBy: true
});

export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  maxUsers: integer("max_users").notNull().default(5),
  maxContacts: integer("max_contacts").notNull().default(1000),
  maxChannels: integer("max_channels").notNull().default(3),
  maxFlows: integer("max_flows").notNull().default(1),
  maxCampaigns: integer("max_campaigns").notNull().default(5),
  maxCampaignRecipients: integer("max_campaign_recipients").notNull().default(1000),
  campaignFeatures: jsonb("campaign_features").notNull().default(["basic_campaigns"]),
  isActive: boolean("is_active").notNull().default(true),
  isFree: boolean("is_free").notNull().default(false),
  hasTrialPeriod: boolean("has_trial_period").notNull().default(false),
  trialDays: integer("trial_days").default(0),
  features: jsonb("features").notNull().default([]),
  billingInterval: text("billing_interval", { enum: ['lifetime', 'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semi_annual', 'annual', 'biennial', 'custom'] }).default("monthly"),
  customDurationDays: integer("custom_duration_days"),
  gracePeriodDays: integer("grace_period_days").default(3),
  maxDunningAttempts: integer("max_dunning_attempts").default(3),
  softLimitPercentage: integer("soft_limit_percentage").default(80),
  allowPausing: boolean("allow_pausing").default(true),
  pauseMaxDays: integer("pause_max_days").default(90),
  aiTokensIncluded: integer("ai_tokens_included").default(0),
  aiTokensMonthlyLimit: integer("ai_tokens_monthly_limit"),
  aiTokensDailyLimit: integer("ai_tokens_daily_limit"),
  aiOverageEnabled: boolean("ai_overage_enabled").default(false),
  aiOverageRate: numeric("ai_overage_rate", { precision: 10, scale: 6 }).default("0.000000"),
  aiOverageBlockEnabled: boolean("ai_overage_block_enabled").default(false),
  aiBillingEnabled: boolean("ai_billing_enabled").default(false),

  discountType: text("discount_type", { enum: ['none', 'percentage', 'fixed_amount'] }).default('none'),
  discountValue: numeric("discount_value", { precision: 10, scale: 2 }).default("0"),
  discountDuration: text("discount_duration", { enum: ['permanent', 'first_month', 'first_year', 'limited_time'] }).default('permanent'),
  discountStartDate: timestamp("discount_start_date"),
  discountEndDate: timestamp("discount_end_date"),
  originalPrice: numeric("original_price", { precision: 10, scale: 2 }),


  storageLimit: integer("storage_limit").default(1024), // in MB
  bandwidthLimit: integer("bandwidth_limit").default(10240), // monthly bandwidth in MB
  fileUploadLimit: integer("file_upload_limit").default(25), // max file size per upload in MB
  totalFilesLimit: integer("total_files_limit").default(1000), // max number of files

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const planAiProviderConfigs = pgTable("plan_ai_provider_configs", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => plans.id, { onDelete: 'cascade' }),
  provider: text("provider").notNull(),

  tokensMonthlyLimit: integer("tokens_monthly_limit"),
  tokensDailyLimit: integer("tokens_daily_limit"),

  customPricingEnabled: boolean("custom_pricing_enabled").default(false),
  inputTokenRate: numeric("input_token_rate", { precision: 10, scale: 8 }),
  outputTokenRate: numeric("output_token_rate", { precision: 10, scale: 8 }),

  enabled: boolean("enabled").default(true),
  priority: integer("priority").default(0),

  metadata: jsonb("metadata").default('{}'),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, (table) => ({
  uniqueProviderPerPlan: unique().on(table.planId, table.provider)
}));

export const planAiUsageTracking = pgTable("plan_ai_usage_tracking", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  planId: integer("plan_id").notNull().references(() => plans.id, { onDelete: 'cascade' }),
  provider: text("provider").notNull(),

  tokensUsedMonthly: integer("tokens_used_monthly").default(0),
  tokensUsedDaily: integer("tokens_used_daily").default(0),
  requestsMonthly: integer("requests_monthly").default(0),
  requestsDaily: integer("requests_daily").default(0),
  costMonthly: numeric("cost_monthly", { precision: 10, scale: 6 }).default("0.000000"),
  costDaily: numeric("cost_daily", { precision: 10, scale: 6 }).default("0.000000"),

  overageTokensMonthly: integer("overage_tokens_monthly").default(0),
  overageCostMonthly: numeric("overage_cost_monthly", { precision: 10, scale: 6 }).default("0.000000"),

  usageMonth: integer("usage_month").notNull(),
  usageYear: integer("usage_year").notNull(),
  usageDate: date("usage_date").notNull(),

  monthlyLimitReached: boolean("monthly_limit_reached").default(false),
  dailyLimitReached: boolean("daily_limit_reached").default(false),
  monthlyWarningSent: boolean("monthly_warning_sent").default(false),
  dailyWarningSent: boolean("daily_warning_sent").default(false),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, (table) => ({
  uniqueTrackingPeriod: unique().on(table.companyId, table.planId, table.provider, table.usageYear, table.usageMonth, table.usageDate)
}));

export const planAiBillingEvents = pgTable("plan_ai_billing_events", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  planId: integer("plan_id").notNull().references(() => plans.id, { onDelete: 'cascade' }),
  provider: text("provider").notNull(),

  eventType: text("event_type").notNull(),
  eventData: jsonb("event_data").notNull().default('{}'),

  tokensConsumed: integer("tokens_consumed").default(0),
  costAmount: numeric("cost_amount", { precision: 10, scale: 6 }).default("0.000000"),
  billingPeriodStart: date("billing_period_start"),
  billingPeriodEnd: date("billing_period_end"),

  processed: boolean("processed").default(false),
  processedAt: timestamp("processed_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),

  metadata: jsonb("metadata").default('{}')
});

export const insertPlanSchema = createInsertSchema(plans).pick({
  name: true,
  description: true,
  price: true,
  maxUsers: true,
  maxContacts: true,
  maxChannels: true,
  maxFlows: true,
  maxCampaigns: true,
  maxCampaignRecipients: true,
  campaignFeatures: true,
  isActive: true,
  isFree: true,
  hasTrialPeriod: true,
  trialDays: true,
  features: true,
  billingInterval: true,
  customDurationDays: true,
  gracePeriodDays: true,
  maxDunningAttempts: true,
  softLimitPercentage: true,
  allowPausing: true,
  pauseMaxDays: true,
  aiTokensIncluded: true,
  aiTokensMonthlyLimit: true,
  aiTokensDailyLimit: true,
  aiOverageEnabled: true,
  aiOverageRate: true,
  aiOverageBlockEnabled: true,
  aiBillingEnabled: true,
  discountType: true,
  discountValue: true,
  discountDuration: true,
  discountStartDate: true,
  discountEndDate: true,
  originalPrice: true,
  storageLimit: true,
  bandwidthLimit: true,
  fileUploadLimit: true,
  totalFilesLimit: true
});

export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: jsonb("value").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const insertAppSettingsSchema = createInsertSchema(appSettings).pick({
  key: true,
  value: true
});

export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  token: text("token").notNull(), // 6-digit verification code
  registrationData: jsonb("registration_data").notNull(), // Stores full registration payload
  expiresAt: timestamp("expires_at").notNull(),
  verified: boolean("verified").default(false),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, (table) => ({
  emailIdx: index("idx_email_verification_tokens_email").on(table.email),
  tokenIdx: index("idx_email_verification_tokens_token").on(table.token),
  expiresAtIdx: index("idx_email_verification_tokens_expires_at").on(table.expiresAt),
  verifiedIdx: index("idx_email_verification_tokens_verified").on(table.verified)
}));

export const insertEmailVerificationTokenSchema = createInsertSchema(emailVerificationTokens).pick({
  email: true,
  token: true,
  registrationData: true,
  expiresAt: true
});

export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type InsertEmailVerificationToken = z.infer<typeof insertEmailVerificationTokenSchema>;

export const companySettings = pgTable("company_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  key: text("key").notNull(),
  value: jsonb("value").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const companyCustomFields = pgTable("company_custom_fields", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  entity: text("entity", { enum: ['deal', 'contact', 'company'] }).notNull(),
  fieldName: text("field_name").notNull(),
  fieldType: text("field_type", { enum: ['text', 'number', 'select', 'multi_select', 'date', 'boolean'] }).notNull(),
  fieldLabel: text("field_label").notNull(),
  options: jsonb("options"),
  required: boolean("required").default(false),
  displayOrder: integer("display_order").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const companySettingsUniqueIndex = unique("company_settings_company_key_unique").on(companySettings.companyId, companySettings.key);

export const insertCompanySettingsSchema = createInsertSchema(companySettings).pick({
  companyId: true,
  key: true,
  value: true
});

export const insertWhatsappProxyServerSchema = createInsertSchema(whatsappProxyServers).pick({
  companyId: true,
  name: true,
  enabled: true,
  type: true,
  host: true,
  port: true,
  username: true,
  password: true,
  testStatus: true,
  lastTested: true,
  description: true
});

export type WhatsappProxyServer = typeof whatsappProxyServers.$inferSelect;
export type InsertWhatsappProxyServer = z.infer<typeof insertWhatsappProxyServerSchema>;

export const languages = pgTable("languages", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  nativeName: text("native_name").notNull(),
  flagIcon: text("flag_icon"),
  isActive: boolean("is_active").default(true),
  isDefault: boolean("is_default").default(false),
  direction: text("direction").default("ltr"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const insertLanguageSchema = createInsertSchema(languages).pick({
  code: true,
  name: true,
  nativeName: true,
  flagIcon: true,
  isActive: true,
  isDefault: true,
  direction: true
});

export const translationNamespaces = pgTable("translation_namespaces", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const insertNamespaceSchema = createInsertSchema(translationNamespaces).pick({
  name: true,
  description: true
});

export const translationKeys = pgTable("translation_keys", {
  id: serial("id").primaryKey(),
  namespaceId: integer("namespace_id").references(() => translationNamespaces.id),
  key: text("key").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const insertKeySchema = createInsertSchema(translationKeys).pick({
  namespaceId: true,
  key: true,
  description: true
});

export const translations = pgTable("translations", {
  id: serial("id").primaryKey(),
  keyId: integer("key_id").notNull().references(() => translationKeys.id),
  languageId: integer("language_id").notNull().references(() => languages.id),
  value: text("value").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const insertTranslationSchema = createInsertSchema(translations).pick({
  keyId: true,
  languageId: true,
  value: true
});

export const paymentTransactions = pgTable("payment_transactions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  planId: integer("plan_id").references(() => plans.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  status: text("status", { enum: ['pending', 'completed', 'failed', 'refunded', 'cancelled'] }).notNull().default('pending'),
  paymentMethod: paymentMethodEnum("payment_method").notNull(),
  paymentIntentId: text("payment_intent_id"),
  externalTransactionId: text("external_transaction_id"),
  receiptUrl: text("receipt_url"),
  metadata: jsonb("metadata"),
  isRecurring: boolean("is_recurring").default(false),
  subscriptionPeriodStart: timestamp("subscription_period_start"),
  subscriptionPeriodEnd: timestamp("subscription_period_end"),
  prorationAmount: numeric("proration_amount", { precision: 10, scale: 2 }).default("0"),
  dunningAttempt: integer("dunning_attempt").default(0),

  originalAmount: numeric("original_amount", { precision: 10, scale: 2 }),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).default("0"),
  couponCodeId: integer("coupon_code_id").references(() => couponCodes.id, { onDelete: "set null" }),
  affiliateCreditApplied: numeric("affiliate_credit_applied", { precision: 10, scale: 2 }).default("0"),
  discountDetails: jsonb("discount_details").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, (table) => ({
  paymentTransactionsExternalTxUnique: uniqueIndex("payment_transactions_external_tx_unique")
    .on(table.externalTransactionId)
    .where(sql`${table.externalTransactionId} IS NOT NULL AND ${table.externalTransactionId} <> ''`)
}));

export const insertPaymentTransactionSchema = createInsertSchema(paymentTransactions).pick({
  companyId: true,
  planId: true,
  amount: true,
  currency: true,
  status: true,
  paymentMethod: true,
  paymentIntentId: true,
  externalTransactionId: true,
  receiptUrl: true,
  metadata: true,
  isRecurring: true,
  subscriptionPeriodStart: true,
  subscriptionPeriodEnd: true,
  prorationAmount: true,
  dunningAttempt: true,
  originalAmount: true,
  discountAmount: true,
  couponCodeId: true,
  affiliateCreditApplied: true,
  discountDetails: true
});



export const affiliateStatusEnum = pgEnum("affiliate_status", ["pending", "active", "suspended", "rejected"]);
export const affiliateApplicationStatusEnum = pgEnum("affiliate_application_status", ["pending", "approved", "rejected", "under_review"]);
export const commissionTypeEnum = pgEnum("commission_type", ["percentage", "fixed", "tiered"]);
export const payoutStatusEnum = pgEnum("payout_status", ["pending", "processing", "completed", "failed", "cancelled"]);
export const referralStatusEnum = pgEnum("referral_status", ["pending", "converted", "expired", "cancelled"]);

export const affiliateApplications = pgTable("affiliate_applications", {
  id: serial("id").primaryKey(),


  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),


  company: text("company"),
  website: text("website"),
  country: text("country").notNull(),


  marketingChannels: text("marketing_channels").array().notNull(),
  expectedMonthlyReferrals: text("expected_monthly_referrals").notNull(),
  experience: text("experience").notNull(),
  motivation: text("motivation").notNull(),


  status: affiliateApplicationStatusEnum("status").notNull().default("pending"),
  agreeToTerms: boolean("agree_to_terms").notNull().default(false),


  reviewedBy: integer("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  rejectionReason: text("rejection_reason"),


  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const affiliates = pgTable("affiliates", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),


  affiliateCode: text("affiliate_code").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  website: text("website"),


  status: affiliateStatusEnum("status").notNull().default("pending"),
  approvedBy: integer("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),


  defaultCommissionRate: numeric("default_commission_rate", { precision: 5, scale: 2 }).default("0.00"),
  commissionType: commissionTypeEnum("commission_type").default("percentage"),


  businessName: text("business_name"),
  taxId: text("tax_id"),
  address: jsonb("address"),


  paymentDetails: jsonb("payment_details"),


  totalReferrals: integer("total_referrals").default(0),
  successfulReferrals: integer("successful_referrals").default(0),
  totalEarnings: numeric("total_earnings", { precision: 12, scale: 2 }).default("0.00"),
  pendingEarnings: numeric("pending_earnings", { precision: 12, scale: 2 }).default("0.00"),
  paidEarnings: numeric("paid_earnings", { precision: 12, scale: 2 }).default("0.00"),


  notes: text("notes"),
  metadata: jsonb("metadata").default('{}'),
  isActive: boolean("is_active").default(true),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const affiliateCommissionStructures = pgTable("affiliate_commission_structures", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
  affiliateId: integer("affiliate_id").references(() => affiliates.id, { onDelete: "cascade" }),
  planId: integer("plan_id").references(() => plans.id, { onDelete: "cascade" }),


  name: text("name").notNull(),
  commissionType: commissionTypeEnum("commission_type").notNull().default("percentage"),
  commissionValue: numeric("commission_value", { precision: 10, scale: 2 }).notNull(),


  tierRules: jsonb("tier_rules"),


  minimumPayout: numeric("minimum_payout", { precision: 10, scale: 2 }).default("0.00"),
  maximumPayout: numeric("maximum_payout", { precision: 10, scale: 2 }),
  recurringCommission: boolean("recurring_commission").default(false),
  recurringMonths: integer("recurring_months").default(0),


  validFrom: timestamp("valid_from").defaultNow(),
  validUntil: timestamp("valid_until"),

  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const affiliateReferrals = pgTable("affiliate_referrals", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
  affiliateId: integer("affiliate_id").references(() => affiliates.id, { onDelete: "cascade" }),


  referralCode: text("referral_code").notNull(),
  referredCompanyId: integer("referred_company_id").references(() => companies.id, { onDelete: "set null" }),
  referredUserId: integer("referred_user_id").references(() => users.id, { onDelete: "set null" }),
  referredEmail: text("referred_email"),


  status: referralStatusEnum("status").notNull().default("pending"),
  convertedAt: timestamp("converted_at"),
  conversionValue: numeric("conversion_value", { precision: 12, scale: 2 }).default("0.00"),


  commissionStructureId: integer("commission_structure_id").references(() => affiliateCommissionStructures.id, { onDelete: "set null" }),
  commissionAmount: numeric("commission_amount", { precision: 12, scale: 2 }).default("0.00"),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).default("0.00"),


  sourceUrl: text("source_url"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  utmContent: text("utm_content"),
  utmTerm: text("utm_term"),


  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  countryCode: text("country_code"),


  expiresAt: timestamp("expires_at"),


  metadata: jsonb("metadata").default('{}'),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const affiliatePayouts = pgTable("affiliate_payouts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
  affiliateId: integer("affiliate_id").references(() => affiliates.id, { onDelete: "cascade" }),


  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  status: payoutStatusEnum("status").notNull().default("pending"),


  paymentMethod: text("payment_method"),
  paymentReference: text("payment_reference"),
  externalTransactionId: text("external_transaction_id"),


  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),


  processedBy: integer("processed_by").references(() => users.id, { onDelete: "set null" }),
  processedAt: timestamp("processed_at"),
  failureReason: text("failure_reason"),


  referralIds: integer("referral_ids").array(),


  notes: text("notes"),
  metadata: jsonb("metadata").default('{}'),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const affiliateAnalytics = pgTable("affiliate_analytics", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
  affiliateId: integer("affiliate_id").references(() => affiliates.id, { onDelete: "cascade" }),


  date: date("date").notNull(),
  periodType: text("period_type").notNull().default("daily"),


  clicks: integer("clicks").default(0),
  uniqueClicks: integer("unique_clicks").default(0),
  impressions: integer("impressions").default(0),


  referrals: integer("referrals").default(0),
  conversions: integer("conversions").default(0),
  conversionRate: numeric("conversion_rate", { precision: 5, scale: 2 }).default("0.00"),


  revenue: numeric("revenue", { precision: 12, scale: 2 }).default("0.00"),
  commissionEarned: numeric("commission_earned", { precision: 12, scale: 2 }).default("0.00"),
  averageOrderValue: numeric("average_order_value", { precision: 10, scale: 2 }).default("0.00"),


  topCountries: jsonb("top_countries").default('[]'),


  topSources: jsonb("top_sources").default('[]'),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const affiliateClicks = pgTable("affiliate_clicks", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
  affiliateId: integer("affiliate_id").references(() => affiliates.id, { onDelete: "cascade" }),
  referralId: integer("referral_id").references(() => affiliateReferrals.id, { onDelete: "set null" }),


  clickedUrl: text("clicked_url").notNull(),
  landingPage: text("landing_page"),


  sessionId: text("session_id"),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  countryCode: text("country_code"),
  city: text("city"),


  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  utmContent: text("utm_content"),
  utmTerm: text("utm_term"),


  referrerUrl: text("referrer_url"),
  referrerDomain: text("referrer_domain"),


  deviceType: text("device_type"),
  browser: text("browser"),
  os: text("os"),


  converted: boolean("converted").default(false),
  convertedAt: timestamp("converted_at"),

  createdAt: timestamp("created_at").notNull().defaultNow()
});

export const affiliateRelationships = pgTable("affiliate_relationships", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
  parentAffiliateId: integer("parent_affiliate_id").references(() => affiliates.id, { onDelete: "cascade" }),
  childAffiliateId: integer("child_affiliate_id").references(() => affiliates.id, { onDelete: "cascade" }),


  level: integer("level").notNull().default(1),
  commissionPercentage: numeric("commission_percentage", { precision: 5, scale: 2 }).default("0.00"),


  isActive: boolean("is_active").default(true),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});


export const insertAffiliateApplicationSchema = createInsertSchema(affiliateApplications).pick({
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  company: true,
  website: true,
  country: true,
  marketingChannels: true,
  expectedMonthlyReferrals: true,
  experience: true,
  motivation: true,
  status: true,
  agreeToTerms: true,
  reviewedBy: true,
  reviewedAt: true,
  reviewNotes: true,
  rejectionReason: true,
  submittedAt: true
});

export const insertAffiliateSchema = createInsertSchema(affiliates).pick({
  companyId: true,
  userId: true,
  affiliateCode: true,
  name: true,
  email: true,
  phone: true,
  website: true,
  status: true,
  approvedBy: true,
  approvedAt: true,
  rejectionReason: true,
  defaultCommissionRate: true,
  commissionType: true,
  businessName: true,
  taxId: true,
  address: true,
  paymentDetails: true,
  notes: true,
  metadata: true,
  isActive: true
});

export const insertAffiliateCommissionStructureSchema = createInsertSchema(affiliateCommissionStructures).pick({
  companyId: true,
  affiliateId: true,
  planId: true,
  name: true,
  commissionType: true,
  commissionValue: true,
  tierRules: true,
  minimumPayout: true,
  maximumPayout: true,
  recurringCommission: true,
  recurringMonths: true,
  validFrom: true,
  validUntil: true,
  isActive: true
});

export const insertAffiliateReferralSchema = createInsertSchema(affiliateReferrals).pick({
  companyId: true,
  affiliateId: true,
  referralCode: true,
  referredCompanyId: true,
  referredUserId: true,
  referredEmail: true,
  status: true,
  convertedAt: true,
  conversionValue: true,
  commissionStructureId: true,
  commissionAmount: true,
  commissionRate: true,
  sourceUrl: true,
  utmSource: true,
  utmMedium: true,
  utmCampaign: true,
  utmContent: true,
  utmTerm: true,
  userAgent: true,
  ipAddress: true,
  countryCode: true,
  expiresAt: true,
  metadata: true
});

export const insertAffiliatePayoutSchema = createInsertSchema(affiliatePayouts).pick({
  companyId: true,
  affiliateId: true,
  amount: true,
  currency: true,
  status: true,
  paymentMethod: true,
  paymentReference: true,
  externalTransactionId: true,
  periodStart: true,
  periodEnd: true,
  processedBy: true,
  processedAt: true,
  failureReason: true,
  referralIds: true,
  notes: true,
  metadata: true
});

export const insertAffiliateAnalyticsSchema = createInsertSchema(affiliateAnalytics).pick({
  affiliateId: true,
  date: true,
  periodType: true,
  clicks: true,
  uniqueClicks: true,
  impressions: true,
  referrals: true,
  conversions: true,
  conversionRate: true,
  revenue: true,
  commissionEarned: true,
  averageOrderValue: true,
  topCountries: true,
  topSources: true
});

export const insertAffiliateClickSchema = createInsertSchema(affiliateClicks).pick({
  companyId: true,
  affiliateId: true,
  referralId: true,
  clickedUrl: true,
  landingPage: true,
  sessionId: true,
  userAgent: true,
  ipAddress: true,
  countryCode: true,
  city: true,
  utmSource: true,
  utmMedium: true,
  utmCampaign: true,
  utmContent: true,
  utmTerm: true,
  referrerUrl: true,
  referrerDomain: true,
  deviceType: true,
  browser: true,
  os: true,
  converted: true,
  convertedAt: true
});

export const insertAffiliateRelationshipSchema = createInsertSchema(affiliateRelationships).pick({
  companyId: true,
  parentAffiliateId: true,
  childAffiliateId: true,
  level: true,
  commissionPercentage: true,
  isActive: true
});

export type AffiliateRelationship = typeof affiliateRelationships.$inferSelect;
export type InsertAffiliateRelationship = z.infer<typeof insertAffiliateRelationshipSchema>;


export const couponCodes = pgTable("coupon_codes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }), // NULL for global coupons


  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),


  discountType: text("discount_type", { enum: ['percentage', 'fixed_amount'] }).notNull(),
  discountValue: numeric("discount_value", { precision: 10, scale: 2 }).notNull(),


  usageLimit: integer("usage_limit"), // NULL for unlimited
  usageLimitPerUser: integer("usage_limit_per_user").default(1),
  currentUsageCount: integer("current_usage_count").default(0),


  startDate: timestamp("start_date").notNull().defaultNow(),
  endDate: timestamp("end_date"),


  applicablePlanIds: integer("applicable_plan_ids").array(), // NULL for all plans
  minimumPlanValue: numeric("minimum_plan_value", { precision: 10, scale: 2 }), // Minimum plan price to apply coupon


  isActive: boolean("is_active").default(true),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  metadata: jsonb("metadata").default({}),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const insertCouponCodeSchema = createInsertSchema(couponCodes).pick({
  companyId: true,
  code: true,
  name: true,
  description: true,
  discountType: true,
  discountValue: true,
  usageLimit: true,
  usageLimitPerUser: true,
  startDate: true,
  endDate: true,
  applicablePlanIds: true,
  minimumPlanValue: true,
  isActive: true,
  createdBy: true,
  metadata: true
});

export type CouponCode = typeof couponCodes.$inferSelect;
export type InsertCouponCode = z.infer<typeof insertCouponCodeSchema>;

export const couponUsage = pgTable("coupon_usage", {
  id: serial("id").primaryKey(),
  couponId: integer("coupon_id").references(() => couponCodes.id, { onDelete: "cascade" }),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),


  planId: integer("plan_id").references(() => plans.id, { onDelete: "set null" }),
  originalAmount: numeric("original_amount", { precision: 10, scale: 2 }).notNull(),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull(),
  finalAmount: numeric("final_amount", { precision: 10, scale: 2 }).notNull(),


  paymentTransactionId: integer("payment_transaction_id").references(() => paymentTransactions.id, { onDelete: "set null" }),


  usageContext: jsonb("usage_context").default({}),

  createdAt: timestamp("created_at").notNull().defaultNow()
});

export const insertCouponUsageSchema = createInsertSchema(couponUsage).pick({
  couponId: true,
  companyId: true,
  userId: true,
  planId: true,
  originalAmount: true,
  discountAmount: true,
  finalAmount: true,
  paymentTransactionId: true,
  usageContext: true
});

export type CouponUsage = typeof couponUsage.$inferSelect;
export type InsertCouponUsage = z.infer<typeof insertCouponUsageSchema>;


export const affiliateEarningsBalance = pgTable("affiliate_earnings_balance", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
  affiliateId: integer("affiliate_id").references(() => affiliates.id, { onDelete: "cascade" }),


  totalEarned: numeric("total_earned", { precision: 12, scale: 2 }).default("0.00"),
  availableBalance: numeric("available_balance", { precision: 12, scale: 2 }).default("0.00"), // Available for plan credits
  appliedToPlans: numeric("applied_to_plans", { precision: 12, scale: 2 }).default("0.00"), // Used for plan purchases
  pendingPayout: numeric("pending_payout", { precision: 12, scale: 2 }).default("0.00"), // Scheduled for payout
  paidOut: numeric("paid_out", { precision: 12, scale: 2 }).default("0.00"), // Already paid out


  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow()
}, (table) => ({
  uniqueCompanyAffiliate: unique().on(table.companyId, table.affiliateId)
}));

export const insertAffiliateEarningsBalanceSchema = createInsertSchema(affiliateEarningsBalance).pick({
  companyId: true,
  affiliateId: true,
  totalEarned: true,
  availableBalance: true,
  appliedToPlans: true,
  pendingPayout: true,
  paidOut: true
});

export type AffiliateEarningsBalance = typeof affiliateEarningsBalance.$inferSelect;
export type InsertAffiliateEarningsBalance = z.infer<typeof insertAffiliateEarningsBalanceSchema>;

export const affiliateEarningsTransactions = pgTable("affiliate_earnings_transactions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }),
  affiliateId: integer("affiliate_id").references(() => affiliates.id, { onDelete: "cascade" }),


  transactionType: text("transaction_type", { enum: ['earned', 'applied_to_plan', 'payout', 'adjustment'] }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  balanceAfter: numeric("balance_after", { precision: 12, scale: 2 }).notNull(),


  referralId: integer("referral_id").references(() => affiliateReferrals.id, { onDelete: "set null" }),
  paymentTransactionId: integer("payment_transaction_id").references(() => paymentTransactions.id, { onDelete: "set null" }),
  payoutId: integer("payout_id").references(() => affiliatePayouts.id, { onDelete: "set null" }),


  description: text("description"),
  metadata: jsonb("metadata").default({}),

  createdAt: timestamp("created_at").notNull().defaultNow()
});

export const insertAffiliateEarningsTransactionSchema = createInsertSchema(affiliateEarningsTransactions).pick({
  companyId: true,
  affiliateId: true,
  transactionType: true,
  amount: true,
  balanceAfter: true,
  referralId: true,
  paymentTransactionId: true,
  payoutId: true,
  description: true,
  metadata: true
});

export type AffiliateEarningsTransaction = typeof affiliateEarningsTransactions.$inferSelect;
export type InsertAffiliateEarningsTransaction = z.infer<typeof insertAffiliateEarningsTransactionSchema>;

export const deals = pgTable("deals", {
  id: serial("id").primaryKey(),
  pipelineId: integer("pipeline_id").notNull().references(() => pipelines.id, { onDelete: 'restrict' }),
  companyId: integer("company_id").references(() => companies.id),
  contactId: integer("contact_id").notNull().references(() => contacts.id),
  title: text("title").notNull(),
  stageId: integer("stage_id").references(() => pipelineStages.id),
  stage: text("stage", {
    enum: ['lead', 'qualified', 'contacted', 'demo_scheduled', 'proposal', 'negotiation', 'closed_won', 'closed_lost']
  }).notNull().default('lead'),
  value: integer("value"),
  priority: text("priority", { enum: ['low', 'medium', 'high'] }).default('medium'),
  dueDate: timestamp("due_date"),
  assignedToUserId: integer("assigned_to_user_id").references(() => users.id),
  description: text("description"),
  tags: text("tags").array(),
  customFields: jsonb("custom_fields").default('{}'),
  status: text("status").default('active'),
  lastActivityAt: timestamp("last_activity_at").defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, (table) => [
  index("idx_deals_company_pipeline_status").on(table.companyId, table.pipelineId, table.status),
  index("idx_deals_company_pipeline_stage").on(table.companyId, table.pipelineId, table.stageId),
]);

export const insertDealSchema = createInsertSchema(deals).pick({
  pipelineId: true,
  companyId: true,
  contactId: true,
  title: true,
  stageId: true,
  stage: true,
  value: true,
  priority: true,
  dueDate: true,
  assignedToUserId: true,
  description: true,
  tags: true,
  customFields: true,
  status: true,
  lastActivityAt: true
});

export const dealActivities = pgTable("deal_activities", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").notNull().references(() => deals.id),
  userId: integer("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow()
});

export const insertDealActivitySchema = createInsertSchema(dealActivities).pick({
  dealId: true,
  userId: true,
  type: true,
  content: true,
  metadata: true
});

export type DealAutomationTriggerType =
  | 'agent_first_response'
  | 'agent_message_sent'
  | 'contact_message_received'
  | 'deal_stage_entered'
  | 'deal_inactive_for';

export interface DealAutomationConditions {
  pipelineId?: number;
  stageIds?: number[];
  dealStatus?: 'active';
  assignedUserRequired?: boolean;
  inactiveDays?: number;
}

export interface DealAutomationAction {
  type: 'move_to_stage' | 'move_to_pipeline';
  pipelineId?: number;
  stageId: number;
  [key: string]: any;
}

export const dealAutomationRules = pgTable("deal_automation_rules", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  triggerType: text("trigger_type").notNull().$type<DealAutomationTriggerType>(),
  conditions: jsonb("conditions").$type<DealAutomationConditions>(),
  action: jsonb("action").notNull().$type<DealAutomationAction>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, (table) => [
  index("idx_deal_automation_rules_company_enabled_priority").on(table.companyId, table.enabled, table.priority),
]);

export const insertDealAutomationRuleSchema = createInsertSchema(dealAutomationRules).pick({
  companyId: true,
  name: true,
  enabled: true,
  priority: true,
  triggerType: true,
  conditions: true,
  action: true
});

export const pipelineStageRevertStatusEnum = pgEnum('pipeline_stage_revert_status', ['scheduled', 'executed', 'cancelled', 'failed', 'skipped']);
export const pipelineStageRevertLogStatusEnum = pgEnum('pipeline_stage_revert_log_status', ['success', 'failed', 'skipped']);

export const pipelineStageReverts = pgTable("pipeline_stage_reverts", {
  id: serial("id").primaryKey(),
  scheduleId: text("schedule_id").notNull().unique(),
  pipelineId: integer("pipeline_id").references(() => pipelines.id, { onDelete: 'cascade' }),
  companyId: integer("company_id").references(() => companies.id, { onDelete: 'cascade' }),
  dealId: integer("deal_id").notNull().references(() => deals.id, { onDelete: 'cascade' }),
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  flowId: integer("flow_id").references(() => flows.id, { onDelete: 'set null' }),
  nodeId: text("node_id").notNull(),
  currentStageId: integer("current_stage_id").references(() => pipelineStages.id, { onDelete: 'set null' }),
  revertToStageId: integer("revert_to_stage_id").references(() => pipelineStages.id, { onDelete: 'set null' }),
  scheduledFor: timestamp("scheduled_for").notNull(),
  revertTimeAmount: integer("revert_time_amount").notNull(),
  revertTimeUnit: text("revert_time_unit", { enum: ['hours', 'days'] }).notNull(),
  onlyIfNoActivity: boolean("only_if_no_activity").default(false),
  status: pipelineStageRevertStatusEnum("status").notNull().default('scheduled'),
  executedAt: timestamp("executed_at"),
  failedReason: text("failed_reason"),
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),
  metadata: jsonb("metadata").default('{}'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, (table) => [
  index("idx_psr_company_deal_status").on(table.companyId, table.dealId, table.status),
]);

export const insertPipelineStageRevertSchema = createInsertSchema(pipelineStageReverts).pick({
  scheduleId: true,
  pipelineId: true,
  companyId: true,
  dealId: true,
  contactId: true,
  flowId: true,
  nodeId: true,
  currentStageId: true,
  revertToStageId: true,
  scheduledFor: true,
  revertTimeAmount: true,
  revertTimeUnit: true,
  onlyIfNoActivity: true,
  status: true,
  retryCount: true,
  maxRetries: true,
  metadata: true
});

export const pipelineStageRevertLogs = pgTable("pipeline_stage_revert_logs", {
  id: serial("id").primaryKey(),
  scheduleId: text("schedule_id").notNull().references(() => pipelineStageReverts.scheduleId, { onDelete: 'cascade' }),
  executionAttempt: integer("execution_attempt").notNull(),
  status: pipelineStageRevertLogStatusEnum("status").notNull(),
  errorMessage: text("error_message"),
  executionDurationMs: integer("execution_duration_ms"),
  previousStageId: integer("previous_stage_id").references(() => pipelineStages.id, { onDelete: 'set null' }),
  newStageId: integer("new_stage_id").references(() => pipelineStages.id, { onDelete: 'set null' }),
  activityCheckResult: boolean("activity_check_result"),
  createdAt: timestamp("created_at").notNull().defaultNow()
});

export const insertPipelineStageRevertLogSchema = createInsertSchema(pipelineStageRevertLogs).pick({
  scheduleId: true,
  executionAttempt: true,
  status: true,
  errorMessage: true,
  executionDurationMs: true,
  previousStageId: true,
  newStageId: true,
  activityCheckResult: true
});

export const updateStatus = pgEnum('update_status', ['pending', 'downloading', 'validating', 'applying', 'completed', 'failed', 'rolled_back']);

export const systemUpdates = pgTable("system_updates", {
  id: serial("id").primaryKey(),
  version: text("version").notNull(),
  releaseNotes: text("release_notes"),
  downloadUrl: text("download_url").notNull(),
  packageHash: text("package_hash"),
  packageSize: integer("package_size"),
  status: updateStatus("status").notNull().default('pending'),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  rollbackData: jsonb("rollback_data"),
  migrationScripts: jsonb("migration_scripts").default('[]'),
  backupPath: text("backup_path"),
  progressPercentage: integer("progress_percentage").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});



export const insertSystemUpdateSchema = createInsertSchema(systemUpdates).pick({
  version: true,
  releaseNotes: true,
  downloadUrl: true,
  packageHash: true,
  packageSize: true,
  status: true,
  scheduledAt: true,
  startedAt: true,
  completedAt: true,
  errorMessage: true,
  rollbackData: true,
  migrationScripts: true,
  backupPath: true,
  progressPercentage: true
});



export type Deal = typeof deals.$inferSelect;
export type InsertDeal = z.infer<typeof insertDealSchema>;
export type DealActivity = typeof dealActivities.$inferSelect;
export type InsertDealActivity = z.infer<typeof insertDealActivitySchema>;
export type DealAutomationRule = typeof dealAutomationRules.$inferSelect;
export type InsertDealAutomationRule = z.infer<typeof insertDealAutomationRuleSchema>;
export type DealStatus = z.infer<typeof dealStatusTypes>;
export type DealPriority = z.infer<typeof dealPriorityTypes>;
export type Pipeline = typeof pipelines.$inferSelect;
export type InsertPipeline = z.infer<typeof insertPipelineSchema>;
export type PipelineAgentAssignment = typeof pipelineAgentAssignments.$inferSelect;
export type InsertPipelineAgentAssignment = z.infer<typeof insertPipelineAgentAssignmentSchema>;
export type PipelineStage = typeof pipelineStages.$inferSelect;
export type InsertPipelineStage = z.infer<typeof insertPipelineStageSchema>;
export type PipelineStageRevert = typeof pipelineStageReverts.$inferSelect;
export type InsertPipelineStageRevert = z.infer<typeof insertPipelineStageRevertSchema>;
export type PipelineStageRevertLog = typeof pipelineStageRevertLogs.$inferSelect;
export type InsertPipelineStageRevertLog = z.infer<typeof insertPipelineStageRevertLogSchema>;

/** Contact fields exposed on the pipeline board (phone/identifier masked when required). */
export type PipelineBoardContactSummary = Pick<
  Contact,
  'id' | 'name' | 'avatarUrl' | 'identifierType'
> & {
  tags?: string[] | null;
  customFields?: Record<string, unknown> | null;
  phone?: string | null;
  identifier?: string | null;
};

/** Safe assigned-user / team-member shape for pipeline board cards and bulk actions. */
export type PipelineBoardUserSummary = Pick<
  User,
  'id' | 'username' | 'fullName' | 'email' | 'avatarUrl' | 'role' | 'active'
>;

/** Scheduled revert fields needed by deal cards on the board. */
export type PipelineBoardScheduledRevertSummary = Pick<
  PipelineStageRevert,
  | 'scheduleId'
  | 'dealId'
  | 'status'
  | 'scheduledFor'
  | 'revertToStageId'
  | 'onlyIfNoActivity'
  | 'createdAt'
>;

/** Per-stage aggregate stats for pipeline column headers (independent of loaded cards). */
export type PipelineBoardStageSummary = {
  totalCount: number;
  totalValue: number;
  avgValue: number;
  avgDaysInStage: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
};

/** Pagination cursor for a single pipeline stage column. */
export type PipelineBoardStagePagination = {
  offset: number;
  limit: number;
  hasMore: boolean;
  totalCount: number;
};

/** Default number of deals loaded per stage on initial board fetch. */
export const PIPELINE_BOARD_DEFAULT_PER_STAGE_LIMIT = 30;

/** Filter parameters shared by deal list and pipeline board queries. */
export type DealsFilter = {
  companyId?: number;
  generalSearch?: string;
  pipelineId?: number;
  stageIds?: number[];
  priorities?: ('low' | 'medium' | 'high')[];
  minValue?: number;
  maxValue?: number;
  dueDateFrom?: string;
  dueDateTo?: string;
  assignedUserIds?: number[];
  includeUnassigned?: boolean;
  tags?: string[];
  status?: string;
  createdFrom?: string;
  createdTo?: string;
  customFields?: Record<string, { operator: 'equals' | 'contains' | 'gt' | 'lt' | 'inArray'; value: string | number | string[] }>;
  limit?: number;
  offset?: number;
};

/** Bulk read contract for the Kanban pipeline board. */
export type PipelineBoardResponse = {
  stages: PipelineStage[];
  /** Deals grouped by stage id; only loaded windows are present. */
  dealsByStageId: Record<number, Deal[]>;
  /** Aggregate stats per stage for headers without loading every deal. */
  stageSummaries: Record<number, PipelineBoardStageSummary>;
  /** Per-stage pagination state for load-more / scroll windows. */
  stagePagination: Record<number, PipelineBoardStagePagination>;
  contactsById: Record<number, PipelineBoardContactSummary>;
  usersById: Record<number, PipelineBoardUserSummary>;
  scheduledRevertsByDealId: Record<number, PipelineBoardScheduledRevertSummary[]>;
  teamMembers: PipelineBoardUserSummary[];
};

export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = typeof appSettings.$inferInsert;

export type CompanySetting = typeof companySettings.$inferSelect;
export type InsertCompanySetting = typeof companySettings.$inferInsert;

export type Website = typeof websites.$inferSelect;
export type InsertWebsite = typeof websites.$inferInsert;



export type WebsiteAsset = typeof websiteAssets.$inferSelect;
export type InsertWebsiteAsset = typeof websiteAssets.$inferInsert;

export type SystemUpdate = typeof systemUpdates.$inferSelect;
export type InsertSystemUpdate = z.infer<typeof insertSystemUpdateSchema>;

export type UpdateStatus = typeof updateStatus.enumValues[number];

export const insertPlanAiProviderConfigSchema = createInsertSchema(planAiProviderConfigs).pick({
  planId: true,
  provider: true,
  tokensMonthlyLimit: true,
  tokensDailyLimit: true,
  customPricingEnabled: true,
  inputTokenRate: true,
  outputTokenRate: true,
  enabled: true,
  priority: true,
  metadata: true
});

export const insertPlanAiUsageTrackingSchema = createInsertSchema(planAiUsageTracking).pick({
  companyId: true,
  planId: true,
  provider: true,
  tokensUsedMonthly: true,
  tokensUsedDaily: true,
  requestsMonthly: true,
  requestsDaily: true,
  costMonthly: true,
  costDaily: true,
  overageTokensMonthly: true,
  overageCostMonthly: true,
  usageMonth: true,
  usageYear: true,
  usageDate: true,
  monthlyLimitReached: true,
  dailyLimitReached: true,
  monthlyWarningSent: true,
  dailyWarningSent: true
});

export const insertPlanAiBillingEventSchema = createInsertSchema(planAiBillingEvents).pick({
  companyId: true,
  planId: true,
  provider: true,
  eventType: true,
  eventData: true,
  tokensConsumed: true,
  costAmount: true,
  billingPeriodStart: true,
  billingPeriodEnd: true,
  processed: true,
  processedAt: true,
  metadata: true
});

export type Plan = typeof plans.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;

export type PlanAiProviderConfig = typeof planAiProviderConfigs.$inferSelect;
export type InsertPlanAiProviderConfig = z.infer<typeof insertPlanAiProviderConfigSchema>;

export type PlanAiUsageTracking = typeof planAiUsageTracking.$inferSelect;
export type InsertPlanAiUsageTracking = z.infer<typeof insertPlanAiUsageTrackingSchema>;

export type PlanAiBillingEvent = typeof planAiBillingEvents.$inferSelect;
export type InsertPlanAiBillingEvent = z.infer<typeof insertPlanAiBillingEventSchema>;

export type PaymentTransaction = typeof paymentTransactions.$inferSelect;
export type InsertPaymentTransaction = z.infer<typeof insertPaymentTransactionSchema>;

export type Language = typeof languages.$inferSelect;
export type InsertLanguage = z.infer<typeof insertLanguageSchema>;

export type TranslationNamespace = typeof translationNamespaces.$inferSelect;
export type InsertTranslationNamespace = z.infer<typeof insertNamespaceSchema>;

export type TranslationKey = typeof translationKeys.$inferSelect;
export type InsertTranslationKey = z.infer<typeof insertKeySchema>;

export type Translation = typeof translations.$inferSelect;
export type InsertTranslation = z.infer<typeof insertTranslationSchema>;

export type RolePermission = typeof rolePermissions.$inferSelect;
export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;
export type CompanyCustomRole = typeof companyCustomRoles.$inferSelect;
export type InsertCompanyCustomRole = z.infer<typeof insertCompanyCustomRoleSchema>;

export type CompanyPage = typeof companyPages.$inferSelect;
export type InsertCompanyPage = typeof companyPages.$inferInsert;
export type MediaFileOwnership = typeof mediaFileOwnership.$inferSelect;
export type InsertMediaFileOwnership = typeof mediaFileOwnership.$inferInsert;


export const campaignStatusTypes = z.enum([
  'draft',
  'scheduled',
  'running',
  'paused',
  'completed',
  'cancelled',
  'failed'
]);

export const campaignTypes = z.enum([
  'immediate',
  'scheduled',
  'drip',
  'recurring_daily'
]);

export const campaignRecipientStatusTypes = z.enum([
  'pending',
  'processing',
  'sent',
  'delivered',
  'read',
  'failed',
  'skipped'
]);

export const whatsappConnectionStatusTypes = z.enum([
  'connected',
  'disconnected',
  'connecting',
  'error',
  'banned'
]);

export const campaignTemplates = pgTable("campaign_templates", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  createdById: integer("created_by_id").notNull().references(() => users.id),
  connectionId: integer("connection_id").references(() => channelConnections.id), // WhatsApp connection used for this template
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").default("general"),
  whatsappTemplateCategory: text("whatsapp_template_category", { enum: ['marketing', 'utility', 'authentication'] }),
  whatsappTemplateStatus: text("whatsapp_template_status", { enum: ['pending', 'approved', 'rejected', 'disabled'] }).default('pending'),
  whatsappTemplateId: text("whatsapp_template_id"), // WhatsApp Business API template ID
  whatsappTemplateName: text("whatsapp_template_name"), // WhatsApp Business API template name
  whatsappTemplateLanguage: text("whatsapp_template_language").default('en'),
  content: text("content").notNull(),
  mediaUrls: jsonb("media_urls").default([]),
  mediaHandle: text("media_handle"), // WhatsApp media handle for template media (uploaded during template creation)
  variables: jsonb("variables").default([]),
  channelType: text("channel_type").notNull().default("whatsapp"),
  whatsappChannelType: text("whatsapp_channel_type", { enum: ['official', 'unofficial'] }).default('unofficial'),
  isActive: boolean("is_active").default(true),
  usageCount: integer("usage_count").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const quickReplyTemplates = pgTable("quick_reply_templates", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  createdById: integer("created_by_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  content: text("content").notNull(),
  category: text("category").default("general"),
  variables: jsonb("variables").default([]),
  isActive: boolean("is_active").default(true),
  usageCount: integer("usage_count").default(0),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const contactSegments = pgTable("contact_segments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  createdById: integer("created_by_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  criteria: jsonb("criteria").notNull(),
  contactCount: integer("contact_count").default(0),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  createdById: integer("created_by_id").notNull().references(() => users.id),
  templateId: integer("template_id").references(() => campaignTemplates.id),
  segmentId: integer("segment_id").references(() => contactSegments.id),
  pipelineStageIds: jsonb("pipeline_stage_ids").default([]),

  name: text("name").notNull(),
  description: text("description"),
  channelType: text("channel_type").notNull().default("whatsapp"),
  whatsappChannelType: text("whatsapp_channel_type", { enum: ['official', 'unofficial'] }).notNull().default('unofficial'),
  channelId: integer("channel_id").references(() => channelConnections.id),
  channelIds: jsonb("channel_ids").default([]),

  content: text("content").notNull(),
  mediaUrls: jsonb("media_urls").default([]),
  variables: jsonb("variables").default({}),

  campaignType: text("campaign_type", { enum: ['immediate', 'scheduled', 'drip', 'recurring_daily'] }).notNull().default('immediate'),
  scheduledAt: timestamp("scheduled_at"),
  timezone: text("timezone").default("UTC"),
  // Stores drip campaign settings or recurring_daily settings
  dripSettings: jsonb("drip_settings"),

  status: text("status", { enum: ['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled', 'failed'] }).notNull().default('draft'),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  pausedAt: timestamp("paused_at"),

  totalRecipients: integer("total_recipients").default(0),
  processedRecipients: integer("processed_recipients").default(0),
  successfulSends: integer("successful_sends").default(0),
  failedSends: integer("failed_sends").default(0),

  rateLimitSettings: jsonb("rate_limit_settings").default({
    messages_per_minute: 10,
    messages_per_hour: 200,
    messages_per_day: 1000,
    delay_between_messages: 6,
    random_delay_range: [3, 10],
    humanization_enabled: true
  }),

  complianceSettings: jsonb("compliance_settings").default({
    require_opt_out: true,
    spam_check_enabled: true,
    content_filter_enabled: true
  }),

  antiBanSettings: jsonb("anti_ban_settings").default({
    enabled: true,
    mode: "moderate",
    businessHoursOnly: false,
    respectWeekends: false,
    randomizeDelay: true,
    minDelay: 3,
    maxDelay: 15,
    accountRotation: true,
    cooldownPeriod: 30,
    messageVariation: false
  }),

  emailSubject: text("email_subject"),
  emailProvider: text("email_provider", { enum: ['smtp', 'ses'] }),
  sesConfigId: text("ses_config_id"),
  contentMode: text("content_mode"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const campaignRecipients = pgTable("campaign_recipients", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaigns.id),
  contactId: integer("contact_id").notNull().references(() => contacts.id),

  personalizedContent: text("personalized_content"),
  variables: jsonb("variables").default({}),

  status: text("status", { enum: ['pending', 'processing', 'sent', 'delivered', 'read', 'failed', 'skipped'] }).notNull().default('pending'),
  scheduledAt: timestamp("scheduled_at"),
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  readAt: timestamp("read_at"),
  failedAt: timestamp("failed_at"),

  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),

  externalMessageId: text("external_message_id"),
  conversationId: integer("conversation_id").references(() => conversations.id),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, (table) => ({
  uniqueCampaignContact: unique().on(table.campaignId, table.contactId)
}));

export const campaignMessages = pgTable("campaign_messages", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaigns.id),
  recipientId: integer("recipient_id").notNull().references(() => campaignRecipients.id),
  messageId: integer("message_id").references(() => messages.id),

  content: text("content").notNull(),
  mediaUrls: jsonb("media_urls").default([]),
  messageType: text("message_type").default("text"),

  status: text("status", { enum: ['pending', 'sent', 'delivered', 'read', 'failed'] }).notNull().default('pending'),
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  readAt: timestamp("read_at"),
  failedAt: timestamp("failed_at"),

  whatsappMessageId: text("whatsapp_message_id"),
  whatsappStatus: text("whatsapp_status"),

  errorCode: text("error_code"),
  errorMessage: text("error_message"),

  createdAt: timestamp("created_at").notNull().defaultNow()
});

export const campaignAnalytics = pgTable("campaign_analytics", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaigns.id),

  recordedAt: timestamp("recorded_at").notNull().defaultNow(),

  totalRecipients: integer("total_recipients").default(0),
  messagesSent: integer("messages_sent").default(0),
  messagesDelivered: integer("messages_delivered").default(0),
  messagesRead: integer("messages_read").default(0),
  messagesFailed: integer("messages_failed").default(0),

  deliveryRate: numeric("delivery_rate", { precision: 5, scale: 2 }).default("0.00"),
  readRate: numeric("read_rate", { precision: 5, scale: 2 }).default("0.00"),
  failureRate: numeric("failure_rate", { precision: 5, scale: 2 }).default("0.00"),

  avgDeliveryTime: integer("avg_delivery_time"),
  avgReadTime: integer("avg_read_time"),

  estimatedCost: numeric("estimated_cost", { precision: 10, scale: 4 }).default("0.0000"),

  metricsData: jsonb("metrics_data").default({})
});

export const whatsappAccounts = pgTable("whatsapp_accounts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  channelId: integer("channel_id").references(() => channelConnections.id),

  accountName: text("account_name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  accountType: text("account_type", { enum: ['official', 'unofficial'] }).notNull().default('unofficial'),

  sessionData: jsonb("session_data"),
  qrCode: text("qr_code"),
  connectionStatus: text("connection_status", { enum: ['connected', 'disconnected', 'connecting', 'error', 'banned'] }).default('disconnected'),

  lastActivityAt: timestamp("last_activity_at"),
  messageCountToday: integer("message_count_today").default(0),
  messageCountHour: integer("message_count_hour").default(0),
  warningCount: integer("warning_count").default(0),
  restrictionCount: integer("restriction_count").default(0),

  rateLimits: jsonb("rate_limits").default({
    max_messages_per_minute: 10,
    max_messages_per_hour: 200,
    max_messages_per_day: 1000,
    cooldown_period: 300,
    humanization_enabled: true
  }),

  healthScore: integer("health_score").default(100),
  lastHealthCheck: timestamp("last_health_check"),
  isActive: boolean("is_active").default(true),

  rotationGroup: text("rotation_group"),
  priority: integer("priority").default(1),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, (table) => ({
  uniqueCompanyPhone: unique().on(table.companyId, table.phoneNumber)
}));

export const whatsappAccountLogs = pgTable("whatsapp_account_logs", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => whatsappAccounts.id),

  eventType: text("event_type").notNull(),
  eventData: jsonb("event_data"),
  message: text("message"),

  severity: text("severity", { enum: ['info', 'warning', 'error', 'critical'] }).default('info'),

  messagesSentToday: integer("messages_sent_today").default(0),
  healthScore: integer("health_score").default(100),

  createdAt: timestamp("created_at").notNull().defaultNow()
});


export const scheduledMessageStatusEnum = pgEnum('scheduled_message_status', [
  'pending',
  'scheduled', 
  'processing',
  'sent',
  'failed',
  'cancelled'
]);


export const scheduledMessages = pgTable("scheduled_messages", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  conversationId: integer("conversation_id").notNull(),
  channelId: integer("channel_id").notNull(),
  channelType: text("channel_type").notNull(), // 'whatsapp', 'instagram', 'messenger', 'email', etc.
  

  content: text("content").notNull(),
  messageType: text("message_type").notNull().default('text'), // 'text', 'media', 'template', etc.
  mediaUrl: text("media_url"),
  mediaFilePath: text("media_file_path"), // Local file path for scheduled media
  mediaType: text("media_type"), // 'image', 'video', 'audio', 'document'
  caption: text("caption"),
  

  scheduledFor: timestamp("scheduled_for").notNull(),
  timezone: text("timezone").default('UTC'),
  

  status: scheduledMessageStatusEnum("status").default('pending'),
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(3),
  lastAttemptAt: timestamp("last_attempt_at"),
  sentAt: timestamp("sent_at"),
  failedAt: timestamp("failed_at"),
  errorMessage: text("error_message"),
  

  metadata: jsonb("metadata").default('{}'), // Additional data like quick replies, templates, etc.
  createdBy: integer("created_by").notNull(), // User who scheduled the message
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),

  processingLeaseExpiresAt: timestamp("processing_lease_expires_at"),
  processingClaimId: text("processing_claim_id")
});


export type ScheduledMessage = typeof scheduledMessages.$inferSelect;
export type InsertScheduledMessage = typeof scheduledMessages.$inferInsert;

export const campaignQueue = pgTable("campaign_queue", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaigns.id),
  recipientId: integer("recipient_id").notNull().references(() => campaignRecipients.id),
  accountId: integer("account_id").references(() => channelConnections.id),

  priority: integer("priority").default(1),
  scheduledFor: timestamp("scheduled_for").notNull(),
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(3),

  status: text("status", { enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'] }).notNull().default('pending'),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),

  errorMessage: text("error_message"),
  lastErrorAt: timestamp("last_error_at"),

  metadata: jsonb("metadata").default({}),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, (table) => ({
  /** Only one active (pending/processing) queue row per campaign+recipient; completed runs may insert again. */
  campaignQueueActiveCampaignRecipientUnique: uniqueIndex("campaign_queue_active_campaign_recipient_unique")
    .on(table.campaignId, table.recipientId)
    .where(sql`${table.status} IN ('pending', 'processing')`)
}));

export const insertCampaignTemplateSchema = createInsertSchema(campaignTemplates).pick({
  companyId: true,
  createdById: true,
  name: true,
  description: true,
  category: true,
  content: true,
  mediaUrls: true,
  variables: true,
  channelType: true,
  isActive: true
});

export const insertContactSegmentSchema = createInsertSchema(contactSegments).pick({
  companyId: true,
  createdById: true,
  name: true,
  description: true,
  criteria: true
});

export const insertCampaignSchema = createInsertSchema(campaigns).pick({
  companyId: true,
  createdById: true,
  templateId: true,
  segmentId: true,
  pipelineStageIds: true,
  name: true,
  description: true,
  channelType: true,
  channelId: true,
  channelIds: true,
  content: true,
  mediaUrls: true,
  variables: true,
  campaignType: true,
  scheduledAt: true,
  timezone: true,
  dripSettings: true,
  rateLimitSettings: true,
  complianceSettings: true,
  antiBanSettings: true,
  emailSubject: true,
  emailProvider: true,
  sesConfigId: true,
  contentMode: true
});

export const insertCampaignRecipientSchema = createInsertSchema(campaignRecipients).pick({
  campaignId: true,
  contactId: true,
  personalizedContent: true,
  variables: true,
  scheduledAt: true,
  maxRetries: true
});

export const insertWhatsappAccountSchema = createInsertSchema(whatsappAccounts).pick({
  companyId: true,
  channelId: true,
  accountName: true,
  phoneNumber: true,
  accountType: true,
  rateLimits: true,
  rotationGroup: true,
  priority: true
});

export type CampaignTemplate = typeof campaignTemplates.$inferSelect;
export type InsertCampaignTemplate = z.infer<typeof insertCampaignTemplateSchema>;

export type ContactSegment = typeof contactSegments.$inferSelect;
export type InsertContactSegment = z.infer<typeof insertContactSegmentSchema>;

/**
 * Shared TypeScript type for segment filter criteria.
 * 
 * This type defines the structure of criteria used in contact segments.
 * All fields are optional, allowing flexible filtering combinations.
 * 
 * Fields:
 * - tags: Array of tag strings that contacts must have (AND logic)
 * - created_after: ISO date string for filtering contacts created after this date
 * - created_before: ISO date string for filtering contacts created before this date
 * - excludedContactIds: Array of contact IDs to exclude from the segment
 * - pipelineStageIds: Array of pipeline stage IDs to filter contacts that have deals in the specified stages
 *   Contacts will be included if they have at least one deal in any of the specified pipeline stages
 */
export interface SegmentFilterCriteria {
  tags?: string[];
  created_after?: string;
  created_before?: string;
  excludedContactIds?: number[];
  contactIds?: number[];
  /** 
   * Array of pipeline stage IDs. Filters contacts that have deals in the specified pipeline stages.
   * Contacts will be included if they have at least one deal in any of the specified stages.
   */
  pipelineStageIds?: number[];
  hasEmail?: boolean;
  [key: string]: any; // Allow additional fields for extensibility
}

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;

export type CampaignRecipient = typeof campaignRecipients.$inferSelect;
export type InsertCampaignRecipient = z.infer<typeof insertCampaignRecipientSchema>;

export type CampaignMessage = typeof campaignMessages.$inferSelect;
export type CampaignAnalytics = typeof campaignAnalytics.$inferSelect;

export type WhatsappAccount = typeof whatsappAccounts.$inferSelect;
export type InsertWhatsappAccount = z.infer<typeof insertWhatsappAccountSchema>;

export type WhatsappAccountLog = typeof whatsappAccountLogs.$inferSelect;
export type CampaignQueue = typeof campaignQueue.$inferSelect;

export type CampaignStatus = z.infer<typeof campaignStatusTypes>;
export type CampaignType = z.infer<typeof campaignTypes>;
export type CampaignRecipientStatus = z.infer<typeof campaignRecipientStatusTypes>;
export type WhatsappConnectionStatus = z.infer<typeof whatsappConnectionStatusTypes>;

export const socialProviderTypes = z.enum(['google', 'facebook', 'apple']);

export const userSocialAccounts = pgTable("user_social_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text("provider", { enum: ['google', 'facebook', 'apple'] }).notNull(),
  providerUserId: text("provider_user_id").notNull(),
  providerEmail: text("provider_email"),
  providerName: text("provider_name"),
  providerAvatarUrl: text("provider_avatar_url"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  providerData: jsonb("provider_data").default('{}'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const insertUserSocialAccountSchema = createInsertSchema(userSocialAccounts).pick({
  userId: true,
  provider: true,
  providerUserId: true,
  providerEmail: true,
  providerName: true,
  providerAvatarUrl: true,
  accessToken: true,
  refreshToken: true,
  tokenExpiresAt: true,
  providerData: true
});

export type UserSocialAccount = typeof userSocialAccounts.$inferSelect;
export type InsertUserSocialAccount = z.infer<typeof insertUserSocialAccountSchema>;
export type SocialProvider = z.infer<typeof socialProviderTypes>;

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent")
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).pick({
  userId: true,
  token: true,
  expiresAt: true,
  ipAddress: true,
  userAgent: true
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;


export const subscriptionEvents = pgTable("subscription_events", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  eventType: text("event_type").notNull(),
  eventData: jsonb("event_data").notNull().default('{}'),
  previousStatus: text("previous_status"),
  newStatus: text("new_status"),
  triggeredBy: text("triggered_by"),
  createdAt: timestamp("created_at").notNull().defaultNow()
});

/** Idempotent Stripe webhook processing (one row per Stripe event id). */
export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  id: serial("id").primaryKey(),
  eventId: text("event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at").notNull().defaultNow()
});

export const websites = pgTable("websites", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  metaKeywords: text("meta_keywords"),

  grapesData: jsonb("grapes_data").notNull().default('{}'),
  grapesHtml: text("grapes_html"),
  grapesCss: text("grapes_css"),
  grapesJs: text("grapes_js"),

  favicon: text("favicon"),
  customCss: text("custom_css"),
  customJs: text("custom_js"),
  customHead: text("custom_head"),

  status: text("status", {
    enum: ['draft', 'published', 'archived']
  }).notNull().default('draft'),
  publishedAt: timestamp("published_at"),

  googleAnalyticsId: text("google_analytics_id"),
  facebookPixelId: text("facebook_pixel_id"),

  theme: text("theme").default('default'),

  createdById: integer("created_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});



export const websiteAssets = pgTable("website_assets", {
  id: serial("id").primaryKey(),
  websiteId: integer("website_id").notNull().references(() => websites.id, { onDelete: 'cascade' }),

  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),

  path: text("path").notNull(),
  url: text("url").notNull(),

  alt: text("alt"),
  title: text("title"),

  assetType: text("asset_type", {
    enum: ['image', 'video', 'audio', 'document', 'font', 'icon']
  }).notNull(),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const insertSubscriptionEventSchema = createInsertSchema(subscriptionEvents).pick({
  companyId: true,
  eventType: true,
  eventData: true,
  previousStatus: true,
  newStatus: true,
  triggeredBy: true
});

export type SubscriptionEvent = typeof subscriptionEvents.$inferSelect;
export type InsertSubscriptionEvent = z.infer<typeof insertSubscriptionEventSchema>;

export const subscriptionUsageTracking = pgTable("subscription_usage_tracking", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  metricName: text("metric_name").notNull(),
  currentUsage: integer("current_usage").notNull().default(0),
  limitValue: integer("limit_value").notNull(),
  softLimitReached: boolean("soft_limit_reached").default(false),
  hardLimitReached: boolean("hard_limit_reached").default(false),
  lastWarningSent: timestamp("last_warning_sent"),
  resetPeriod: text("reset_period").default("monthly"),
  lastReset: timestamp("last_reset").defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, (table) => ({
  uniqueCompanyMetric: unique().on(table.companyId, table.metricName)
}));

export const insertSubscriptionUsageTrackingSchema = createInsertSchema(subscriptionUsageTracking).pick({
  companyId: true,
  metricName: true,
  currentUsage: true,
  limitValue: true,
  softLimitReached: true,
  hardLimitReached: true,
  lastWarningSent: true,
  resetPeriod: true,
  lastReset: true
});

export type SubscriptionUsageTracking = typeof subscriptionUsageTracking.$inferSelect;
export type InsertSubscriptionUsageTracking = z.infer<typeof insertSubscriptionUsageTrackingSchema>;

export const dunningManagement = pgTable("dunning_management", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  paymentTransactionId: integer("payment_transaction_id").references(() => paymentTransactions.id),
  attemptNumber: integer("attempt_number").notNull().default(1),
  attemptDate: timestamp("attempt_date").notNull().defaultNow(),
  attemptType: text("attempt_type").notNull(),
  status: text("status").notNull().default("pending"),
  responseData: jsonb("response_data"),
  nextAttemptDate: timestamp("next_attempt_date"),
  createdAt: timestamp("created_at").notNull().defaultNow()
});

export const insertDunningManagementSchema = createInsertSchema(dunningManagement).pick({
  companyId: true,
  paymentTransactionId: true,
  attemptNumber: true,
  attemptDate: true,
  attemptType: true,
  status: true,
  responseData: true,
  nextAttemptDate: true
});

export type DunningManagement = typeof dunningManagement.$inferSelect;
export type InsertDunningManagement = z.infer<typeof insertDunningManagementSchema>;

export const subscriptionPlanChanges = pgTable("subscription_plan_changes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  fromPlanId: integer("from_plan_id").references(() => plans.id),
  toPlanId: integer("to_plan_id").notNull().references(() => plans.id),
  changeType: text("change_type").notNull(),
  effectiveDate: timestamp("effective_date").notNull().defaultNow(),
  prorationAmount: numeric("proration_amount", { precision: 10, scale: 2 }).default("0"),
  prorationDays: integer("proration_days").default(0),
  billingCycleReset: boolean("billing_cycle_reset").default(false),
  changeReason: text("change_reason"),
  processed: boolean("processed").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow()
});

export const insertSubscriptionPlanChangeSchema = createInsertSchema(subscriptionPlanChanges).pick({
  companyId: true,
  fromPlanId: true,
  toPlanId: true,
  changeType: true,
  effectiveDate: true,
  prorationAmount: true,
  prorationDays: true,
  billingCycleReset: true,
  changeReason: true,
  processed: true
});

export type SubscriptionPlanChange = typeof subscriptionPlanChanges.$inferSelect;
export type InsertSubscriptionPlanChange = z.infer<typeof insertSubscriptionPlanChangeSchema>;

export const subscriptionNotifications = pgTable("subscription_notifications", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  notificationType: text("notification_type").notNull(),
  status: text("status").notNull().default("pending"),
  scheduledFor: timestamp("scheduled_for").notNull(),
  sentAt: timestamp("sent_at"),
  notificationData: jsonb("notification_data").notNull().default('{}'),
  deliveryMethod: text("delivery_method").default("email"),
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),
  createdAt: timestamp("created_at").notNull().defaultNow()
});

export const insertSubscriptionNotificationSchema = createInsertSchema(subscriptionNotifications).pick({
  companyId: true,
  notificationType: true,
  status: true,
  scheduledFor: true,
  sentAt: true,
  notificationData: true,
  deliveryMethod: true,
  retryCount: true,
  maxRetries: true
});

export type SubscriptionNotification = typeof subscriptionNotifications.$inferSelect;
export type InsertSubscriptionNotification = z.infer<typeof insertSubscriptionNotificationSchema>;

export const insertWebsiteSchema = createInsertSchema(websites).pick({
  title: true,
  slug: true,
  description: true,
  metaTitle: true,
  metaDescription: true,
  metaKeywords: true,
  grapesData: true,
  grapesHtml: true,
  grapesCss: true,
  grapesJs: true,
  favicon: true,
  customCss: true,
  customJs: true,
  customHead: true,
  status: true,
  publishedAt: true,
  googleAnalyticsId: true,
  facebookPixelId: true,

  theme: true,
  createdById: true
});



export const insertWebsiteAssetSchema = createInsertSchema(websiteAssets).pick({
  websiteId: true,
  filename: true,
  originalName: true,
  mimeType: true,
  size: true,
  path: true,
  url: true,
  alt: true,
  title: true,
  assetType: true
});

export const systemAiCredentials = pgTable("system_ai_credentials", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  apiKeyEncrypted: text("api_key_encrypted").notNull(),
  displayName: text("display_name"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  usageLimitMonthly: integer("usage_limit_monthly"),
  usageCountCurrent: integer("usage_count_current").default(0),
  lastValidatedAt: timestamp("last_validated_at"),
  validationStatus: text("validation_status").default("pending"),
  validationError: text("validation_error"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const companyAiCredentials = pgTable("company_ai_credentials", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  provider: text("provider").notNull(),
  apiKeyEncrypted: text("api_key_encrypted").notNull(),
  displayName: text("display_name"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  usageLimitMonthly: integer("usage_limit_monthly"),
  usageCountCurrent: integer("usage_count_current").default(0),
  lastValidatedAt: timestamp("last_validated_at"),
  validationStatus: text("validation_status").default("pending"),
  validationError: text("validation_error"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const aiCredentialUsage = pgTable("ai_credential_usage", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  credentialType: text("credential_type").notNull(),
  credentialId: integer("credential_id"),
  provider: text("provider").notNull(),
  model: text("model"),
  tokensInput: integer("tokens_input").default(0),
  tokensOutput: integer("tokens_output").default(0),
  tokensTotal: integer("tokens_total").default(0),
  costEstimated: numeric("cost_estimated", { precision: 10, scale: 6 }).default("0.00"),
  requestCount: integer("request_count").default(1),
  conversationId: integer("conversation_id").references(() => conversations.id, { onDelete: 'set null' }),
  flowId: integer("flow_id").references(() => flows.id, { onDelete: 'set null' }),
  nodeId: text("node_id"),
  usageDate: date("usage_date").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow()
});

export const companyAiPreferences = pgTable("company_ai_preferences", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }).unique(),
  defaultProvider: text("default_provider").default("openai"),
  credentialPreference: text("credential_preference").default("auto"),
  fallbackEnabled: boolean("fallback_enabled").default(true),
  usageAlertsEnabled: boolean("usage_alerts_enabled").default(true),
  usageAlertThreshold: integer("usage_alert_threshold").default(80),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const knowledgeBaseDocuments = pgTable("knowledge_base_documents", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  nodeId: text("node_id"),

  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),

  status: text("status", {
    enum: ['uploading', 'processing', 'completed', 'failed']
  }).notNull().default('uploading'),

  filePath: text("file_path").notNull(),
  fileUrl: text("file_url"),

  extractedText: text("extracted_text"),
  chunkCount: integer("chunk_count").default(0),
  chunkSize: integer("chunk_size"),
  averageChunkTokens: real("average_chunk_tokens"),
  embeddingModel: text("embedding_model").default(DEFAULT_EMBEDDING_MODEL),

  processingError: text("processing_error"),
  processingDurationMs: integer("processing_duration_ms"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const knowledgeBaseChunks = pgTable("knowledge_base_chunks", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => knowledgeBaseDocuments.id, { onDelete: 'cascade' }),

  content: text("content").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  tokenCount: integer("token_count"),



  startPosition: integer("start_position"),
  endPosition: integer("end_position"),

  recordId: text("record_id"),
  sectionLabel: text("section_label"),
  sourceDocumentName: text("source_document_name"),
  language: text("language"),
  contentHash: text("content_hash"),

  createdAt: timestamp("created_at").notNull().defaultNow()
});

export const knowledgeBaseConfigs = pgTable("knowledge_base_configs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  nodeId: text("node_id").notNull(),
  flowId: integer("flow_id").references(() => flows.id, { onDelete: 'cascade' }),

  enabled: boolean("enabled").default(DEFAULT_RAG_CONFIG.enabled),
  maxRetrievedChunks: integer("max_retrieved_chunks").default(DEFAULT_RAG_CONFIG.maxRetrievedChunks),
  similarityThreshold: real("similarity_threshold").default(DEFAULT_RAG_CONFIG.similarityThreshold),
  embeddingModel: text("embedding_model").default(DEFAULT_EMBEDDING_MODEL),

  contextPosition: text("context_position", {
    enum: ['before_system', 'after_system', 'before_user']
  }).default(DEFAULT_RAG_CONFIG.contextPosition),

  contextTemplate: text("context_template").default(CONTEXT_TEMPLATE),

  vectorDatabase: text("vector_database", {
    enum: ['pinecone', 'pgvector']
  }),

  /** When true, vector_database on this row is authoritative (including explicit null). */
  vectorDatabaseDbAuthoritative: boolean("vector_database_db_authoritative").notNull().default(false),

  hybridEnabled: boolean("hybrid_enabled").notNull().default(DEFAULT_RAG_CONFIG.hybridEnabled),
  denseTopK: integer("dense_top_k").notNull().default(DEFAULT_RAG_CONFIG.denseTopK),
  lexicalTopK: integer("lexical_top_k").notNull().default(DEFAULT_RAG_CONFIG.lexicalTopK),
  rrfK: integer("rrf_k").notNull().default(DEFAULT_RAG_CONFIG.rrfK),
  denseWeight: real("dense_weight").notNull().default(DEFAULT_RAG_CONFIG.denseWeight),
  lexicalWeight: real("lexical_weight").notNull().default(DEFAULT_RAG_CONFIG.lexicalWeight),
  candidatePoolSize: integer("candidate_pool_size").notNull().default(DEFAULT_RAG_CONFIG.candidatePoolSize),
  dedupeEnabled: boolean("dedupe_enabled").notNull().default(DEFAULT_RAG_CONFIG.dedupeEnabled),
  dedupeSimilarity: real("dedupe_similarity").notNull().default(DEFAULT_RAG_CONFIG.dedupeSimilarity),
  mmrEnabled: boolean("mmr_enabled").notNull().default(DEFAULT_RAG_CONFIG.mmrEnabled),
  mmrLambda: real("mmr_lambda").notNull().default(DEFAULT_RAG_CONFIG.mmrLambda),
  rerankEnabled: boolean("rerank_enabled").notNull().default(DEFAULT_RAG_CONFIG.rerankEnabled),
  rerankModel: text("rerank_model").notNull().default(DEFAULT_RAG_CONFIG.rerankModel),
  rerankTopN: integer("rerank_top_n").notNull().default(DEFAULT_RAG_CONFIG.rerankTopN),
  confidenceThreshold: real("confidence_threshold").notNull().default(DEFAULT_RAG_CONFIG.confidenceThreshold),
  queryRewriteEnabled: boolean("query_rewrite_enabled").notNull().default(DEFAULT_RAG_CONFIG.queryRewriteEnabled),
  answerValidationEnabled: boolean("answer_validation_enabled").notNull().default(DEFAULT_RAG_CONFIG.answerValidationEnabled),
  hnswEfSearch: integer("hnsw_ef_search").notNull().default(DEFAULT_RAG_CONFIG.hnswEfSearch),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, (table) => ({
  uniqueNodeConfig: unique().on(table.companyId, table.nodeId)
}));

export const knowledgeBaseVectors = pgTable("knowledge_base_vectors", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  documentId: integer("document_id").notNull().references(() => knowledgeBaseDocuments.id, { onDelete: 'cascade' }),
  chunkId: integer("chunk_id").notNull().references(() => knowledgeBaseChunks.id, { onDelete: 'cascade' }),
  nodeId: text("node_id").notNull(),
  flowId: integer("flow_id").references(() => flows.id, { onDelete: 'cascade' }),
  embeddingModel: text("embedding_model").notNull().default(DEFAULT_EMBEDDING_MODEL),
  embedding: vector("embedding", { dimensions: 1536 }).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
}, (table) => ({
  uniqueCompanyNodeChunkModel: unique().on(table.companyId, table.nodeId, table.chunkId, table.embeddingModel),
  embeddingHnswIdx: index("idx_knowledge_base_vectors_embedding_hnsw").using("hnsw", table.embedding.op("vector_cosine_ops")),
  companyIdIdx: index("idx_knowledge_base_vectors_company_id").on(table.companyId),
  nodeIdIdx: index("idx_knowledge_base_vectors_node_id").on(table.nodeId),
  documentIdIdx: index("idx_knowledge_base_vectors_document_id").on(table.documentId),
  chunkIdIdx: index("idx_knowledge_base_vectors_chunk_id").on(table.chunkId),
  embeddingModelIdx: index("idx_knowledge_base_vectors_embedding_model").on(table.embeddingModel),
}));

export const nodeEmbeddings = pgTable("node_embeddings", {
  id: serial("id").primaryKey(),
  nodeType: varchar("node_type").notNull().unique(),
  chunkText: text("chunk_text").notNull(),
  embedding: vector("embedding", { dimensions: 1536 }).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  embeddingHnswIdx: index("idx_node_embeddings_embedding_hnsw").using("hnsw", table.embedding.op("vector_cosine_ops")),
  nodeTypeIdx: index("idx_node_embeddings_node_type").on(table.nodeType),
}));

export const insertNodeEmbeddingsSchema = createInsertSchema(nodeEmbeddings);
export type NodeEmbedding = typeof nodeEmbeddings.$inferSelect;
export type InsertNodeEmbedding = z.infer<typeof insertNodeEmbeddingsSchema>;

export const knowledgeBaseDocumentNodes = pgTable("knowledge_base_document_nodes", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => knowledgeBaseDocuments.id, { onDelete: 'cascade' }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  nodeId: text("node_id").notNull(),
  flowId: integer("flow_id").references(() => flows.id, { onDelete: 'cascade' }),

  createdAt: timestamp("created_at").notNull().defaultNow()
}, (table) => ({
  uniqueDocumentNode: unique().on(table.documentId, table.nodeId)
}));

export const knowledgeBaseUsage = pgTable("knowledge_base_usage", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  nodeId: text("node_id").notNull(),
  documentId: integer("document_id").references(() => knowledgeBaseDocuments.id, { onDelete: 'set null' }),

  queryText: text("query_text").notNull(),
  queryEmbedding: text("query_embedding"),

  chunksRetrieved: integer("chunks_retrieved").default(0),
  chunksUsed: integer("chunks_used").default(0),
  similarityScores: jsonb("similarity_scores").default('[]'),

  retrievalDurationMs: integer("retrieval_duration_ms"),
  embeddingDurationMs: integer("embedding_duration_ms"),

  contextInjected: boolean("context_injected").default(false),
  contextLength: integer("context_length"),

  confidence: real("confidence"),
  confidenceThreshold: real("confidence_threshold"),
  denseCandidateCount: integer("dense_candidate_count"),
  lexicalCandidateCount: integer("lexical_candidate_count"),
  fusedCandidateCount: integer("fused_candidate_count"),
  dedupedCount: integer("deduped_count"),
  dedupeCollapsed: integer("dedupe_collapsed"),
  mmrApplied: boolean("mmr_applied"),
  rerankApplied: boolean("rerank_applied"),
  topRerankScore: real("top_rerank_score"),
  rerankMargin: real("rerank_margin"),
  queryRewriteApplied: boolean("query_rewrite_applied"),
  rewrittenQuery: text("rewritten_query"),
  expansionQueryCount: integer("expansion_query_count"),
  queryRewriteDurationMs: integer("query_rewrite_duration_ms"),
  denseDurationMs: integer("dense_duration_ms"),
  lexicalDurationMs: integer("lexical_duration_ms"),
  rerankDurationMs: integer("rerank_duration_ms"),
  chunkTelemetry: jsonb("chunk_telemetry").default('[]'),
  abstained: boolean("abstained").default(false),
  abstainReason: text("abstain_reason"),
  answerValidated: boolean("answer_validated").default(false),
  validationGrounded: boolean("validation_grounded"),
  turnCorrelationId: text("turn_correlation_id"),

  createdAt: timestamp("created_at").notNull().defaultNow()
});

export const insertSystemAiCredentialSchema = createInsertSchema(systemAiCredentials).pick({
  provider: true,
  apiKeyEncrypted: true,
  displayName: true,
  description: true,
  isActive: true,
  isDefault: true,
  usageLimitMonthly: true,
  metadata: true
});

export const insertCompanyAiCredentialSchema = createInsertSchema(companyAiCredentials).pick({
  companyId: true,
  provider: true,
  apiKeyEncrypted: true,
  displayName: true,
  description: true,
  isActive: true,
  usageLimitMonthly: true,
  metadata: true
});

export const insertAiCredentialUsageSchema = createInsertSchema(aiCredentialUsage).pick({
  companyId: true,
  credentialType: true,
  credentialId: true,
  provider: true,
  model: true,
  tokensInput: true,
  tokensOutput: true,
  tokensTotal: true,
  costEstimated: true,
  requestCount: true,
  conversationId: true,
  flowId: true,
  nodeId: true,
  usageDate: true
});

export const insertCompanyAiPreferencesSchema = createInsertSchema(companyAiPreferences).pick({
  companyId: true,
  defaultProvider: true,
  credentialPreference: true,
  fallbackEnabled: true,
  usageAlertsEnabled: true,
  usageAlertThreshold: true,
  metadata: true
});

export type SystemAiCredential = typeof systemAiCredentials.$inferSelect;
export type InsertSystemAiCredential = z.infer<typeof insertSystemAiCredentialSchema>;

export type CompanyAiCredential = typeof companyAiCredentials.$inferSelect;
export type InsertCompanyAiCredential = z.infer<typeof insertCompanyAiCredentialSchema>;

export type AiCredentialUsage = typeof aiCredentialUsage.$inferSelect;
export type InsertAiCredentialUsage = z.infer<typeof insertAiCredentialUsageSchema>;

export type CompanyAiPreferences = typeof companyAiPreferences.$inferSelect;
export type InsertCompanyAiPreferences = z.infer<typeof insertCompanyAiPreferencesSchema>;

export const insertKnowledgeBaseDocumentSchema = createInsertSchema(knowledgeBaseDocuments).pick({
  companyId: true,
  nodeId: true,
  filename: true,
  originalName: true,
  mimeType: true,
  fileSize: true,
  status: true,
  filePath: true,
  fileUrl: true,
  extractedText: true,
  chunkCount: true,
  chunkSize: true,
  averageChunkTokens: true,
  embeddingModel: true,
  processingError: true,
  processingDurationMs: true
});

export const insertKnowledgeBaseChunkSchema = createInsertSchema(knowledgeBaseChunks).pick({
  documentId: true,
  content: true,
  chunkIndex: true,
  tokenCount: true,
  startPosition: true,
  endPosition: true,
  recordId: true,
  sectionLabel: true,
  sourceDocumentName: true,
  language: true,
  contentHash: true,
});

export const insertKnowledgeBaseConfigSchema = createInsertSchema(knowledgeBaseConfigs).pick({
  companyId: true,
  nodeId: true,
  flowId: true,
  enabled: true,
  maxRetrievedChunks: true,
  similarityThreshold: true,
  embeddingModel: true,
  contextPosition: true,
  contextTemplate: true,
  vectorDatabase: true,
  vectorDatabaseDbAuthoritative: true,
  hybridEnabled: true,
  denseTopK: true,
  lexicalTopK: true,
  rrfK: true,
  denseWeight: true,
  lexicalWeight: true,
  candidatePoolSize: true,
  dedupeEnabled: true,
  dedupeSimilarity: true,
  mmrEnabled: true,
  mmrLambda: true,
  rerankEnabled: true,
  rerankModel: true,
  rerankTopN: true,
  confidenceThreshold: true,
  queryRewriteEnabled: true,
  answerValidationEnabled: true,
  hnswEfSearch: true,
});

export const insertKnowledgeBaseVectorSchema = createInsertSchema(knowledgeBaseVectors).pick({
  companyId: true,
  documentId: true,
  chunkId: true,
  nodeId: true,
  flowId: true,
  embeddingModel: true,
  embedding: true,
  metadata: true
});

export const insertKnowledgeBaseDocumentNodeSchema = createInsertSchema(knowledgeBaseDocumentNodes).pick({
  documentId: true,
  companyId: true,
  nodeId: true,
  flowId: true
});

export const insertKnowledgeBaseUsageSchema = createInsertSchema(knowledgeBaseUsage).pick({
  companyId: true,
  nodeId: true,
  documentId: true,
  queryText: true,
  queryEmbedding: true,
  chunksRetrieved: true,
  chunksUsed: true,
  similarityScores: true,
  retrievalDurationMs: true,
  embeddingDurationMs: true,
  contextInjected: true,
  contextLength: true,
  confidence: true,
  confidenceThreshold: true,
  denseCandidateCount: true,
  lexicalCandidateCount: true,
  fusedCandidateCount: true,
  dedupedCount: true,
  dedupeCollapsed: true,
  mmrApplied: true,
  rerankApplied: true,
  topRerankScore: true,
  rerankMargin: true,
  queryRewriteApplied: true,
  rewrittenQuery: true,
  expansionQueryCount: true,
  queryRewriteDurationMs: true,
  denseDurationMs: true,
  lexicalDurationMs: true,
  rerankDurationMs: true,
  chunkTelemetry: true,
  abstained: true,
  abstainReason: true,
  answerValidated: true,
  validationGrounded: true,
  turnCorrelationId: true,
});

export const historySyncBatches = pgTable("history_sync_batches", {
  id: serial("id").primaryKey(),
  connectionId: integer("connection_id").notNull().references(() => channelConnections.id, { onDelete: 'cascade' }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  batchId: text("batch_id").notNull().unique(),
  syncType: text("sync_type", {
    enum: ['initial', 'manual', 'incremental']
  }).notNull(),
  status: text("status", {
    enum: ['pending', 'processing', 'completed', 'failed']
  }).notNull().default('pending'),
  totalChats: integer("total_chats").default(0),
  processedChats: integer("processed_chats").default(0),
  totalMessages: integer("total_messages").default(0),
  processedMessages: integer("processed_messages").default(0),
  totalContacts: integer("total_contacts").default(0),
  processedContacts: integer("processed_contacts").default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const insertHistorySyncBatchSchema = createInsertSchema(historySyncBatches).pick({
  connectionId: true,
  companyId: true,
  batchId: true,
  syncType: true,
  status: true,
  totalChats: true,
  processedChats: true,
  totalMessages: true,
  processedMessages: true,
  totalContacts: true,
  processedContacts: true,
  errorMessage: true,
  startedAt: true,
  completedAt: true
});


export const backupStatusEnum = pgEnum('backup_status', ['pending', 'in_progress', 'completed', 'failed', 'cancelled']);
export const backupTypeEnum = pgEnum('backup_type', ['manual', 'scheduled']);
export const restoreStatusEnum = pgEnum('restore_status', ['pending', 'in_progress', 'completed', 'failed', 'cancelled']);

export const inboxBackups = pgTable("inbox_backups", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  type: backupTypeEnum("type").notNull().default('manual'),
  status: backupStatusEnum("status").notNull().default('pending'),
  filePath: text("file_path"),
  fileName: text("file_name"),
  fileSize: integer("file_size"), // in bytes
  compressedSize: integer("compressed_size"), // in bytes
  checksum: text("checksum"),
  metadata: jsonb("metadata").default('{}'), // backup metadata like version, counts, etc.
  includeContacts: boolean("include_contacts").default(true),
  includeConversations: boolean("include_conversations").default(true),
  includeMessages: boolean("include_messages").default(true),
  dateRangeStart: timestamp("date_range_start"),
  dateRangeEnd: timestamp("date_range_end"),
  totalContacts: integer("total_contacts").default(0),
  totalConversations: integer("total_conversations").default(0),
  totalMessages: integer("total_messages").default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  expiresAt: timestamp("expires_at"), // for automatic cleanup
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const backupSchedules = pgTable("backup_schedules", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  frequency: text("frequency").notNull(), // 'daily', 'weekly', 'monthly'
  cronExpression: text("cron_expression"),
  retentionDays: integer("retention_days").default(30),
  includeContacts: boolean("include_contacts").default(true),
  includeConversations: boolean("include_conversations").default(true),
  includeMessages: boolean("include_messages").default(true),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const inboxRestores = pgTable("inbox_restores", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  backupId: integer("backup_id").references(() => inboxBackups.id),
  restoredByUserId: integer("restored_by_user_id").notNull().references(() => users.id),
  status: restoreStatusEnum("status").notNull().default('pending'),
  restoreType: text("restore_type").notNull(), // 'full', 'selective'
  conflictResolution: text("conflict_resolution").default('merge'), // 'merge', 'overwrite', 'skip'
  dateRangeStart: timestamp("date_range_start"),
  dateRangeEnd: timestamp("date_range_end"),
  restoreContacts: boolean("restore_contacts").default(true),
  restoreConversations: boolean("restore_conversations").default(true),
  restoreMessages: boolean("restore_messages").default(true),
  totalItemsToRestore: integer("total_items_to_restore").default(0),
  itemsRestored: integer("items_restored").default(0),
  itemsSkipped: integer("items_skipped").default(0),
  itemsErrored: integer("items_errored").default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

export const backupAuditLogs = pgTable("backup_audit_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id),
  action: text("action").notNull(), // 'backup_created', 'backup_downloaded', 'restore_started', etc.
  entityType: text("entity_type").notNull(), // 'backup', 'restore', 'schedule'
  entityId: integer("entity_id"),
  details: jsonb("details").default('{}'),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow()
});


export const databaseBackupStatusEnum = pgEnum('database_backup_status', ['creating', 'completed', 'failed', 'uploading', 'uploaded']);
export const databaseBackupTypeEnum = pgEnum('database_backup_type', ['manual', 'scheduled']);
export const databaseBackupFormatEnum = pgEnum('database_backup_format', ['sql', 'custom']);

export const databaseBackups = pgTable("database_backups", {
  id: text("id").primaryKey(), // UUID
  filename: text("filename").notNull(),
  type: databaseBackupTypeEnum("type").notNull().default('manual'),
  description: text("description").notNull(),
  size: integer("size").notNull().default(0), // in bytes
  status: databaseBackupStatusEnum("status").notNull().default('creating'),
  storageLocations: jsonb("storage_locations").notNull().default('["local"]'), // array of storage locations
  checksum: text("checksum").notNull(),
  errorMessage: text("error_message"),

  databaseSize: integer("database_size").default(0),
  tableCount: integer("table_count").default(0),
  rowCount: integer("row_count").default(0),
  compressionRatio: real("compression_ratio"),
  encryptionEnabled: boolean("encryption_enabled").default(false),

  appVersion: text("app_version"),
  pgVersion: text("pg_version"),
  instanceId: text("instance_id"),
  dumpFormat: databaseBackupFormatEnum("dump_format").default('sql'),
  schemaChecksum: text("schema_checksum"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const databaseBackupLogs = pgTable("database_backup_logs", {
  id: text("id").primaryKey(), // UUID
  scheduleId: text("schedule_id").notNull(), // 'manual' (for non-scheduled events), 'restore' (for restore operations), or schedule UUID (for scheduled backups)
  backupId: text("backup_id").references(() => databaseBackups.id),
  status: text("status").notNull(), // 'success' | 'failed' | 'partial' | 'in_progress' - faithful to actual state, not coerced
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").default('{}'), // Contains event_type for non-scheduled events (e.g., 'cleanup', 'cleanup_deleted', 'cleanup_failed')
  createdAt: timestamp("created_at").notNull().defaultNow()
});


export const insertInboxBackupSchema = createInsertSchema(inboxBackups).pick({
  companyId: true,
  createdByUserId: true,
  name: true,
  description: true,
  type: true,
  includeContacts: true,
  includeConversations: true,
  includeMessages: true,
  dateRangeStart: true,
  dateRangeEnd: true
});

export const insertBackupScheduleSchema = createInsertSchema(backupSchedules).pick({
  companyId: true,
  createdByUserId: true,
  name: true,
  description: true,
  isActive: true,
  frequency: true,
  cronExpression: true,
  retentionDays: true,
  includeContacts: true,
  includeConversations: true,
  includeMessages: true
});

export const insertInboxRestoreSchema = createInsertSchema(inboxRestores).pick({
  companyId: true,
  backupId: true,
  restoredByUserId: true,
  restoreType: true,
  conflictResolution: true,
  dateRangeStart: true,
  dateRangeEnd: true,
  restoreContacts: true,
  restoreConversations: true,
  restoreMessages: true
});

export const insertBackupAuditLogSchema = createInsertSchema(backupAuditLogs).pick({
  companyId: true,
  userId: true,
  action: true,
  entityType: true,
  entityId: true,
  details: true,
  ipAddress: true,
  userAgent: true
});

export const insertDatabaseBackupSchema = createInsertSchema(databaseBackups).pick({
  id: true,
  filename: true,
  type: true,
  description: true,
  size: true,
  status: true,
  storageLocations: true,
  checksum: true,
  errorMessage: true,
  databaseSize: true,
  tableCount: true,
  rowCount: true,
  compressionRatio: true,
  encryptionEnabled: true,
  appVersion: true,
  pgVersion: true,
  instanceId: true,
  dumpFormat: true,
  schemaChecksum: true
});

export const insertDatabaseBackupLogSchema = createInsertSchema(databaseBackupLogs).pick({
  id: true,
  scheduleId: true,
  backupId: true,
  status: true,
  timestamp: true,
  errorMessage: true,
  metadata: true
});

export const flowTemplates = pgTable("flow_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  businessType: text("business_type").notNull(),
  nodes: jsonb("nodes").notNull().default([]),
  edges: jsonb("edges").notNull().default([]),
  tags: text("tags").array(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const insertFlowTemplateSchema = createInsertSchema(flowTemplates).pick({
  name: true,
  description: true,
  category: true,
  businessType: true,
  nodes: true,
  edges: true,
  tags: true
});

export type FlowTemplate = typeof flowTemplates.$inferSelect;
export type InsertFlowTemplate = z.infer<typeof insertFlowTemplateSchema>;

export type KnowledgeBaseDocument = typeof knowledgeBaseDocuments.$inferSelect;
export type InsertKnowledgeBaseDocument = z.infer<typeof insertKnowledgeBaseDocumentSchema>;

export type KnowledgeBaseChunk = typeof knowledgeBaseChunks.$inferSelect;
export type InsertKnowledgeBaseChunk = z.infer<typeof insertKnowledgeBaseChunkSchema>;

export type HistorySyncBatch = typeof historySyncBatches.$inferSelect;
export type InsertHistorySyncBatch = z.infer<typeof insertHistorySyncBatchSchema>;

export type KnowledgeBaseConfig = typeof knowledgeBaseConfigs.$inferSelect;


export type InboxBackup = typeof inboxBackups.$inferSelect;
export type InsertInboxBackup = z.infer<typeof insertInboxBackupSchema>;

export type BackupSchedule = typeof backupSchedules.$inferSelect;
export type InsertBackupSchedule = z.infer<typeof insertBackupScheduleSchema>;

export type InboxRestore = typeof inboxRestores.$inferSelect;
export type InsertInboxRestore = z.infer<typeof insertInboxRestoreSchema>;

export type BackupAuditLog = typeof backupAuditLogs.$inferSelect;
export type InsertBackupAuditLog = z.infer<typeof insertBackupAuditLogSchema>;

export type DatabaseBackup = typeof databaseBackups.$inferSelect;
export type InsertDatabaseBackup = z.infer<typeof insertDatabaseBackupSchema>;

export type DatabaseBackupLog = typeof databaseBackupLogs.$inferSelect;
export type InsertDatabaseBackupLog = z.infer<typeof insertDatabaseBackupLogSchema>;

export type InsertKnowledgeBaseConfig = z.infer<typeof insertKnowledgeBaseConfigSchema>;

export type KnowledgeBaseVector = typeof knowledgeBaseVectors.$inferSelect;
export type InsertKnowledgeBaseVector = z.infer<typeof insertKnowledgeBaseVectorSchema>;

export type KnowledgeBaseDocumentNode = typeof knowledgeBaseDocumentNodes.$inferSelect;
export type InsertKnowledgeBaseDocumentNode = z.infer<typeof insertKnowledgeBaseDocumentNodeSchema>;

export type KnowledgeBaseUsage = typeof knowledgeBaseUsage.$inferSelect;
export type InsertKnowledgeBaseUsage = z.infer<typeof insertKnowledgeBaseUsageSchema>;

export const productTypeEnum = z.enum(['physical', 'service', 'digital']);

export const productStatusEnum = z.enum(['active', 'inactive', 'draft', 'archived']);

export const productCategories = pgTable("product_categories", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  description: text("description"),
  parentCategoryId: integer("parent_category_id"),
  slug: text("slug"),
  sortOrder: integer("sort_order").default(0),
  isMenuCategory: boolean("is_menu_category").default(false),
  menuSortOrder: integer("menu_sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("unique_company_category_slug").on(table.companyId, table.slug),
  unique("idx_product_categories_id_company").on(table.id, table.companyId),
  foreignKey({
    name: "product_categories_parent_fk",
    columns: [table.parentCategoryId],
    foreignColumns: [table.id],
  }).onDelete("set null"),
]);

export const productBrands = pgTable("product_brands", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  slug: text("slug"),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("unique_company_product_brand_slug").on(table.companyId, table.slug),
  unique("unique_company_product_brand_name").on(table.companyId, table.name),
  unique("idx_product_brands_id_company").on(table.id, table.companyId),
]);

export const productUnits = pgTable("product_units", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  code: text("code"),
  name: text("name").notNull(),
  symbol: text("symbol"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("unique_company_product_unit_code").on(table.companyId, table.code),
  unique("unique_company_product_unit_name").on(table.companyId, table.name),
  unique("idx_product_units_id_company").on(table.id, table.companyId),
]);

export const productTagsMaster = pgTable("product_tags_master", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  color: text("color"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("unique_company_product_tag_name").on(table.companyId, table.name),
  unique("idx_product_tags_master_id_company").on(table.id, table.companyId),
]);

export const productCustomFieldDefinitions = pgTable("product_custom_field_definitions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  fieldKey: text("field_key").notNull(),
  fieldType: text("field_type", { enum: ['text', 'textarea', 'number', 'date', 'select', 'checkbox'] }).notNull(),
  options: jsonb("options").default('[]'),
  isRequired: boolean("is_required").default(false),
  defaultValue: text("default_value"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("unique_company_custom_field_key").on(table.companyId, table.fieldKey),
  unique("idx_product_custom_field_definitions_id_company").on(table.id, table.companyId),
]);

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  categoryId: integer("category_id"),
  brandId: integer("brand_id"),
  unitId: integer("unit_id"),
  sku: text("sku"),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type", { enum: ['physical', 'service', 'digital'] }).notNull().default('physical'),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }),
  costPrice: numeric("cost_price", { precision: 12, scale: 2 }),
  currency: text("currency").default('USD'),
  estimatedDurationMinutes: integer("estimated_duration_minutes"),
  unitOfMeasure: text("unit_of_measure").default('unit'),
  barcode: text("barcode"),
  status: text("status", { enum: ['active', 'inactive', 'draft', 'archived'] }).notNull().default('draft'),
  images: jsonb("images").default('[]'),
  customFields: jsonb("custom_fields").default('{}'),
  tags: text("tags").array(),
  isTaxable: boolean("is_taxable").default(true),
  weight: numeric("weight", { precision: 10, scale: 2 }),
  minStock: numeric("min_stock", { precision: 12, scale: 2 }),
  expirationDate: date("expiration_date"),
  isMenuItem: boolean("is_menu_item").default(false),
  preparationTimeMinutes: integer("preparation_time_minutes"),
  kitchenStationId: integer("kitchen_station_id"),
  modifiers: jsonb("modifiers").default('[]'),
  comboItems: jsonb("combo_items").default('[]'),
  recipeIngredients: jsonb("recipe_ingredients").default('[]'),
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("unique_company_product_sku").on(table.companyId, table.sku),
  unique("idx_products_id_company").on(table.id, table.companyId),
  foreignKey({
    name: "products_category_company_fk",
    columns: [table.categoryId, table.companyId],
    foreignColumns: [productCategories.id, productCategories.companyId],
  }).onDelete("set null"),
  foreignKey({
    name: "products_brand_company_fk",
    columns: [table.brandId, table.companyId],
    foreignColumns: [productBrands.id, productBrands.companyId],
  }).onDelete("restrict"),
  foreignKey({
    name: "products_unit_company_fk",
    columns: [table.unitId, table.companyId],
    foreignColumns: [productUnits.id, productUnits.companyId],
  }).onDelete("restrict"),
  foreignKey({
    name: "products_kitchen_station_company_fk",
    columns: [table.kitchenStationId, table.companyId],
    foreignColumns: [restaurantKitchenStations.id, restaurantKitchenStations.companyId],
  }).onDelete("set null"),
]);

export const productVariants = pgTable("product_variants", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  sku: text("sku"),
  name: text("name").notNull(),
  attributes: jsonb("attributes").default('{}'),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }),
  costPrice: numeric("cost_price", { precision: 12, scale: 2 }),
  barcode: text("barcode"),
  status: text("status", { enum: ['active', 'inactive'] }).default('active'),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("idx_product_variants_id_company").on(table.id, table.companyId),
  uniqueIndex("unique_company_product_variant_sku")
    .on(table.companyId, table.sku)
    .where(sql`${table.sku} IS NOT NULL`),
  foreignKey({
    name: "product_variants_product_company_fk",
    columns: [table.productId, table.companyId],
    foreignColumns: [products.id, products.companyId],
  }).onDelete("cascade"),
]);

export const productPriceTiers = pgTable("product_price_tiers", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: 'cascade' }),
  variantId: integer("variant_id").references(() => productVariants.id, { onDelete: 'cascade' }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  minQuantity: integer("min_quantity").notNull(),
  maxQuantity: integer("max_quantity"),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const warehouses = pgTable("warehouses", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  address: jsonb("address").default(sql`'{}'::jsonb`),
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("idx_warehouses_id_company").on(table.id, table.companyId),
]);

export const stockLevels = pgTable("stock_levels", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  productId: integer("product_id").notNull(),
  variantId: integer("variant_id"),
  warehouseId: integer("warehouse_id").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default('0'),
  reservedQty: numeric("reserved_qty", { precision: 12, scale: 2 }).notNull().default('0'),
  reorderPoint: numeric("reorder_point", { precision: 12, scale: 2 }),
  reorderQty: numeric("reorder_qty", { precision: 12, scale: 2 }),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  /** Matches DB: one row per product × warehouse; null variant_id = base product (COALESCE in index). */
  uniqueIndex("unique_stock_product_variant_warehouse").on(
    table.productId,
    sql`COALESCE(${table.variantId}, 0)`,
    table.warehouseId
  ),
  foreignKey({
    name: "stock_levels_product_company_fk",
    columns: [table.productId, table.companyId],
    foreignColumns: [products.id, products.companyId],
  }).onDelete("cascade"),
  foreignKey({
    name: "stock_levels_variant_company_fk",
    columns: [table.variantId, table.companyId],
    foreignColumns: [productVariants.id, productVariants.companyId],
  }).onDelete("cascade"),
  foreignKey({
    name: "stock_levels_warehouse_company_fk",
    columns: [table.warehouseId, table.companyId],
    foreignColumns: [warehouses.id, warehouses.companyId],
  }).onDelete("cascade"),
]);

export const stockMovements = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  productId: integer("product_id").notNull(),
  variantId: integer("variant_id"),
  warehouseId: integer("warehouse_id").notNull(),
  movementType: text("movement_type", { enum: ['in', 'out', 'transfer', 'adjustment', 'count'] }).notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
  referenceType: text("reference_type"),
  referenceId: integer("reference_id"),
  notes: text("notes"),
  userId: integer("user_id").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  foreignKey({
    name: "stock_movements_product_company_fk",
    columns: [table.productId, table.companyId],
    foreignColumns: [products.id, products.companyId],
  }).onDelete("cascade"),
  foreignKey({
    name: "stock_movements_variant_company_fk",
    columns: [table.variantId, table.companyId],
    foreignColumns: [productVariants.id, productVariants.companyId],
  }).onDelete("cascade"),
  foreignKey({
    name: "stock_movements_warehouse_company_fk",
    columns: [table.warehouseId, table.companyId],
    foreignColumns: [warehouses.id, warehouses.companyId],
  }).onDelete("cascade"),
]);

export const stockTransfers = pgTable("stock_transfers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  transferNumber: text("transfer_number"),
  fromWarehouseId: integer("from_warehouse_id").notNull(),
  toWarehouseId: integer("to_warehouse_id").notNull(),
  status: text("status", { enum: ['draft', 'in_transit', 'completed', 'cancelled'] }).notNull().default('draft'),
  items: jsonb("items").default(sql`'[]'::jsonb`),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("unique_company_transfer_number").on(table.companyId, table.transferNumber),
  foreignKey({
    name: "stock_transfers_from_warehouse_company_fk",
    columns: [table.fromWarehouseId, table.companyId],
    foreignColumns: [warehouses.id, warehouses.companyId],
  }).onDelete("cascade"),
  foreignKey({
    name: "stock_transfers_to_warehouse_company_fk",
    columns: [table.toWarehouseId, table.companyId],
    foreignColumns: [warehouses.id, warehouses.companyId],
  }).onDelete("cascade"),
]);

export const taxTypeEnum = z.enum(['VAT', 'GST', 'sales_tax', 'withholding', 'exempt']);
export const taxAppliesToEnum = z.enum(['products', 'services', 'both']);

export const currencies = pgTable("currencies", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  exchangeRate: numeric("exchange_rate", { precision: 14, scale: 6 }).notNull(),
  isBaseCurrency: boolean("is_base_currency").default(false),
  isActive: boolean("is_active").default(true),
  decimalPlaces: integer("decimal_places").default(2),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("unique_company_currency_code").on(table.companyId, table.code),
  unique("idx_currencies_id_company").on(table.id, table.companyId),
  uniqueIndex("one_base_currency_per_company").on(table.companyId).where(sql`${table.isBaseCurrency} = true`),
]);

export const exchangeRateHistory = pgTable("exchange_rate_history", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  fromCurrency: text("from_currency").notNull(),
  toCurrency: text("to_currency").notNull(),
  rate: numeric("rate", { precision: 14, scale: 6 }).notNull(),
  effectiveDate: timestamp("effective_date").notNull(),
  source: text("source"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("exchange_rate_history_company_pair_effective_unique").on(
    table.companyId,
    table.fromCurrency,
    table.toCurrency,
    table.effectiveDate,
  ),
]);

export const taxRules = pgTable("tax_rules", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  rate: numeric("rate", { precision: 5, scale: 2 }).notNull(),
  type: text("type", { enum: ['VAT', 'GST', 'sales_tax', 'withholding', 'exempt'] }).notNull(),
  region: text("region"),
  country: text("country"),
  isDefault: boolean("is_default").default(false),
  isCompound: boolean("is_compound").default(false),
  appliesTo: text("applies_to", { enum: ['products', 'services', 'both'] }).notNull().default('both'),
  effectiveFrom: timestamp("effective_from"),
  effectiveTo: timestamp("effective_to"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("idx_tax_rules_id_company").on(table.id, table.companyId),
]);

export const taxGroups = pgTable("tax_groups", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("unique_company_tax_group_name").on(table.companyId, table.name),
  unique("idx_tax_groups_id_company").on(table.id, table.companyId),
]);

export const taxGroupRules = pgTable("tax_group_rules", {
  id: serial("id").primaryKey(),
  taxGroupId: integer("tax_group_id").notNull().references(() => taxGroups.id, { onDelete: 'cascade' }),
  taxRuleId: integer("tax_rule_id").notNull().references(() => taxRules.id, { onDelete: 'cascade' }),
  order: integer("order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("unique_tax_group_rule").on(table.taxGroupId, table.taxRuleId),
]);

export const salesOrders = pgTable("sales_orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  contactId: integer("contact_id"),
  dealId: integer("deal_id"),
  status: text("status", {
    enum: ['draft', 'quotation', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
  }).notNull().default('draft'),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default('0'),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default('0'),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull().default('0'),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default('0'),
  currency: text("currency").default('USD'),
  notes: text("notes"),
  source: text("source").notNull().default('manual'),
  flowId: integer("flow_id").references(() => flows.id, { onDelete: 'set null' }),
  channelConnectionId: integer("channel_connection_id").references(() => channelConnections.id, { onDelete: 'set null' }),
  assignedToUserId: integer("assigned_to_user_id").references(() => users.id, { onDelete: 'set null' }),
  validUntil: timestamp("valid_until"),
  shippingAddress: jsonb("shipping_address").default(sql`'{}'::jsonb`),
  billingAddress: jsonb("billing_address").default(sql`'{}'::jsonb`),
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_sales_orders_company_source").on(table.companyId, table.source),
  unique("unique_company_order_number").on(table.companyId, table.orderNumber),
  unique("idx_sales_orders_id_company").on(table.id, table.companyId),
  foreignKey({
    name: "sales_orders_contact_company_fk",
    columns: [table.contactId, table.companyId],
    foreignColumns: [contacts.id, contacts.companyId],
  }).onDelete("set null"),
  foreignKey({
    name: "sales_orders_deal_company_fk",
    columns: [table.dealId, table.companyId],
    foreignColumns: [deals.id, deals.companyId],
  }).onDelete("set null"),
]);

/** Multi-step dental treatment plans for a patient; may link to a sales quotation. */
export const dentalTreatmentPlans = pgTable("dental_treatment_plans", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  contactId: integer("contact_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", {
    enum: ['planned', 'in_progress', 'quoted', 'approved', 'invoiced', 'completed', 'cancelled'],
  }).notNull().default('planned'),
  currency: text("currency").notNull().default('USD'),
  estimatedTotal: numeric("estimated_total", { precision: 12, scale: 2 }).notNull().default('0'),
  /** Linked sales quotation / order after create-quotation. */
  salesOrderId: integer("sales_order_id"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("dental_treatment_plans_id_company_unique").on(table.id, table.companyId),
  foreignKey({
    name: "dental_treatment_plans_contact_company_fk",
    columns: [table.contactId, table.companyId],
    foreignColumns: [contacts.id, contacts.companyId],
  }).onDelete("cascade"),
  foreignKey({
    // Single-column FK: composite (sales_order_id, company_id) ON DELETE SET NULL would also
    // null company_id (NOT NULL). See migration 215. Tenant checks stay in application code.
    name: "dental_treatment_plans_sales_order_fk",
    columns: [table.salesOrderId],
    foreignColumns: [salesOrders.id],
  }).onDelete("set null"),
  index("dental_treatment_plans_company_contact_idx").on(table.companyId, table.contactId),
  index("dental_treatment_plans_company_status_idx").on(table.companyId, table.status),
]);

/** Procedure lines on a dental treatment plan; typically ERP service products. */
export const dentalTreatmentProcedures = pgTable("dental_treatment_procedures", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  planId: integer("plan_id").notNull(),
  productId: integer("product_id"),
  description: text("description").notNull(),
  toothRefs: jsonb("tooth_refs").$type<string[] | null>(),
  surfaces: text("surfaces"),
  phase: integer("phase").notNull().default(1),
  status: text("status", {
    enum: ['planned', 'in_progress', 'quoted', 'invoiced', 'completed', 'cancelled'],
  }).notNull().default('planned'),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default('1'),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull().default('0'),
  estimatedAmount: numeric("estimated_amount", { precision: 12, scale: 2 }).notNull().default('0'),
  sortOrder: integer("sort_order").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  foreignKey({
    name: "dental_treatment_procedures_plan_company_fk",
    columns: [table.planId, table.companyId],
    foreignColumns: [dentalTreatmentPlans.id, dentalTreatmentPlans.companyId],
  }).onDelete("cascade"),
  foreignKey({
    name: "dental_treatment_procedures_product_company_fk",
    columns: [table.productId, table.companyId],
    foreignColumns: [products.id, products.companyId],
  }).onDelete("set null"),
  index("dental_treatment_procedures_plan_sort_idx").on(table.companyId, table.planId, table.sortOrder),
]);

/** Audit of patient/clinic approval (or rejection) of a treatment plan quotation. */
export const dentalPlanApprovals = pgTable("dental_plan_approvals", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  planId: integer("plan_id").notNull(),
  salesOrderId: integer("sales_order_id"),
  decision: text("decision", { enum: ['approved', 'rejected'] }).notNull().default('approved'),
  notes: text("notes"),
  approvedBy: integer("approved_by").references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp("approved_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  foreignKey({
    name: "dental_plan_approvals_plan_company_fk",
    columns: [table.planId, table.companyId],
    foreignColumns: [dentalTreatmentPlans.id, dentalTreatmentPlans.companyId],
  }).onDelete("cascade"),
  // Single-column FK: composite (sales_order_id, company_id) ON DELETE SET NULL would also
  // null company_id (NOT NULL) and break SO deletes after an approval row exists.
  foreignKey({
    name: "dental_plan_approvals_sales_order_fk",
    columns: [table.salesOrderId],
    foreignColumns: [salesOrders.id],
  }).onDelete("set null"),
  index("dental_plan_approvals_company_plan_idx").on(table.companyId, table.planId),
]);

export type DentalTreatmentPlan = typeof dentalTreatmentPlans.$inferSelect;
export type InsertDentalTreatmentPlan = typeof dentalTreatmentPlans.$inferInsert;
export type DentalTreatmentProcedure = typeof dentalTreatmentProcedures.$inferSelect;
export type InsertDentalTreatmentProcedure = typeof dentalTreatmentProcedures.$inferInsert;
export type DentalPlanApproval = typeof dentalPlanApprovals.$inferSelect;
export type InsertDentalPlanApproval = typeof dentalPlanApprovals.$inferInsert;

export const insertDentalTreatmentPlanSchema = createInsertSchema(dentalTreatmentPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDentalTreatmentProcedureSchema = createInsertSchema(dentalTreatmentProcedures).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDentalPlanApprovalSchema = createInsertSchema(dentalPlanApprovals).omit({
  id: true,
  createdAt: true,
});

export const salesOrderItems = pgTable("sales_order_items", {
  id: serial("id").primaryKey(),
  salesOrderId: integer("sales_order_id").notNull().references(() => salesOrders.id, { onDelete: 'cascade' }),
  productId: integer("product_id").references(() => products.id, { onDelete: 'set null' }),
  variantId: integer("variant_id").references(() => productVariants.id, { onDelete: 'set null' }),
  description: text("description"),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default('1'),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).default('0'),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).default('0'),
  taxGroupId: integer("tax_group_id").references(() => taxGroups.id, { onDelete: 'set null' }),
  lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
  modifierSelections: jsonb("modifier_selections").default('[]'),
  specialInstructions: text("special_instructions"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const deliveryNotes = pgTable("delivery_notes", {
  id: serial("id").primaryKey(),
  salesOrderId: integer("sales_order_id").notNull().references(() => salesOrders.id, { onDelete: 'cascade' }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  deliveryNumber: text("delivery_number"),
  status: text("status", { enum: ['pending', 'shipped', 'delivered', 'failed'] }).notNull().default('pending'),
  trackingNumber: text("tracking_number"),
  carrier: text("carrier"),
  items: jsonb("items").default(sql`'[]'::jsonb`),
  notes: text("notes"),
  shippedAt: timestamp("shipped_at"),
  deliveredAt: timestamp("delivered_at"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const restaurantServiceTypeEnum = z.enum(['dine_in', 'takeaway', 'delivery']);
export const restaurantOrderContextStatusEnum = z.enum(['open', 'submitted', 'in_preparation', 'ready', 'completed', 'cancelled']);
export const restaurantReservationStatusEnum = z.enum(['booked', 'seated', 'completed', 'cancelled', 'no_show']);
export const restaurantWaitlistStatusEnum = z.enum(['waiting', 'notified', 'seated', 'left']);
export const restaurantKitchenTicketStatusEnum = z.enum(['queued', 'in_progress', 'ready', 'served', 'cancelled']);
export const restaurantKitchenTicketPriorityEnum = z.enum(['normal', 'rush', 'fire']);
export const restaurantDeliveryDispatchStatusEnum = z.enum(['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'cancelled']);

export const restaurantSections = pgTable("restaurant_sections", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  floorLevel: integer("floor_level"),
  displayColor: text("display_color"),
  layoutConfig: jsonb("layout_config"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("restaurant_sections_id_company_unique").on(table.id, table.companyId),
  unique("restaurant_sections_company_code_unique").on(table.companyId, table.code),
  unique("restaurant_sections_company_name_unique").on(table.companyId, table.name),
]);

export const restaurantTables = pgTable("restaurant_tables", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  sectionId: integer("section_id"),
  code: text("code").notNull(),
  label: text("label").notNull(),
  capacity: integer("capacity").notNull().default(1),
  posX: integer("pos_x"),
  posY: integer("pos_y"),
  layoutWidth: integer("layout_width"),
  layoutHeight: integer("layout_height"),
  rotation: integer("rotation").notNull().default(0),
  tableShape: text("table_shape"),
  tableType: text("table_type"),
  isReservable: boolean("is_reservable").notNull().default(true),
  metadata: jsonb("metadata"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("restaurant_tables_id_company_unique").on(table.id, table.companyId),
  unique("restaurant_tables_company_code_unique").on(table.companyId, table.code),
  unique("restaurant_tables_company_label_unique").on(table.companyId, table.label),
  foreignKey({
    name: "restaurant_tables_section_company_fk",
    columns: [table.sectionId, table.companyId],
    foreignColumns: [restaurantSections.id, restaurantSections.companyId],
  }).onDelete("set null"),
]);

export const restaurantKitchenStations = pgTable("restaurant_kitchen_stations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  warehouseId: integer("warehouse_id"),
  code: text("code").notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("restaurant_kitchen_stations_id_company_unique").on(table.id, table.companyId),
  unique("restaurant_kitchen_stations_company_code_unique").on(table.companyId, table.code),
  unique("restaurant_kitchen_stations_company_name_unique").on(table.companyId, table.name),
  foreignKey({
    name: "restaurant_kitchen_stations_warehouse_company_fk",
    columns: [table.warehouseId, table.companyId],
    foreignColumns: [warehouses.id, warehouses.companyId],
  }).onDelete("set null"),
]);

export const restaurantReservations = pgTable("restaurant_reservations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  contactId: integer("contact_id"),
  tableId: integer("table_id"),
  status: text("status", { enum: ['booked', 'seated', 'completed', 'cancelled', 'no_show'] }).notNull().default('booked'),
  reservationAt: timestamp("reservation_at").notNull(),
  expectedDurationMinutes: integer("expected_duration_minutes"),
  guestCount: integer("guest_count").notNull().default(1),
  guestName: text("guest_name").notNull(),
  guestPhone: text("guest_phone").notNull(),
  guestEmail: text("guest_email"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  seatedAt: timestamp("seated_at"),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("restaurant_reservations_id_company_unique").on(table.id, table.companyId),
  foreignKey({
    name: "restaurant_reservations_contact_company_fk",
    columns: [table.contactId, table.companyId],
    foreignColumns: [contacts.id, contacts.companyId],
  }).onDelete("set null"),
  foreignKey({
    name: "restaurant_reservations_table_company_fk",
    columns: [table.tableId, table.companyId],
    foreignColumns: [restaurantTables.id, restaurantTables.companyId],
  }).onDelete("set null"),
]);

export const restaurantWaitlistEntries = pgTable("restaurant_waitlist_entries", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  contactId: integer("contact_id"),
  targetTableId: integer("target_table_id"),
  status: text("status", { enum: ['waiting', 'notified', 'seated', 'left'] }).notNull().default('waiting'),
  guestCount: integer("guest_count").notNull().default(1),
  quotedWaitMinutes: integer("quoted_wait_minutes"),
  guestName: text("guest_name").notNull(),
  guestPhone: text("guest_phone").notNull(),
  guestEmail: text("guest_email"),
  notes: text("notes"),
  notifiedAt: timestamp("notified_at"),
  seatedAt: timestamp("seated_at"),
  leftAt: timestamp("left_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("restaurant_waitlist_entries_id_company_unique").on(table.id, table.companyId),
  foreignKey({
    name: "restaurant_waitlist_entries_contact_company_fk",
    columns: [table.contactId, table.companyId],
    foreignColumns: [contacts.id, contacts.companyId],
  }).onDelete("set null"),
  foreignKey({
    name: "restaurant_waitlist_entries_target_table_company_fk",
    columns: [table.targetTableId, table.companyId],
    foreignColumns: [restaurantTables.id, restaurantTables.companyId],
  }).onDelete("set null"),
]);

export const restaurantTableQrTokens = pgTable("restaurant_table_qr_tokens", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  tableId: integer("table_id").notNull(),
  token: text("token").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: timestamp("expires_at"),
  lastUsedAt: timestamp("last_used_at"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("restaurant_table_qr_tokens_id_company_unique").on(table.id, table.companyId),
  unique("restaurant_table_qr_tokens_company_table_unique").on(table.companyId, table.tableId),
  unique("restaurant_table_qr_tokens_token_unique").on(table.token),
  foreignKey({
    name: "restaurant_table_qr_tokens_table_company_fk",
    columns: [table.tableId, table.companyId],
    foreignColumns: [restaurantTables.id, restaurantTables.companyId],
  }).onDelete("cascade"),
]);

/** Structured clinical patient fields; contacts remain the identity. One profile per contact per company. */
export const dentalPatientProfiles = pgTable("dental_patient_profiles", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  contactId: integer("contact_id").notNull(),
  dateOfBirth: date("date_of_birth"),
  sex: text("sex"),
  allergies: text("allergies"),
  bloodGroup: text("blood_group"),
  medicalHistorySummary: text("medical_history_summary"),
  currentMedications: text("current_medications"),
  dentalHistorySummary: text("dental_history_summary"),
  previousDentalTreatments: text("previous_dental_treatments"),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  preferredProviderUserId: integer("preferred_provider_user_id"),
  /**
   * Provenance for the auto-add-patients policy. Only auto-created profiles with no
   * clinical history may be unlinked when the policy is switched off.
   */
  autoCreated: boolean("auto_created").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("dental_patient_profiles_id_company_unique").on(table.id, table.companyId),
  unique("dental_patient_profiles_company_contact_unique").on(table.companyId, table.contactId),
  foreignKey({
    name: "dental_patient_profiles_contact_company_fk",
    columns: [table.contactId, table.companyId],
    foreignColumns: [contacts.id, contacts.companyId],
  }).onDelete("cascade"),
  foreignKey({
    name: "dental_patient_profiles_provider_company_fk",
    columns: [table.preferredProviderUserId, table.companyId],
    foreignColumns: [users.id, users.companyId],
  }).onDelete("set null"),
  index("dental_patient_profiles_company_idx").on(table.companyId),
]);

export const restaurantOrderContexts = pgTable("restaurant_order_contexts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  salesOrderId: integer("sales_order_id").notNull(),
  serviceType: text("service_type", { enum: ['dine_in', 'takeaway', 'delivery'] }).notNull().default('dine_in'),
  status: text("status", { enum: ['open', 'submitted', 'in_preparation', 'ready', 'completed', 'cancelled'] }).notNull().default('open'),
  tableId: integer("table_id"),
  reservationId: integer("reservation_id"),
  qrTokenId: integer("qr_token_id"),
  idempotencyKey: text("idempotency_key"),
  warehouseId: integer("warehouse_id"),
  guestCount: integer("guest_count"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  assignedToUserId: integer("assigned_to_user_id").references(() => users.id, { onDelete: 'set null' }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("restaurant_order_contexts_id_company_unique").on(table.id, table.companyId),
  unique("restaurant_order_contexts_company_sales_order_unique").on(table.companyId, table.salesOrderId),
  uniqueIndex("restaurant_order_contexts_company_qr_idempotency_unique").on(
    table.companyId,
    table.qrTokenId,
    table.idempotencyKey
  ),
  foreignKey({
    name: "restaurant_order_contexts_sales_order_company_fk",
    columns: [table.salesOrderId, table.companyId],
    foreignColumns: [salesOrders.id, salesOrders.companyId],
  }).onDelete("cascade"),
  foreignKey({
    name: "restaurant_order_contexts_table_company_fk",
    columns: [table.tableId, table.companyId],
    foreignColumns: [restaurantTables.id, restaurantTables.companyId],
  }).onDelete("set null"),
  foreignKey({
    name: "restaurant_order_contexts_reservation_company_fk",
    columns: [table.reservationId, table.companyId],
    foreignColumns: [restaurantReservations.id, restaurantReservations.companyId],
  }).onDelete("set null"),
  foreignKey({
    name: "restaurant_order_contexts_qr_token_company_fk",
    columns: [table.qrTokenId, table.companyId],
    foreignColumns: [restaurantTableQrTokens.id, restaurantTableQrTokens.companyId],
  }).onDelete("set null"),
  foreignKey({
    name: "restaurant_order_contexts_warehouse_company_fk",
    columns: [table.warehouseId, table.companyId],
    foreignColumns: [warehouses.id, warehouses.companyId],
  }).onDelete("set null"),
]);

export const restaurantKitchenTickets = pgTable("restaurant_kitchen_tickets", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  orderContextId: integer("order_context_id").notNull(),
  stationId: integer("station_id").notNull(),
  ticketNumber: text("ticket_number").notNull(),
  status: text("status", { enum: ['queued', 'in_progress', 'ready', 'served', 'cancelled'] }).notNull().default('queued'),
  priority: text("priority", { enum: ['normal', 'rush', 'fire'] }).notNull().default('normal'),
  firedAt: timestamp("fired_at"),
  readyAt: timestamp("ready_at"),
  servedAt: timestamp("served_at"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("restaurant_kitchen_tickets_id_company_unique").on(table.id, table.companyId),
  unique("restaurant_kitchen_tickets_company_ticket_number_unique").on(table.companyId, table.ticketNumber),
  uniqueIndex("restaurant_kitchen_tickets_active_order_station_unique")
    .on(table.companyId, table.orderContextId, table.stationId)
    .where(sql`${table.status} IN ('queued', 'in_progress', 'ready')`),
  foreignKey({
    name: "restaurant_kitchen_tickets_order_context_company_fk",
    columns: [table.orderContextId, table.companyId],
    foreignColumns: [restaurantOrderContexts.id, restaurantOrderContexts.companyId],
  }).onDelete("cascade"),
  foreignKey({
    name: "restaurant_kitchen_tickets_station_company_fk",
    columns: [table.stationId, table.companyId],
    foreignColumns: [restaurantKitchenStations.id, restaurantKitchenStations.companyId],
  }).onDelete("restrict"),
]);

export const restaurantKitchenTicketItems = pgTable("restaurant_kitchen_ticket_items", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  ticketId: integer("ticket_id").notNull(),
  salesOrderItemId: integer("sales_order_item_id").notNull().references(() => salesOrderItems.id, { onDelete: 'restrict' }),
  productId: integer("product_id").references(() => products.id, { onDelete: 'set null' }),
  variantId: integer("variant_id").references(() => productVariants.id, { onDelete: 'set null' }),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default('1'),
  status: text("status", { enum: ['queued', 'in_progress', 'ready', 'served', 'cancelled'] }).notNull().default('queued'),
  notes: text("notes"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("restaurant_kitchen_ticket_items_id_company_unique").on(table.id, table.companyId),
  unique("restaurant_kitchen_ticket_items_ticket_line_unique").on(table.ticketId, table.salesOrderItemId),
  foreignKey({
    name: "restaurant_kitchen_ticket_items_ticket_company_fk",
    columns: [table.ticketId, table.companyId],
    foreignColumns: [restaurantKitchenTickets.id, restaurantKitchenTickets.companyId],
  }).onDelete("cascade"),
]);

export const restaurantDeliveryDispatches = pgTable("restaurant_delivery_dispatches", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  orderContextId: integer("order_context_id").notNull(),
  status: text("status", { enum: ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed', 'cancelled'] }).notNull().default('pending'),
  assignedToUserId: integer("assigned_to_user_id").references(() => users.id, { onDelete: 'set null' }),
  driverName: text("driver_name"),
  driverPhone: text("driver_phone"),
  provider: text("provider"),
  providerReference: text("provider_reference"),
  providerPayload: jsonb("provider_payload").default(sql`'{}'::jsonb`),
  assignedAt: timestamp("assigned_at"),
  pickedUpAt: timestamp("picked_up_at"),
  deliveredAt: timestamp("delivered_at"),
  failedAt: timestamp("failed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("restaurant_delivery_dispatches_id_company_unique").on(table.id, table.companyId),
  unique("restaurant_delivery_dispatches_company_order_context_unique").on(table.companyId, table.orderContextId),
  foreignKey({
    name: "restaurant_delivery_dispatches_order_context_company_fk",
    columns: [table.orderContextId, table.companyId],
    foreignColumns: [restaurantOrderContexts.id, restaurantOrderContexts.companyId],
  }).onDelete("cascade"),
]);

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  address: jsonb("address").default(sql`'{}'::jsonb`),
  taxId: text("tax_id"),
  paymentTerms: text("payment_terms"),
  currency: text("currency").default('USD'),
  notes: text("notes"),
  status: text("status", { enum: ['active', 'inactive'] }).notNull().default('active'),
  rating: integer("rating"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("idx_suppliers_id_company").on(table.id, table.companyId),
]);

export const supplierProducts = pgTable("supplier_products", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id, { onDelete: 'cascade' }),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: 'cascade' }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  supplierSku: text("supplier_sku"),
  supplierPrice: numeric("supplier_price", { precision: 12, scale: 2 }),
  leadTimeDays: integer("lead_time_days"),
  minOrderQty: integer("min_order_qty"),
  isPreferred: boolean("is_preferred").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("unique_supplier_product").on(table.supplierId, table.productId),
]);

export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  supplierId: integer("supplier_id"),
  status: text("status", {
    enum: ['draft', 'sent', 'confirmed', 'partially_received', 'received', 'cancelled'],
  }).notNull().default('draft'),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default('0'),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default('0'),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default('0'),
  currency: text("currency").default('USD'),
  expectedDeliveryDate: timestamp("expected_delivery_date"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("unique_company_po_number").on(table.companyId, table.orderNumber),
  unique("idx_purchase_orders_id_company").on(table.id, table.companyId),
  foreignKey({
    name: "purchase_orders_supplier_company_fk",
    columns: [table.supplierId, table.companyId],
    foreignColumns: [suppliers.id, suppliers.companyId],
  }).onDelete("set null"),
]);

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: serial("id").primaryKey(),
  purchaseOrderId: integer("purchase_order_id").notNull().references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  productId: integer("product_id").references(() => products.id, { onDelete: 'set null' }),
  variantId: integer("variant_id").references(() => productVariants.id, { onDelete: 'set null' }),
  description: text("description"),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default('1'),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull(),
  receivedQty: numeric("received_qty", { precision: 12, scale: 2 }).notNull().default('0'),
  lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
  taxGroupId: integer("tax_group_id").references(() => taxGroups.id, { onDelete: 'set null' }),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const goodsReceipts = pgTable("goods_receipts", {
  id: serial("id").primaryKey(),
  purchaseOrderId: integer("purchase_order_id").notNull().references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  warehouseId: integer("warehouse_id").references(() => warehouses.id, { onDelete: 'set null' }),
  receiptNumber: text("receipt_number"),
  receivedDate: timestamp("received_date").defaultNow(),
  items: jsonb("items").default(sql`'[]'::jsonb`),
  notes: text("notes"),
  receivedBy: integer("received_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const invoiceTypeEnum = z.enum(['sales_invoice', 'purchase_invoice', 'credit_note', 'debit_note']);
export const invoiceStatusEnum = z.enum(['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled', 'void']);

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  contactId: integer("contact_id"),
  supplierId: integer("supplier_id"),
  salesOrderId: integer("sales_order_id"),
  purchaseOrderId: integer("purchase_order_id"),
  type: text("type", { enum: ['sales_invoice', 'purchase_invoice', 'credit_note', 'debit_note'] }).notNull().default('sales_invoice'),
  status: text("status", { enum: ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled', 'void'] }).notNull().default('draft'),
  issueDate: timestamp("issue_date").defaultNow(),
  dueDate: timestamp("due_date"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default('0'),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default('0'),
  discountType: text("discount_type", { enum: ['none', 'percentage', 'fixed_amount'] }).notNull().default('fixed_amount'),
  discountValue: numeric("discount_value", { precision: 12, scale: 2 }).notNull().default('0'),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull().default('0'),
  tipAmount: numeric("tip_amount", { precision: 12, scale: 2 }),
  serviceChargeAmount: numeric("service_charge_amount", { precision: 12, scale: 2 }),
  serviceChargeRate: numeric("service_charge_rate", { precision: 5, scale: 2 }),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default('0'),
  splitBillGroupId: text("split_bill_group_id"),
  splitBillSeatLabel: text("split_bill_seat_label"),
  amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }).notNull().default('0'),
  amountDue: numeric("amount_due", { precision: 12, scale: 2 }).notNull().default('0'),
  currency: text("currency").default('USD'),
  notes: text("notes"),
  adjustmentReason: text("adjustment_reason"),
  parentInvoiceId: integer("parent_invoice_id"),
  termsAndConditions: text("terms_and_conditions"),
  pdfUrl: text("pdf_url"),
  paymentToken: text("payment_token"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("unique_company_invoice_number").on(table.companyId, table.invoiceNumber),
  uniqueIndex("invoices_payment_token_unique")
    .on(table.paymentToken)
    .where(sql`${table.paymentToken} IS NOT NULL`),
  unique("idx_invoices_id_company").on(table.id, table.companyId),
  /** At most one non-cancelled/non-void invoice per sales order (idempotent checkout). */
  uniqueIndex("invoices_active_sales_order_unique")
    .on(table.companyId, table.salesOrderId)
    .where(sql`${table.salesOrderId} IS NOT NULL AND ${table.status} NOT IN ('cancelled', 'void')`),
  foreignKey({
    name: "invoices_contact_company_fk",
    columns: [table.contactId, table.companyId],
    foreignColumns: [contacts.id, contacts.companyId],
  }).onDelete("set null"),
  foreignKey({
    name: "invoices_supplier_company_fk",
    columns: [table.supplierId, table.companyId],
    foreignColumns: [suppliers.id, suppliers.companyId],
  }).onDelete("set null"),
  foreignKey({
    name: "invoices_sales_order_company_fk",
    columns: [table.salesOrderId, table.companyId],
    foreignColumns: [salesOrders.id, salesOrders.companyId],
  }).onDelete("set null"),
  foreignKey({
    name: "invoices_purchase_order_company_fk",
    columns: [table.purchaseOrderId, table.companyId],
    foreignColumns: [purchaseOrders.id, purchaseOrders.companyId],
  }).onDelete("set null"),
  foreignKey({
    name: "invoices_parent_invoice_fk",
    columns: [table.parentInvoiceId, table.companyId],
    foreignColumns: [table.id, table.companyId],
  }).onDelete("set null"),
]);

export const invoiceItems = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  productId: integer("product_id").references(() => products.id, { onDelete: 'set null' }),
  description: text("description"),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default('1'),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  discountType: text("discount_type", { enum: ['percentage', 'fixed_amount'] }).notNull().default('percentage'),
  discountValue: numeric("discount_value", { precision: 12, scale: 2 }).notNull().default('0'),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).default('0'),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).default('0'),
  taxGroupId: integer("tax_group_id").references(() => taxGroups.id, { onDelete: 'set null' }),
  lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const invoicePayments = pgTable("invoice_payments", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  paymentDate: timestamp("payment_date").defaultNow(),
  paymentMethod: paymentMethodEnum("payment_method"),
  referenceNumber: text("reference_number"),
  notes: text("notes"),
  recordedBy: integer("recorded_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const erpInvoiceCheckoutSessions = pgTable("erp_invoice_checkout_sessions", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  gateway: text("gateway").notNull(),
  externalSessionId: text("external_session_id"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  status: text("status", { enum: ['pending', 'completed', 'failed', 'cancelled'] }).notNull().default('pending'),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const electronicInvoices = pgTable("electronic_invoices", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  country: text("country").notNull(), // 'CO'
  provider: text("provider").notNull(), // 'colombia_dian'
  status: text("status", { enum: ['draft', 'pending', 'validated', 'rejected', 'failed'] }).notNull().default('draft'),
  
  // Identifiers (Colombia References)
  cufe: text("cufe"), // Clave Única de Facturación Electrónica (DIAN)
  cuv: text("cuv"),   // Código Único de Validación (MinSalud MUV)
  
  // Payload & Delivery Artifacts
  xmlUrl: text("xml_url"),       // S3 or local file path to certified XML
  qrCodeText: text("qr_code_text"), // Payload encoded in the printed QR code
  ripsJsonUrl: text("rips_json_url"), // Path to generated and validated RIPS JSON support file
  
  // Error handling and telemetry
  errors: jsonb("errors").default('[]'), // Array of validation messages
  metadata: jsonb("metadata").default('{}'), // Flexible metadata (PST transaction ID, response JSON, etc.)
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("unique_invoice_electronic").on(table.invoiceId),
  index("electronic_invoices_company_idx").on(table.companyId),
]);

// ===== ACCOUNTING MODULE =====
// Zod enums for accounting
export const accountTypeEnum = z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']);
export const journalReferenceTypeEnum = z.enum(['invoice', 'payment', 'adjustment', 'opening', 'manual']);
export const journalEntryStatusEnum = z.enum(['draft', 'posted', 'reversed']);
export const arApStatusEnum = z.enum(['open', 'partially_paid', 'paid', 'overdue', 'written_off']);
export type ArApStatus = z.infer<typeof arApStatusEnum>;

export const employmentTypeEnum = z.enum(['full_time', 'part_time', 'contractor', 'intern']);
export const salaryFrequencyEnum = z.enum(['hourly', 'weekly', 'biweekly', 'monthly', 'annual']);
export const employeeStatusEnum = z.enum(['active', 'on_leave', 'terminated']);
export const leaveTypeEnum = z.enum(['annual', 'sick', 'personal', 'maternity', 'paternity', 'unpaid']);
export const leaveStatusEnum = z.enum(['pending', 'approved', 'rejected', 'cancelled']);
export const attendanceStatusEnum = z.enum(['present', 'absent', 'late', 'half_day', 'remote']);
export const payrollRunStatusEnum = z.enum(['draft', 'processing', 'completed']);

// Chart of Accounts table
export const chartOfAccounts = pgTable("chart_of_accounts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  accountCode: text("account_code").notNull(),
  name: text("name").notNull(),
  type: text("type", { enum: ['asset', 'liability', 'equity', 'revenue', 'expense'] }).notNull(),
  subType: text("sub_type"),
  parentAccountId: integer("parent_account_id"),
  isActive: boolean("is_active").default(true),
  balance: numeric("balance", { precision: 14, scale: 2 }).default('0'),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("unique_company_account_code").on(table.companyId, table.accountCode),
  unique("idx_chart_of_accounts_id_company").on(table.id, table.companyId),
  foreignKey({
    name: "chart_of_accounts_parent_fk",
    columns: [table.parentAccountId],
    foreignColumns: [table.id],
  }).onDelete("set null"),
]);

// Fiscal Years table
export const fiscalYears = pgTable("fiscal_years", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  isClosed: boolean("is_closed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("idx_fiscal_years_id_company").on(table.id, table.companyId),
]);

// Journal Entries table
export const journalEntries = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  entryNumber: text("entry_number").notNull(),
  date: timestamp("date").notNull(),
  description: text("description"),
  referenceType: text("reference_type", { enum: ['invoice', 'payment', 'adjustment', 'opening', 'manual'] }).notNull(),
  referenceId: integer("reference_id"),
  reversalOfJournalEntryId: integer("reversal_of_journal_entry_id"),
  transactionCurrency: text("transaction_currency"),
  baseCurrency: text("base_currency"),
  exchangeRate: numeric("exchange_rate", { precision: 14, scale: 6 }),
  fiscalYearId: integer("fiscal_year_id").references(() => fiscalYears.id, { onDelete: 'set null' }),
  status: text("status", { enum: ['draft', 'posted', 'reversed'] }).notNull().default('draft'),
  postedBy: integer("posted_by").references(() => users.id, { onDelete: 'set null' }),
  postedAt: timestamp("posted_at"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("unique_company_entry_number").on(table.companyId, table.entryNumber),
  unique("idx_journal_entries_id_company").on(table.id, table.companyId),
  unique("unique_journal_entry_reversal_source").on(table.reversalOfJournalEntryId),
  foreignKey({
    name: "journal_entries_reversal_of_fk",
    columns: [table.reversalOfJournalEntryId],
    foreignColumns: [table.id],
  }).onDelete("restrict"),
]);

// Journal Entry Lines table
export const journalEntryLines = pgTable("journal_entry_lines", {
  id: serial("id").primaryKey(),
  journalEntryId: integer("journal_entry_id").notNull().references(() => journalEntries.id, { onDelete: 'cascade' }),
  accountId: integer("account_id").notNull().references(() => chartOfAccounts.id, { onDelete: 'restrict' }),
  debit: numeric("debit", { precision: 14, scale: 2 }).notNull().default('0'),
  credit: numeric("credit", { precision: 14, scale: 2 }).notNull().default('0'),
  debitBase: numeric("debit_base", { precision: 14, scale: 2 }),
  creditBase: numeric("credit_base", { precision: 14, scale: 2 }),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Accounts Receivable table
export const accountsReceivable = pgTable("accounts_receivable", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  contactId: integer("contact_id"),
  invoiceId: integer("invoice_id").notNull(),
  journalEntryId: integer("journal_entry_id").references(() => journalEntries.id, { onDelete: 'set null' }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }).notNull().default('0'),
  dueDate: timestamp("due_date"),
  status: text("status", { enum: ['open', 'partially_paid', 'paid', 'overdue', 'written_off'] }).notNull().default('open'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("unique_ar_company_invoice").on(table.companyId, table.invoiceId),
  foreignKey({
    name: "accounts_receivable_contact_company_fk",
    columns: [table.contactId, table.companyId],
    foreignColumns: [contacts.id, contacts.companyId],
  }).onDelete("set null"),
  foreignKey({
    name: "accounts_receivable_invoice_company_fk",
    columns: [table.invoiceId, table.companyId],
    foreignColumns: [invoices.id, invoices.companyId],
  }).onDelete("cascade"),
]);

// Accounts Payable table
export const accountsPayable = pgTable("accounts_payable", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  supplierId: integer("supplier_id"),
  invoiceId: integer("invoice_id").notNull(),
  journalEntryId: integer("journal_entry_id").references(() => journalEntries.id, { onDelete: 'set null' }),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }).notNull().default('0'),
  dueDate: timestamp("due_date"),
  status: text("status", { enum: ['open', 'partially_paid', 'paid', 'overdue', 'written_off'] }).notNull().default('open'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("unique_ap_company_invoice").on(table.companyId, table.invoiceId),
  foreignKey({
    name: "accounts_payable_supplier_company_fk",
    columns: [table.supplierId, table.companyId],
    foreignColumns: [suppliers.id, suppliers.companyId],
  }).onDelete("set null"),
  foreignKey({
    name: "accounts_payable_invoice_company_fk",
    columns: [table.invoiceId, table.companyId],
    foreignColumns: [invoices.id, invoices.companyId],
  }).onDelete("cascade"),
]);

export const erpFlowEventDispatches = pgTable("erp_flow_event_dispatches", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  eventKey: text("event_key").notNull(),
  eventType: text("event_type").notNull(),
  flowId: integer("flow_id").notNull().references(() => flows.id, { onDelete: 'cascade' }),
  nodeId: text("node_id").notNull(),
  payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  unique("unique_erp_flow_event_dispatch_company").on(table.companyId, table.eventKey, table.flowId, table.nodeId),
]);

// ===== HR & PAYROLL =====
// Department/employee hierarchy (managerId, parentDepartmentId) is also validated in DatabaseStorage
// so relationships cannot cross companyId even if a caller bypasses HTTP routes.

export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  managerId: integer("manager_id").references(() => users.id, { onDelete: 'set null' }),
  parentDepartmentId: integer("parent_department_id"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("idx_departments_id_company").on(table.id, table.companyId),
  unique("unique_company_department_name").on(table.companyId, table.name),
  foreignKey({
    name: "departments_parent_fk",
    columns: [table.parentDepartmentId],
    foreignColumns: [table.id],
  }).onDelete("set null"),
]);

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  employeeId: text("employee_id").notNull(),
  departmentId: integer("department_id").references(() => departments.id, { onDelete: 'set null' }),
  position: text("position"),
  hireDate: timestamp("hire_date"),
  terminationDate: timestamp("termination_date"),
  employmentType: text("employment_type", { enum: ['full_time', 'part_time', 'contractor', 'intern'] }).notNull().default('full_time'),
  salary: numeric("salary", { precision: 12, scale: 2 }),
  salaryFrequency: text("salary_frequency", { enum: ['hourly', 'weekly', 'biweekly', 'monthly', 'annual'] }).notNull().default('monthly'),
  currency: text("currency").default('USD'),
  managerId: integer("manager_id"),
  emergencyContact: jsonb("emergency_contact").default('{}'),
  bankDetails: jsonb("bank_details").default('{}'),
  status: text("status", { enum: ['active', 'on_leave', 'terminated'] }).notNull().default('active'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("unique_company_user_employee").on(table.companyId, table.userId),
  unique("idx_employees_id_company").on(table.id, table.companyId),
  unique("unique_company_employee_id").on(table.companyId, table.employeeId),
  foreignKey({
    name: "employees_manager_fk",
    columns: [table.managerId],
    foreignColumns: [table.id],
  }).onDelete("set null"),
]);

export const leaveRequests = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: 'restrict' }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  leaveType: text("leave_type", { enum: ['annual', 'sick', 'personal', 'maternity', 'paternity', 'unpaid'] }).notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  days: numeric("days", { precision: 5, scale: 1 }).notNull(),
  status: text("status", { enum: ['pending', 'approved', 'rejected', 'cancelled'] }).notNull().default('pending'),
  approvedBy: integer("approved_by").references(() => users.id, { onDelete: 'set null' }),
  reason: text("reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const attendanceRecords = pgTable("attendance_records", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: 'restrict' }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  date: timestamp("date").notNull(),
  checkIn: timestamp("check_in"),
  checkOut: timestamp("check_out"),
  hoursWorked: numeric("hours_worked", { precision: 5, scale: 2 }),
  status: text("status", { enum: ['present', 'absent', 'late', 'half_day', 'remote'] }).notNull().default('present'),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("unique_employee_attendance_date").on(table.employeeId, table.date),
]);

export const payrollRuns = pgTable("payroll_runs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: 'cascade' }),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  status: text("status", { enum: ['draft', 'processing', 'completed'] }).notNull().default('draft'),
  totalGross: numeric("total_gross", { precision: 14, scale: 2 }).notNull().default('0'),
  totalDeductions: numeric("total_deductions", { precision: 14, scale: 2 }).notNull().default('0'),
  totalNet: numeric("total_net", { precision: 14, scale: 2 }).notNull().default('0'),
  currency: text("currency").default('USD'),
  notes: text("notes"),
  processedBy: integer("processed_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const payrollItems = pgTable("payroll_items", {
  id: serial("id").primaryKey(),
  payrollRunId: integer("payroll_run_id").notNull().references(() => payrollRuns.id, { onDelete: 'cascade' }),
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: 'restrict' }),
  baseSalary: numeric("base_salary", { precision: 12, scale: 2 }).notNull(),
  bonuses: numeric("bonuses", { precision: 12, scale: 2 }).notNull().default('0'),
  deductions: numeric("deductions", { precision: 12, scale: 2 }).notNull().default('0'),
  netPay: numeric("net_pay", { precision: 12, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("unique_payroll_employee").on(table.payrollRunId, table.employeeId),
]);

export const insertProductCategorySchema = createInsertSchema(productCategories).pick({
  companyId: true,
  name: true,
  description: true,
  parentCategoryId: true,
  slug: true,
  sortOrder: true,
  isMenuCategory: true,
  menuSortOrder: true,
  isActive: true,
});

export const insertProductSchema = createInsertSchema(products).pick({
  companyId: true,
  categoryId: true,
  brandId: true,
  unitId: true,
  sku: true,
  name: true,
  description: true,
  type: true,
  unitPrice: true,
  costPrice: true,
  currency: true,
  estimatedDurationMinutes: true,
  unitOfMeasure: true,
  barcode: true,
  status: true,
  images: true,
  customFields: true,
  tags: true,
  isTaxable: true,
  weight: true,
  minStock: true,
  expirationDate: true,
  isMenuItem: true,
  preparationTimeMinutes: true,
  kitchenStationId: true,
  modifiers: true,
  comboItems: true,
  recipeIngredients: true,
  createdBy: true,
});

export const insertProductVariantSchema = createInsertSchema(productVariants).pick({
  productId: true,
  companyId: true,
  sku: true,
  name: true,
  attributes: true,
  unitPrice: true,
  costPrice: true,
  barcode: true,
  status: true,
  sortOrder: true,
}).extend({
  sku: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  unitPrice: z.union([z.string(), z.number()]).nullable().optional(),
  costPrice: z.union([z.string(), z.number()]).nullable().optional(),
});

export const insertProductBrandSchema = createInsertSchema(productBrands).pick({
  companyId: true,
  name: true,
  slug: true,
  description: true,
  sortOrder: true,
  isActive: true,
});

export const insertProductUnitSchema = createInsertSchema(productUnits).pick({
  companyId: true,
  code: true,
  name: true,
  symbol: true,
  sortOrder: true,
  isActive: true,
});

export const insertProductTagMasterSchema = createInsertSchema(productTagsMaster).pick({
  companyId: true,
  name: true,
  color: true,
  sortOrder: true,
  isActive: true,
});

export const insertProductCustomFieldDefinitionSchema = createInsertSchema(productCustomFieldDefinitions).pick({
  companyId: true,
  name: true,
  fieldKey: true,
  fieldType: true,
  options: true,
  isRequired: true,
  defaultValue: true,
  sortOrder: true,
  isActive: true,
});

export const insertProductPriceTierSchema = createInsertSchema(productPriceTiers).pick({
  productId: true,
  variantId: true,
  companyId: true,
  minQuantity: true,
  maxQuantity: true,
  unitPrice: true,
});

export const insertWarehouseSchema = createInsertSchema(warehouses).pick({
  companyId: true,
  name: true,
  address: true,
  isDefault: true,
  isActive: true,
  notes: true,
});

export const insertStockLevelSchema = createInsertSchema(stockLevels).pick({
  companyId: true,
  productId: true,
  variantId: true,
  warehouseId: true,
  quantity: true,
  reservedQty: true,
  reorderPoint: true,
  reorderQty: true,
});

export const insertStockMovementSchema = createInsertSchema(stockMovements).pick({
  companyId: true,
  productId: true,
  variantId: true,
  warehouseId: true,
  movementType: true,
  quantity: true,
  referenceType: true,
  referenceId: true,
  notes: true,
  userId: true,
});

export const insertStockTransferSchema = createInsertSchema(stockTransfers).pick({
  companyId: true,
  transferNumber: true,
  fromWarehouseId: true,
  toWarehouseId: true,
  status: true,
  items: true,
  notes: true,
  createdBy: true,
});

export const insertSalesOrderSchema = createInsertSchema(salesOrders).pick({
  orderNumber: true,
  companyId: true,
  contactId: true,
  dealId: true,
  status: true,
  subtotal: true,
  taxAmount: true,
  discountAmount: true,
  totalAmount: true,
  currency: true,
  notes: true,
  source: true,
  flowId: true,
  channelConnectionId: true,
  assignedToUserId: true,
  validUntil: true,
  shippingAddress: true,
  billingAddress: true,
  createdBy: true,
});

export const insertSalesOrderItemSchema = createInsertSchema(salesOrderItems).pick({
  salesOrderId: true,
  productId: true,
  variantId: true,
  description: true,
  quantity: true,
  unitPrice: true,
  discountPercent: true,
  taxRate: true,
  taxGroupId: true,
  lineTotal: true,
  modifierSelections: true,
  specialInstructions: true,
  sortOrder: true,
});

export const deliveryNoteItemSchema = z
  .object({
    salesOrderItemId: z.number().int(),
    quantity: z.union([z.string(), z.number()]).transform((value) => String(value)),
  })
  .superRefine((value, ctx) => {
    const quantity = Number(value.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantity'],
        message: 'Quantity must be a positive number',
      });
    }
  });

export const deliveryNoteItemsSchema = z
  .array(deliveryNoteItemSchema)
  .min(1, 'At least one delivery note item is required')
  .superRefine((items, ctx) => {
    const seen = new Set<number>();
    items.forEach((item, index) => {
      if (seen.has(item.salesOrderItemId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'salesOrderItemId'],
          message: 'Duplicate sales order item references are not allowed',
        });
        return;
      }
      seen.add(item.salesOrderItemId);
    });
  });

export const insertDeliveryNoteSchema = createInsertSchema(deliveryNotes)
  .pick({
    salesOrderId: true,
    companyId: true,
    deliveryNumber: true,
    status: true,
    trackingNumber: true,
    carrier: true,
    notes: true,
    shippedAt: true,
    deliveredAt: true,
    createdBy: true,
  })
  .extend({
    items: deliveryNoteItemsSchema,
  });

export const insertRestaurantSectionSchema = createInsertSchema(restaurantSections).pick({
  companyId: true,
  code: true,
  name: true,
  description: true,
  floorLevel: true,
  displayColor: true,
  layoutConfig: true,
  sortOrder: true,
  isActive: true,
});

export const insertRestaurantTableSchema = createInsertSchema(restaurantTables).pick({
  companyId: true,
  sectionId: true,
  code: true,
  label: true,
  capacity: true,
  posX: true,
  posY: true,
  layoutWidth: true,
  layoutHeight: true,
  rotation: true,
  tableShape: true,
  tableType: true,
  isReservable: true,
  metadata: true,
  sortOrder: true,
  isActive: true,
});

export const insertRestaurantKitchenStationSchema = createInsertSchema(restaurantKitchenStations).pick({
  companyId: true,
  warehouseId: true,
  code: true,
  name: true,
  sortOrder: true,
  isActive: true,
});

export const insertRestaurantReservationSchema = createInsertSchema(restaurantReservations).pick({
  companyId: true,
  contactId: true,
  tableId: true,
  status: true,
  reservationAt: true,
  expectedDurationMinutes: true,
  guestCount: true,
  guestName: true,
  guestPhone: true,
  guestEmail: true,
  notes: true,
  createdBy: true,
  seatedAt: true,
  completedAt: true,
  cancelledAt: true,
});

export const insertRestaurantWaitlistEntrySchema = createInsertSchema(restaurantWaitlistEntries).pick({
  companyId: true,
  contactId: true,
  targetTableId: true,
  status: true,
  guestCount: true,
  quotedWaitMinutes: true,
  guestName: true,
  guestPhone: true,
  guestEmail: true,
  notes: true,
  notifiedAt: true,
  seatedAt: true,
  leftAt: true,
});

export const insertRestaurantTableQrTokenSchema = createInsertSchema(restaurantTableQrTokens).pick({
  companyId: true,
  tableId: true,
  token: true,
  isActive: true,
  expiresAt: true,
  lastUsedAt: true,
  createdBy: true,
});

export const insertDentalPatientProfileSchema = createInsertSchema(dentalPatientProfiles).pick({
  companyId: true,
  contactId: true,
  dateOfBirth: true,
  sex: true,
  allergies: true,
  bloodGroup: true,
  medicalHistorySummary: true,
  currentMedications: true,
  dentalHistorySummary: true,
  previousDentalTreatments: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  preferredProviderUserId: true,
});

export const insertRestaurantOrderContextSchema = createInsertSchema(restaurantOrderContexts).pick({
  companyId: true,
  salesOrderId: true,
  serviceType: true,
  status: true,
  tableId: true,
  reservationId: true,
  qrTokenId: true,
  warehouseId: true,
  guestCount: true,
  createdBy: true,
  assignedToUserId: true,
  notes: true,
});

export const insertRestaurantKitchenTicketSchema = createInsertSchema(restaurantKitchenTickets).pick({
  companyId: true,
  orderContextId: true,
  stationId: true,
  ticketNumber: true,
  status: true,
  priority: true,
  firedAt: true,
  readyAt: true,
  servedAt: true,
  notes: true,
  createdBy: true,
});

export const insertRestaurantKitchenTicketItemSchema = createInsertSchema(restaurantKitchenTicketItems).pick({
  companyId: true,
  ticketId: true,
  salesOrderItemId: true,
  productId: true,
  variantId: true,
  quantity: true,
  status: true,
  notes: true,
  sortOrder: true,
});

export const insertRestaurantDeliveryDispatchSchema = createInsertSchema(restaurantDeliveryDispatches).pick({
  companyId: true,
  orderContextId: true,
  status: true,
  assignedToUserId: true,
  driverName: true,
  driverPhone: true,
  provider: true,
  providerReference: true,
  providerPayload: true,
  assignedAt: true,
  pickedUpAt: true,
  deliveredAt: true,
  failedAt: true,
});

export const insertSupplierSchema = createInsertSchema(suppliers).pick({
  companyId: true,
  name: true,
  contactName: true,
  email: true,
  phone: true,
  address: true,
  taxId: true,
  paymentTerms: true,
  currency: true,
  notes: true,
  status: true,
  rating: true,
  createdBy: true,
});

export const insertSupplierProductSchema = createInsertSchema(supplierProducts).pick({
  supplierId: true,
  productId: true,
  companyId: true,
  supplierSku: true,
  supplierPrice: true,
  leadTimeDays: true,
  minOrderQty: true,
  isPreferred: true,
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).pick({
  orderNumber: true,
  companyId: true,
  supplierId: true,
  status: true,
  subtotal: true,
  taxAmount: true,
  totalAmount: true,
  currency: true,
  expectedDeliveryDate: true,
  notes: true,
  createdBy: true,
});

export const insertPurchaseOrderItemSchema = createInsertSchema(purchaseOrderItems).pick({
  purchaseOrderId: true,
  productId: true,
  variantId: true,
  description: true,
  quantity: true,
  unitCost: true,
  receivedQty: true,
  lineTotal: true,
  taxGroupId: true,
  sortOrder: true,
});

export const insertGoodsReceiptSchema = createInsertSchema(goodsReceipts).pick({
  purchaseOrderId: true,
  companyId: true,
  warehouseId: true,
  receiptNumber: true,
  receivedDate: true,
  items: true,
  notes: true,
  receivedBy: true,
});

export const insertInvoiceSchema = createInsertSchema(invoices).pick({
  invoiceNumber: true,
  companyId: true,
  contactId: true,
  supplierId: true,
  salesOrderId: true,
  purchaseOrderId: true,
  type: true,
  status: true,
  issueDate: true,
  dueDate: true,
  subtotal: true,
  taxAmount: true,
  discountType: true,
  discountValue: true,
  discountAmount: true,
  tipAmount: true,
  serviceChargeAmount: true,
  serviceChargeRate: true,
  totalAmount: true,
  splitBillGroupId: true,
  splitBillSeatLabel: true,
  amountPaid: true,
  amountDue: true,
  currency: true,
  notes: true,
  adjustmentReason: true,
  parentInvoiceId: true,
  termsAndConditions: true,
  pdfUrl: true,
  createdBy: true,
});

export const insertInvoiceItemSchema = createInsertSchema(invoiceItems).pick({
  invoiceId: true,
  productId: true,
  description: true,
  quantity: true,
  unitPrice: true,
  discountType: true,
  discountValue: true,
  discountPercent: true,
  taxRate: true,
  taxGroupId: true,
  lineTotal: true,
  sortOrder: true,
});

export const insertInvoicePaymentSchema = createInsertSchema(invoicePayments).pick({
  invoiceId: true,
  companyId: true,
  amount: true,
  paymentDate: true,
  paymentMethod: true,
  referenceNumber: true,
  notes: true,
  recordedBy: true,
});

export const insertErpInvoiceCheckoutSessionSchema = createInsertSchema(erpInvoiceCheckoutSessions).pick({
  invoiceId: true,
  companyId: true,
  gateway: true,
  externalSessionId: true,
  amount: true,
  currency: true,
  status: true,
  metadata: true,
});

export const insertElectronicInvoiceSchema = createInsertSchema(electronicInvoices).pick({
  invoiceId: true,
  companyId: true,
  country: true,
  provider: true,
  status: true,
  cufe: true,
  cuv: true,
  xmlUrl: true,
  qrCodeText: true,
  ripsJsonUrl: true,
  errors: true,
  metadata: true,
});

// Accounting insert schemas
export const insertChartOfAccountSchema = createInsertSchema(chartOfAccounts).pick({
  companyId: true,
  accountCode: true,
  name: true,
  type: true,
  subType: true,
  parentAccountId: true,
  isActive: true,
  balance: true,
  description: true,
});

export const insertFiscalYearSchema = createInsertSchema(fiscalYears).pick({
  companyId: true,
  name: true,
  startDate: true,
  endDate: true,
  isClosed: true,
}).superRefine((value, ctx) => {
  if (value.startDate instanceof Date && value.endDate instanceof Date && value.startDate >= value.endDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Fiscal year start date must be before end date',
      path: ['startDate'],
    });
  }
});

export const insertJournalEntrySchema = createInsertSchema(journalEntries).pick({
  companyId: true,
  entryNumber: true,
  date: true,
  description: true,
  referenceType: true,
  referenceId: true,
  reversalOfJournalEntryId: true,
  transactionCurrency: true,
  baseCurrency: true,
  exchangeRate: true,
  fiscalYearId: true,
  status: true,
  postedBy: true,
  postedAt: true,
  createdBy: true,
});

export const insertJournalEntryLineSchema = createInsertSchema(journalEntryLines).pick({
  journalEntryId: true,
  accountId: true,
  debit: true,
  credit: true,
  debitBase: true,
  creditBase: true,
  description: true,
});

export const insertAccountReceivableSchema = createInsertSchema(accountsReceivable).pick({
  companyId: true,
  contactId: true,
  invoiceId: true,
  journalEntryId: true,
  amount: true,
  paidAmount: true,
  dueDate: true,
  status: true,
});

export const insertAccountPayableSchema = createInsertSchema(accountsPayable).pick({
  companyId: true,
  supplierId: true,
  invoiceId: true,
  journalEntryId: true,
  amount: true,
  paidAmount: true,
  dueDate: true,
  status: true,
});

export const insertDepartmentSchema = createInsertSchema(departments).pick({
  companyId: true,
  name: true,
  managerId: true,
  parentDepartmentId: true,
  description: true,
});

export const insertEmployeeSchema = createInsertSchema(employees).pick({
  userId: true,
  companyId: true,
  employeeId: true,
  departmentId: true,
  position: true,
  hireDate: true,
  terminationDate: true,
  employmentType: true,
  salary: true,
  salaryFrequency: true,
  currency: true,
  managerId: true,
  emergencyContact: true,
  bankDetails: true,
  status: true,
});

export const insertLeaveRequestSchema = createInsertSchema(leaveRequests).pick({
  employeeId: true,
  companyId: true,
  leaveType: true,
  startDate: true,
  endDate: true,
  days: true,
  status: true,
  approvedBy: true,
  reason: true,
  notes: true,
});

export const insertAttendanceRecordSchema = createInsertSchema(attendanceRecords).pick({
  employeeId: true,
  companyId: true,
  date: true,
  checkIn: true,
  checkOut: true,
  hoursWorked: true,
  status: true,
  notes: true,
});

export const insertPayrollRunSchema = createInsertSchema(payrollRuns).pick({
  companyId: true,
  periodStart: true,
  periodEnd: true,
  status: true,
  totalGross: true,
  totalDeductions: true,
  totalNet: true,
  currency: true,
  notes: true,
  processedBy: true,
});

export const insertPayrollItemSchema = createInsertSchema(payrollItems).pick({
  payrollRunId: true,
  employeeId: true,
  baseSalary: true,
  bonuses: true,
  deductions: true,
  netPay: true,
  notes: true,
});

const positiveNumericString = (fieldName: string) =>
  z.string().refine((value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0;
  }, `${fieldName} must be a positive number`);

export const insertCurrencySchema = createInsertSchema(currencies).pick({
  companyId: true,
  code: true,
  name: true,
  symbol: true,
  exchangeRate: true,
  isBaseCurrency: true,
  isActive: true,
  decimalPlaces: true,
}).extend({
  exchangeRate: positiveNumericString('Exchange rate'),
});

export const insertExchangeRateHistorySchema = createInsertSchema(exchangeRateHistory).pick({
  companyId: true,
  fromCurrency: true,
  toCurrency: true,
  rate: true,
  effectiveDate: true,
  source: true,
}).extend({
  rate: positiveNumericString('Rate'),
});

export const insertTaxRuleSchema = createInsertSchema(taxRules).pick({
  companyId: true,
  name: true,
  rate: true,
  type: true,
  region: true,
  country: true,
  isDefault: true,
  isCompound: true,
  appliesTo: true,
  effectiveFrom: true,
  effectiveTo: true,
  isActive: true,
});

export const insertTaxGroupSchema = createInsertSchema(taxGroups).pick({
  companyId: true,
  name: true,
  description: true,
  isActive: true,
});

export const insertTaxGroupRuleSchema = createInsertSchema(taxGroupRules).pick({
  taxGroupId: true,
  taxRuleId: true,
  order: true,
});

export type ProductCategory = typeof productCategories.$inferSelect;
export type InsertProductCategory = z.infer<typeof insertProductCategorySchema>;

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type ProductBrand = typeof productBrands.$inferSelect;
export type InsertProductBrand = z.infer<typeof insertProductBrandSchema>;
export type ProductUnit = typeof productUnits.$inferSelect;
export type InsertProductUnit = z.infer<typeof insertProductUnitSchema>;
export type ProductTagMaster = typeof productTagsMaster.$inferSelect;
export type InsertProductTagMaster = z.infer<typeof insertProductTagMasterSchema>;
export type ProductCustomFieldDefinition = typeof productCustomFieldDefinitions.$inferSelect;
export type InsertProductCustomFieldDefinition = z.infer<typeof insertProductCustomFieldDefinitionSchema>;

export type ProductVariant = typeof productVariants.$inferSelect;
export type InsertProductVariant = z.infer<typeof insertProductVariantSchema>;

export type ProductPriceTier = typeof productPriceTiers.$inferSelect;
export type InsertProductPriceTier = z.infer<typeof insertProductPriceTierSchema>;

export type Warehouse = typeof warehouses.$inferSelect;
export type InsertWarehouse = z.infer<typeof insertWarehouseSchema>;

export type StockLevel = typeof stockLevels.$inferSelect;
export type InsertStockLevel = z.infer<typeof insertStockLevelSchema>;

export type StockMovement = typeof stockMovements.$inferSelect;
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;

export type StockTransfer = typeof stockTransfers.$inferSelect;
export type InsertStockTransfer = z.infer<typeof insertStockTransferSchema>;

export type SalesOrder = typeof salesOrders.$inferSelect;
export type InsertSalesOrder = z.infer<typeof insertSalesOrderSchema>;

export type SalesOrderItem = typeof salesOrderItems.$inferSelect;
export type InsertSalesOrderItem = z.infer<typeof insertSalesOrderItemSchema>;

export type DeliveryNote = typeof deliveryNotes.$inferSelect;
export type DeliveryNoteItem = z.infer<typeof deliveryNoteItemSchema>;
export type InsertDeliveryNote = z.infer<typeof insertDeliveryNoteSchema>;

export type RestaurantSection = typeof restaurantSections.$inferSelect;
export type InsertRestaurantSection = z.infer<typeof insertRestaurantSectionSchema>;

export type RestaurantTable = typeof restaurantTables.$inferSelect;
export type InsertRestaurantTable = z.infer<typeof insertRestaurantTableSchema>;

export type RestaurantKitchenStation = typeof restaurantKitchenStations.$inferSelect;
export type InsertRestaurantKitchenStation = z.infer<typeof insertRestaurantKitchenStationSchema>;

export type RestaurantReservation = typeof restaurantReservations.$inferSelect;
export type InsertRestaurantReservation = z.infer<typeof insertRestaurantReservationSchema>;

export type RestaurantWaitlistEntry = typeof restaurantWaitlistEntries.$inferSelect;
export type InsertRestaurantWaitlistEntry = z.infer<typeof insertRestaurantWaitlistEntrySchema>;

export type RestaurantTableQrToken = typeof restaurantTableQrTokens.$inferSelect;
export type InsertRestaurantTableQrToken = z.infer<typeof insertRestaurantTableQrTokenSchema>;

export type DentalPatientProfile = typeof dentalPatientProfiles.$inferSelect;
export type InsertDentalPatientProfile = z.infer<typeof insertDentalPatientProfileSchema>;

export type RestaurantOrderContext = typeof restaurantOrderContexts.$inferSelect;
export type InsertRestaurantOrderContext = z.infer<typeof insertRestaurantOrderContextSchema>;

export type RestaurantKitchenTicket = typeof restaurantKitchenTickets.$inferSelect;
export type InsertRestaurantKitchenTicket = z.infer<typeof insertRestaurantKitchenTicketSchema>;

export type RestaurantKitchenTicketItem = typeof restaurantKitchenTicketItems.$inferSelect;
export type InsertRestaurantKitchenTicketItem = z.infer<typeof insertRestaurantKitchenTicketItemSchema>;

export type RestaurantDeliveryDispatch = typeof restaurantDeliveryDispatches.$inferSelect;
export type InsertRestaurantDeliveryDispatch = z.infer<typeof insertRestaurantDeliveryDispatchSchema>;

export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;

export type SupplierProduct = typeof supplierProducts.$inferSelect;
export type InsertSupplierProduct = z.infer<typeof insertSupplierProductSchema>;

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;

export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type InsertPurchaseOrderItem = z.infer<typeof insertPurchaseOrderItemSchema>;

export type GoodsReceipt = typeof goodsReceipts.$inferSelect;
export type InsertGoodsReceipt = z.infer<typeof insertGoodsReceiptSchema>;

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;

export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;

export type InvoicePayment = typeof invoicePayments.$inferSelect;
export type InsertInvoicePayment = z.infer<typeof insertInvoicePaymentSchema>;

export type ErpInvoiceCheckoutSession = typeof erpInvoiceCheckoutSessions.$inferSelect;
export type InsertErpInvoiceCheckoutSession = z.infer<typeof insertErpInvoiceCheckoutSessionSchema>;

export type ElectronicInvoice = typeof electronicInvoices.$inferSelect;
export type InsertElectronicInvoice = z.infer<typeof insertElectronicInvoiceSchema>;

// Accounting Types
export type ChartOfAccount = typeof chartOfAccounts.$inferSelect;
export type InsertChartOfAccount = z.infer<typeof insertChartOfAccountSchema>;

export type FiscalYear = typeof fiscalYears.$inferSelect;
export type InsertFiscalYear = z.infer<typeof insertFiscalYearSchema>;

export type JournalEntry = typeof journalEntries.$inferSelect;
export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;

export type JournalEntryLine = typeof journalEntryLines.$inferSelect;
export type InsertJournalEntryLine = z.infer<typeof insertJournalEntryLineSchema>;

export type AccountReceivable = typeof accountsReceivable.$inferSelect;
export type InsertAccountReceivable = z.infer<typeof insertAccountReceivableSchema>;

export type AccountPayable = typeof accountsPayable.$inferSelect;
export type InsertAccountPayable = z.infer<typeof insertAccountPayableSchema>;

export type Department = typeof departments.$inferSelect;
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;

export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;

export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type InsertLeaveRequest = z.infer<typeof insertLeaveRequestSchema>;

export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type InsertAttendanceRecord = z.infer<typeof insertAttendanceRecordSchema>;

export type PayrollRun = typeof payrollRuns.$inferSelect;
export type InsertPayrollRun = z.infer<typeof insertPayrollRunSchema>;

export type PayrollItem = typeof payrollItems.$inferSelect;
export type InsertPayrollItem = z.infer<typeof insertPayrollItemSchema>;

export type Currency = typeof currencies.$inferSelect;
export type InsertCurrency = z.infer<typeof insertCurrencySchema>;

export type ExchangeRateHistory = typeof exchangeRateHistory.$inferSelect;
export type InsertExchangeRateHistory = z.infer<typeof insertExchangeRateHistorySchema>;

export type TaxRule = typeof taxRules.$inferSelect;
export type InsertTaxRule = z.infer<typeof insertTaxRuleSchema>;

export type TaxGroup = typeof taxGroups.$inferSelect;
export type InsertTaxGroup = z.infer<typeof insertTaxGroupSchema>;

export type TaxGroupRule = typeof taxGroupRules.$inferSelect;
export type InsertTaxGroupRule = z.infer<typeof insertTaxGroupRuleSchema>;

// Auth Background Settings Types
export type SimpleGradientConfig = {
  startColor: string;
  endColor: string;
  direction: 'to-right' | 'to-left' | 'to-top' | 'to-bottom' | 'to-br' | 'to-bl' | 'to-tr' | 'to-tl';
};

export type AdvancedGradientStop = {
  color: string;
  position: number; // 0-100
};

export type AdvancedGradientConfig = {
  stops: AdvancedGradientStop[];
  angle: number; // 0-360
};

export type GradientConfig = 
  | { mode: 'simple'; simple: SimpleGradientConfig }
  | { mode: 'advanced'; advanced: AdvancedGradientConfig };

export type AuthBackgroundConfigItem = {
  backgroundColor?: string;
  gradientConfig?: GradientConfig;
  priority: 'image' | 'color' | 'layer';
};

export type AuthBackgroundConfig = {
  adminAuthBackground?: AuthBackgroundConfigItem;
  userAuthBackground?: AuthBackgroundConfigItem;
};

// App setting keys for auth backgrounds (string URLs)
export type BrandingAdminAuthBackground = string; // URL
export type BrandingUserAuthBackground = string; // URL

export * from './frontend-website-settings';