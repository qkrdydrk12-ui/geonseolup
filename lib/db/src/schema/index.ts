import { pgTable, customType, index, unique, serial, date, text, timestamp, check, smallint, varchar, boolean, jsonb, integer, foreignKey, uniqueIndex } from "drizzle-orm/pg-core"

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});
import { sql } from "drizzle-orm"



export const visitorLogs = pgTable("visitor_logs", {
	id: serial().primaryKey().notNull(),
	visitDate: date("visit_date").notNull(),
	ipHash: text("ip_hash").notNull(),
	visitedAt: timestamp("visited_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_visitor_logs_date").using("btree", table.visitDate.asc().nullsLast().op("date_ops")),
	unique("visitor_logs_visit_date_ip_hash_key").on(table.visitDate, table.ipHash),
]);

export const postCooldowns = pgTable("post_cooldowns", {
	id: serial().primaryKey().notNull(),
	phoneHash: text("phone_hash").notNull(),
	postedAt: timestamp("posted_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_post_cooldowns_hash").using("btree", table.phoneHash.asc().nullsLast().op("text_ops"), table.postedAt.asc().nullsLast().op("text_ops")),
]);

export const visitHourly = pgTable("visit_hourly", {
	id: serial().primaryKey().notNull(),
	visitDate: date("visit_date").notNull(),
	visitHour: smallint("visit_hour").notNull(),
	ipHash: varchar("ip_hash", { length: 16 }).notNull(),
}, (table) => [
	index("idx_visit_hourly_date").using("btree", table.visitDate.asc().nullsLast().op("date_ops")),
	unique("visit_hourly_visit_date_visit_hour_ip_hash_key").on(table.visitDate, table.visitHour, table.ipHash),
	check("visit_hourly_visit_hour_check", sql`(visit_hour >= 0) AND (visit_hour <= 23)`),
]);

export const emailSubscribers = pgTable("email_subscribers", {
	id: serial().primaryKey().notNull(),
	email: text().notNull(),
	region: text(),
	job: text(),
	confirmed: boolean().default(false).notNull(),
	confirmToken: text("confirm_token").notNull(),
	unsubToken: text("unsub_token").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	unique("email_subscribers_email_key").on(table.email),
]);

export const visitAttributions = pgTable("visit_attributions", {
	id: serial().primaryKey().notNull(),
	visitDate: date("visit_date").notNull(),
	source: varchar({ length: 20 }).notNull(),
	medium: varchar({ length: 50 }).default('').notNull(),
	campaign: varchar({ length: 100 }).default('').notNull(),
	content: varchar({ length: 100 }).default('').notNull(),
	landingPath: varchar("landing_path", { length: 255 }).default('/').notNull(),
	ipHash: varchar("ip_hash", { length: 16 }).notNull(),
}, (table) => [
	index("idx_visit_attributions_date").using("btree", table.visitDate.asc().nullsLast().op("date_ops")),
	unique("visit_attributions_visit_date_ip_hash_key").on(table.visitDate, table.ipHash),
]);

export const threadsDrafts = pgTable("threads_drafts", {
	id: serial().primaryKey().notNull(),
	jobId: text("job_id").notNull(),
	text: text().notNull(),
	linkUrl: text("link_url").notNull(),
	status: text().default('pending').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	publishedAt: timestamp("published_at", { withTimezone: true, mode: 'string' }),
	imageStyle: text("image_style"),
	imageCopy: text("image_copy"),
	imagePrompt: text("image_prompt"),
	// TODO: failed to parse database type 'bytea'
	imageData: bytea("image_data"),
	imageMime: text("image_mime"),
});

export const relatedLinks = pgTable("related_links", {
	key: varchar({ length: 200 }).primaryKey().notNull(),
	items: jsonb().default([]).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const blogArticles = pgTable("blog_articles", {
	id: serial().primaryKey().notNull(),
	slug: varchar({ length: 150 }).notNull(),
	title: varchar({ length: 200 }).notNull(),
	description: varchar({ length: 300 }).notNull(),
	emoji: varchar({ length: 10 }).default('📝').notNull(),
	body: jsonb().default([]).notNull(),
	// TODO: failed to parse database type 'bytea'
	imageData: bytea("image_data"),
	imageMime: varchar("image_mime", { length: 50 }),
	published: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: text("created_by"),
	scheduledAt: timestamp("scheduled_at", { withTimezone: true, mode: 'string' }),
	// 글 하단 CTA를 해당 직종 구인공고로 연결하기 위한 필드(2026-09-09 신설).
	// parseJob.ts JOBS 배열 값 중 하나(예: "덕트") 또는 미지정(null) — 미지정이면 기존처럼 홈으로 연결.
	relatedJob: varchar("related_job", { length: 30 }),
	// 글 본문 안에 인라인으로 삽입할 계산기 위젯(2026-09-10 신설, 체류시간 개선 목적).
	// 'retirement-fund' | 'net-pay' | 'severance-pay' 중 하나 또는 미지정(null) — 미지정이면 위젯 없음.
	relatedCalculator: varchar("related_calculator", { length: 30 }),
}, (table) => [
	index("idx_blog_articles_created").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	unique("blog_articles_slug_key").on(table.slug),
]);

export const jobViewEvents = pgTable("job_view_events", {
	id: serial().primaryKey().notNull(),
	jobId: text("job_id").notNull(),
	viewDate: date("view_date").notNull(),
	ipHash: varchar("ip_hash", { length: 16 }).notNull(),
	viewedAt: timestamp("viewed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_job_view_events_date").using("btree", table.viewDate.asc().nullsLast().op("date_ops")),
	index("idx_job_view_events_job").using("btree", table.jobId.asc().nullsLast().op("text_ops")),
	unique("job_view_events_job_id_view_date_ip_hash_key").on(table.jobId, table.viewDate, table.ipHash),
]);

export const threadsToken = pgTable("threads_token", {
	id: integer().default(1).primaryKey().notNull(),
	accessToken: text("access_token").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	check("threads_token_singleton", sql`id = 1`),
]);

export const pushSubscriptions = pgTable("push_subscriptions", {
	endpoint: text().primaryKey().notNull(),
	p256Dh: text("p256dh").notNull(),
	auth: text().notNull(),
	region: text(),
	job: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_push_subs_region_job").using("btree", table.region.asc().nullsLast().op("text_ops"), table.job.asc().nullsLast().op("text_ops")),
]);

export const pushPendingJobs = pgTable("push_pending_jobs", {
    jobId: text("job_id").primaryKey().notNull(),
    title: text(),
    region: text(),
    job: text(),
    salary: text(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const infoOverrides = pgTable("info_overrides", {
	slug: text().primaryKey().notNull(),
	data: jsonb().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const toonEpisodes = pgTable("toon_episodes", {
	id: serial().primaryKey().notNull(),
	slug: varchar({ length: 150 }).notNull(),
	title: varchar({ length: 200 }).notNull(),
	description: varchar({ length: 300 }).notNull(),
	disclaimer: varchar({ length: 300 }).default('이 이야기는 반도체 현장 실제 경험을 바탕으로 각색한 풍자 웹툰입니다. 등장인물 이름은 모두 허구입니다.').notNull(),
	episodeNumber: integer("episode_number").default(1).notNull(),
	published: boolean().default(true).notNull(),
	scheduledAt: timestamp("scheduled_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: text("created_by"),
}, (table) => [
	index("idx_toon_episodes_number").using("btree", table.episodeNumber.desc().nullsFirst().op("int4_ops")),
	unique("toon_episodes_slug_key").on(table.slug),
]);

export const toonPanels = pgTable("toon_panels", {
	id: serial().primaryKey().notNull(),
	episodeId: integer("episode_id").notNull(),
	panelIndex: integer("panel_index").notNull(),
	// TODO: failed to parse database type 'bytea'
	imageData: bytea("image_data").notNull(),
	imageMime: varchar("image_mime", { length: 50 }).notNull(),
	caption: varchar({ length: 300 }),
}, (table) => [
	foreignKey({
			columns: [table.episodeId],
			foreignColumns: [toonEpisodes.id],
			name: "toon_panels_episode_id_fkey"
		}).onDelete("cascade"),
	unique("toon_panels_episode_id_panel_index_key").on(table.episodeId, table.panelIndex),
]);

export const threadsPosts = pgTable("threads_posts", {
	id: serial().primaryKey().notNull(),
	threadsPostId: text("threads_post_id").notNull(),
	sourceText: text("source_text"),
	publishedAt: timestamp("published_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("threads_posts_threads_post_id_key").on(table.threadsPostId),
]);

export const threadsCommentReplies = pgTable("threads_comment_replies", {
	id: serial().primaryKey().notNull(),
	threadsPostId: text("threads_post_id").notNull(),
	commentId: text("comment_id").notNull(),
	commenterUsername: text("commenter_username"),
	commentText: text("comment_text"),
	suggestedReply: text("suggested_reply"),
	status: text().default('pending').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	repliedAt: timestamp("replied_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	unique("threads_comment_replies_comment_id_key").on(table.commentId),
]);

export const wageRates = pgTable("wage_rates", {
	id: serial().primaryKey().notNull(),
	region: varchar({ length: 50 }).notNull(),
	job: varchar({ length: 100 }).notNull(),
	wage: integer().notNull(),
	note: varchar({ length: 200 }),
	weekOf: date("week_of").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_wage_rates_week").using("btree", table.weekOf.asc().nullsLast().op("date_ops")),
]);

export const visitSources = pgTable("visit_sources", {
	id: serial().primaryKey().notNull(),
	visitDate: date("visit_date").notNull(),
	source: varchar({ length: 20 }).notNull(),
	referrerHost: varchar("referrer_host", { length: 255 }),
	ipHash: varchar("ip_hash", { length: 16 }).notNull(),
	device: varchar({ length: 10 }).default('desktop').notNull(),
}, (table) => [
	index("idx_visit_sources_date").using("btree", table.visitDate.asc().nullsLast().op("date_ops")),
	unique("visit_sources_visit_date_source_ip_hash_key").on(table.visitDate, table.source, table.ipHash),
]);

export const siteNews = pgTable("site_news", {
	id: serial().primaryKey().notNull(),
	title: varchar({ length: 200 }).notNull(),
	body: text().notNull(),
	// TODO: failed to parse database type 'bytea'
	imageData: bytea("image_data"),
	imageMime: varchar("image_mime", { length: 50 }),
	sourceLabel: varchar("source_label", { length: 50 }),
	sourceUrl: varchar("source_url", { length: 300 }),
	publishedAt: timestamp("published_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	slug: varchar({ length: 150 }),
}, (table) => [
	index("idx_site_news_published").using("btree", table.publishedAt.desc().nullsFirst().op("timestamptz_ops")),
	uniqueIndex("idx_site_news_slug").using("btree", table.slug.asc().nullsLast().op("text_ops")).where(sql`(slug IS NOT NULL)`),
]);


export const contentViewEventsTable = pgTable(
  "content_view_events",
  {
    id: serial("id").primaryKey(),
    contentType: varchar("content_type", { length: 20 }).notNull(),
    contentId: varchar("content_id", { length: 150 }).notNull(),
    viewDate: date("view_date").notNull(),
    ipHash: varchar("ip_hash", { length: 16 }).notNull(),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.contentType, table.contentId, table.viewDate, table.ipHash),
    index("idx_content_view_events_item").on(table.contentType, table.contentId),
    index("idx_content_view_events_date").on(table.viewDate),
  ]
);

export const contentLikesTable = pgTable(
  "content_likes",
  {
    id: serial("id").primaryKey(),
    contentType: varchar("content_type", { length: 20 }).notNull(),
    contentId: varchar("content_id", { length: 150 }).notNull(),
    ipHash: varchar("ip_hash", { length: 16 }).notNull(),
    likedAt: timestamp("liked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.contentType, table.contentId, table.ipHash),
    index("idx_content_likes_item").on(table.contentType, table.contentId),
  ]
);
