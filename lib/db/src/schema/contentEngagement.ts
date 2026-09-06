import { pgTable, serial, varchar, date, timestamp, unique, index } from "drizzle-orm/pg-core";

// 2026-09-06: 이 두 테이블은 artifacts/api-server/src/lib/contentEngagement.ts의
// ensureTables()가 raw SQL(CREATE TABLE IF NOT EXISTS)로 직접 관리한다. blogArticles.ts와
// 동일한 이유로(주석 참고) Drizzle 스키마에 "정답지"로 등록해서, Replit 배포의 자동 스키마
// 드리프트 감지가 이 테이블들을 "제거 대상"으로 오인해 DROP TABLE을 제안하는 사고를 막는다
// (실제로 첫 배포 시도에서 content_view_events/content_likes를 통째로 DROP하려는 마이그레이션이
// 제안됐음 — 승인 전에 발견해서 취소함). 이 파일은 쿼리에 쓰이지 않고 드리프트 감지용으로만 존재한다.

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
