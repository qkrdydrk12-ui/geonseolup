import { pgTable, serial, varchar, jsonb, boolean, timestamp, text, customType } from "drizzle-orm/pg-core";

// image_data는 Postgres bytea 컬럼 — drizzle-orm에 기본 헬퍼가 없어 customType으로 선언한다.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// 2026-08-29: 이 테이블은 원래 artifacts/api-server/src/routes/blogArticles.ts의
// initTables()가 raw SQL(CREATE TABLE / ALTER TABLE ADD COLUMN IF NOT EXISTS)로 직접 관리해왔다.
// Drizzle 스키마에는 등록돼 있지 않아서, Replit 배포의 자동 스키마 드리프트 감지가
// (여기 선언 안 된) 실제 컬럼들을 "제거 대상"으로 오인해 scheduled_at 컬럼을 DROP하는
// 마이그레이션을 제안하는 사고가 있었다. 실제 운영 DB 구조와 정확히 일치하도록 등록해서
// 이 문제를 근본적으로 막는다 — 이 파일이 쿼리에 쓰이진 않고(여전히 raw SQL로 조회/저장),
// 스키마 드리프트 감지용 "정답지" 역할만 한다.
export const blogArticlesTable = pgTable("blog_articles", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 150 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  description: varchar("description", { length: 300 }).notNull(),
  emoji: varchar("emoji", { length: 10 }).notNull().default("📝"),
  body: jsonb("body").notNull().default([]),
  imageData: bytea("image_data"),
  imageMime: varchar("image_mime", { length: 50 }),
  published: boolean("published").notNull().default(true),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by"),
});
