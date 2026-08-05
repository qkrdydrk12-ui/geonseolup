// 신규 공고 중 "홍보할 만한" 것이 등록되면 Threads 홍보 문구 초안을 자동으로
// 만들어 큐에 쌓아둔다. 실제 발행은 절대 여기서 하지 않는다 — 관리자가
// /admin 화면에서 초안을 보고 "발행" 버튼을 눌러야만 나간다 (사람 승인 필수).

import { pgPool } from "./db.js";
import { logger } from "./logger.js";

export interface ThreadsDraft {
  id: number;
  jobId: string;
  text: string;
  linkUrl: string;
  status: "pending" | "published" | "rejected";
  createdAt: string;
  publishedAt: string | null;
}

let _initialized = false;
async function ensureTable(): Promise<void> {
  if (_initialized) return;
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS threads_drafts (
      id SERIAL PRIMARY KEY,
      job_id TEXT NOT NULL,
      text TEXT NOT NULL,
      link_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      published_at TIMESTAMPTZ
    );
  `);
  _initialized = true;
}
ensureTable().catch((e) => logger.error({ err: String(e) }, "[threads-drafts] 테이블 초기화 실패"));

interface NewJobPayload {
  id: string;
  title?: string;
  region?: string;
  job?: string;
  salary?: string;
  meal?: string;
  lodging?: string;
}

// "홍보할 만한" 공고인지 판단 — 전부 다 초안을 만들면 관리자가 매번 걸러야 해서 피곤해지므로
// 숙식 둘 다 제공하거나 급여가 눈에 띄게 높은 경우만 자동 초안 대상으로 삼는다.
function isPromotable(job: NewJobPayload, salaryNum?: number): boolean {
  const bothProvided = Boolean(job.meal?.includes("제공") && job.lodging?.includes("제공"));
  const highPay = typeof salaryNum === "number" && salaryNum >= 200_000;
  return bothProvided || highPay;
}

// ── Threads 문구 생성 규칙 (C:\20260804\쓰레드 건설파일\CLAUDE_GUIDE.md 반영) ──
// 광고처럼 안 보이면서 스크롤을 멈추게 만드는 게 목표. 금지: "모집합니다",
// "지원하세요", "지금 확인하세요", "아래 링크", 손가락/숙소/불꽃/사이렌 이모지,
// 과도한 이모지. 첫 문장은 호기심·돈정보·현장분위기·경험담 중 하나로 시작하고
// 매번 다르게. 구조: 훅 → 현장조건 → 궁금해할 부분 → 지원 전 알아둘 점 →
// 자연스러운 마무리(CTA) 순서. 8~15줄, 와디즈/토스/당근마켓 톤(담백하고 세련되게).

const HOOK_TEMPLATES: ((j: NewJobPayload) => string)[] = [
  () => "생각보다 이 조건을 모르는 사람이 많습니다.",
  () => "이 공고는 조건보다 근무 방식이 더 눈에 들어옵니다.",
  (j) => `${j.region ?? "이"} 지역 현장인데도 문의가 꾸준한 이유가 있습니다.`,
  () => "일당만 보면 놓치기 쉬운 조건이 하나 있습니다.",
  (j) => `${j.job ?? "이 직종"} 공고 중에서도 눈에 띄는 조건입니다.`,
];

const CLOSING_TEMPLATES = [
  "조건이 궁금하다면 공고를 한번 살펴보세요.",
  "실제 근무 조건은 건설UP 공고에서 확인할 수 있습니다.",
  "관심 있는 분들은 상세 조건을 비교해보세요.",
];

// 문자열을 안정적인 정수로 바꿔 "랜덤처럼 보이지만 같은 공고엔 항상 같은 문구"가
// 나오게 한다 (매번 새로고침할 때마다 문구가 바뀌면 관리자가 검토하기 혼란스러움).
function stableIndex(seed: string, length: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % length;
}

function buildDraftText(job: NewJobPayload): string {
  const region = job.region || "";
  const jobType = job.job || "";
  const salary = job.salary || "";
  const mealProvided = Boolean(job.meal?.includes("제공"));
  const lodgingProvided = Boolean(job.lodging?.includes("제공"));

  const lines: string[] = [];

  // 1. 훅 — 공고 id 기반으로 매번 다른 문장 선택 (직전 글과 반복되지 않도록)
  lines.push(HOOK_TEMPLATES[stableIndex(job.id, HOOK_TEMPLATES.length)](job));
  lines.push("");

  // 2. 현장 조건
  if (salary) {
    lines.push(`${region} ${jobType} 현장인데`, `일당 ${salary} 수준입니다.`);
  } else {
    lines.push(`${region} ${jobType} 현장 공고입니다.`);
  }
  lines.push("");

  // 3. 사람들이 궁금해할 부분 (숙식 조건 — 있을 때만)
  if (lodgingProvided && mealProvided) {
    lines.push("숙소와 식사가 함께 제공돼서", "타지역에서도 문의가 들어오는 공고입니다.");
    lines.push("");
  } else if (lodgingProvided) {
    lines.push("숙소가 제공돼서", "타지역에서도 지원이 가능한 조건입니다.");
    lines.push("");
  } else if (mealProvided) {
    lines.push("식사가 제공되는 현장이라", "생활비 부담이 상대적으로 적은 편입니다.");
    lines.push("");
  }

  // 4. 지원 전에 알아둘 점
  lines.push("다만 현장마다 요구하는 경력과 이수증 조건이 다르니", "지원 전 상세 조건을 꼭 확인하는 게 좋습니다.");
  lines.push("");

  // 5. 자연스러운 마무리 (CTA)
  lines.push(CLOSING_TEMPLATES[stableIndex(job.id + "cta", CLOSING_TEMPLATES.length)]);

  return lines.join("\n");
}

export async function maybeCreateDraft(job: NewJobPayload, salaryNum?: number): Promise<void> {
  await ensureTable();
  if (!isPromotable(job, salaryNum)) return;
  try {
    await pgPool.query(
      `INSERT INTO threads_drafts (job_id, text, link_url) VALUES ($1, $2, $3)`,
      [job.id, buildDraftText(job), `https://geonseolup.com/detail/${job.id}`]
    );
    logger.info({ jobId: job.id }, "[threads-drafts] 신규 홍보 초안 생성");
  } catch (err) {
    logger.warn({ err: String(err), jobId: job.id }, "[threads-drafts] 초안 생성 실패");
  }
}

export async function listPendingDrafts(): Promise<ThreadsDraft[]> {
  await ensureTable();
  const result = await pgPool.query(
    `SELECT id, job_id AS "jobId", text, link_url AS "linkUrl", status,
            created_at AS "createdAt", published_at AS "publishedAt"
     FROM threads_drafts WHERE status = 'pending' ORDER BY created_at DESC LIMIT 30`
  );
  return result.rows;
}

export async function markDraftPublished(id: number): Promise<void> {
  await ensureTable();
  await pgPool.query(`UPDATE threads_drafts SET status = 'published', published_at = now() WHERE id = $1`, [id]);
}

export async function markDraftRejected(id: number): Promise<void> {
  await ensureTable();
  await pgPool.query(`UPDATE threads_drafts SET status = 'rejected' WHERE id = $1`, [id]);
}

export async function getDraftById(id: number): Promise<ThreadsDraft | null> {
  await ensureTable();
  const result = await pgPool.query(
    `SELECT id, job_id AS "jobId", text, link_url AS "linkUrl", status,
            created_at AS "createdAt", published_at AS "publishedAt"
     FROM threads_drafts WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}
