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
  imageStyle: string | null;
  imageCopy: string | null;
  imagePrompt: string | null;
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
      published_at TIMESTAMPTZ,
      image_style TEXT,
      image_copy TEXT,
      image_prompt TEXT
    );
    ALTER TABLE threads_drafts ADD COLUMN IF NOT EXISTS image_style TEXT;
    ALTER TABLE threads_drafts ADD COLUMN IF NOT EXISTS image_copy TEXT;
    ALTER TABLE threads_drafts ADD COLUMN IF NOT EXISTS image_prompt TEXT;
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

// ── 이미지 제작 원칙 (같은 CLAUDE_GUIDE.md.txt의 "이미지 제작 원칙" 섹션 반영) ──
// 매 게시글마다 같은 스타일을 반복하지 않는다. 12종 스타일 중 최근 10개
// 게시글에 쓰인 것은 제외하고 고른다. 실제 이미지 파일 생성(AI 이미지 생성
// API 호출)은 서버가 무인으로 하지 않는다 — 여기서는 스타일 선택 + 이미지에
// 들어갈 문구 + AI 이미지 생성 프롬프트까지만 미리 준비해 관리자 화면에
// 보여주고, 실제 이미지는 그 프롬프트로 사람이(또는 요청 시 Claude가) 만든다.

interface ImageStyleDef {
  name: string;
  copy: (job: NewJobPayload) => string;
  prompt: (job: NewJobPayload) => string;
}

const IMAGE_STYLES: ImageStyleDef[] = [
  {
    name: "와디즈 랜딩페이지",
    copy: (j) => `${j.job ?? "구인"} 일당 ${j.salary ?? "협의"}`,
    prompt: (j) => `흰 배경, 굵은 산세리프 타이틀, 미니멀한 레이아웃, "${j.salary ?? "일당 협의"}" 숫자를 가장 크게 강조. 건설 구인 공고 랜딩페이지 스타일. 텍스트는 이미지 생성 후 별도로 얹을 예정이니 레이아웃 여백만 확보.`,
  },
  {
    name: "토스 스타일",
    copy: (j) => `${j.region ?? ""} ${j.job ?? ""} 조건 한눈에 보기`,
    prompt: () => `파란색(#3182F6류) 포인트 컬러, 둥근 모서리 카드 UI, 깔끔한 라인 아이콘, 여백 넉넉한 모던 핀테크 앱 스타일. 건설 구인 정보 카드 레이아웃.`,
  },
  {
    name: "애플 발표 스타일",
    copy: (j) => `${j.region ?? ""} ${j.job ?? ""} 현장`,
    prompt: () => `검정 배경, 중앙에 짧은 한 문장, 매우 넓은 여백, 프리미엄하고 절제된 키노트 발표 슬라이드 스타일. 화려한 장식 없이 타이포그래피 중심.`,
  },
  {
    name: "신문 헤드라인 스타일",
    copy: (j) => `${j.region ?? ""} ${j.job ?? ""} 일당 ${j.salary ?? ""}`,
    prompt: () => `검정과 빨강 배색, 신문 1면 헤드라인 느낌의 강한 제목 레이아웃, 정보 전달 위주의 딱딱하고 신뢰감 있는 구성.`,
  },
  {
    name: "인포그래픽 스타일",
    copy: () => "지원 전 꼭 확인할 조건",
    prompt: () => `단순한 도형과 화살표로 구성된 인포그래픽, Before/After 비교 구도, 건설 현장 관련 아이콘 활용, 파스텔 톤.`,
  },
  {
    name: "체크리스트 스타일",
    copy: () => "지원 전 체크리스트",
    prompt: (j) => `체크박스(□) 3~4개로 구성된 준비물/일당/지원조건 체크리스트 레이아웃, "${j.job ?? "현장"}" 관련 아이콘, 화이트보드나 메모지 느낌의 깔끔한 구성.`,
  },
  {
    name: "비교표 스타일",
    copy: () => "경력 있음 vs 경력 없음",
    prompt: () => `좌우 2단 비교표 레이아웃, "경력 있음" VS "경력 없음" 대비 구도, 중앙에 큰 VS 표시, 심플한 색상 대비.`,
  },
  {
    name: "숫자 강조 스타일",
    copy: (j) => `${j.salary ?? "협의"}`,
    prompt: (j) => `"${j.salary ?? "일당 협의"}" 숫자를 화면 전체에서 가장 크게 배치, 나머지 정보는 작게, 강렬한 대비의 미니멀 타이포그래피 포스터.`,
  },
  {
    name: "실제 현장 포스터 스타일",
    copy: (j) => `${j.region ?? ""} ${j.job ?? ""} 현장`,
    prompt: () => `실제 건설현장 사진 같은 거친 질감, 안전모를 쓴 작업자, 다큐멘터리 톤의 로우한 현장 포스터 스타일, 과한 보정 없이.`,
  },
  {
    name: "프리미엄 잡지 표지 스타일",
    copy: (j) => `${j.job ?? "건설"} 현장 이야기`,
    prompt: () => `잡지 표지처럼 사진을 크게 배치하고 제목은 짧고 굵게, 고급스러운 세리프 타이포그래피, 여백을 살린 에디토리얼 레이아웃.`,
  },
  {
    name: "유리모피즘 스타일",
    copy: (j) => `${j.region ?? ""} ${j.job ?? ""}`,
    prompt: () => `반투명 유리 질감의 카드(glassmorphism), 흰색/파스텔 배경 위에 블러 처리된 카드가 떠 있는 입체적인 구성.`,
  },
  {
    name: "SNS 카드뉴스 스타일",
    copy: (j) => `${j.region ?? ""} ${j.job ?? ""} 일당 ${j.salary ?? ""} 한 장 정리`,
    prompt: () => `한 장만 봐도 핵심이 이해되는 카드뉴스 레이아웃, 큰 제목 + 핵심 조건 2~3개를 아이콘과 함께 배치, SNS 피드에 최적화된 정사각형 구도.`,
  },
];

// 최근 사용한 스타일 이름 목록 (최신순, 최대 10개) — 이 안에 있는 스타일은 이번엔 제외.
async function getRecentImageStyles(limit = 10): Promise<string[]> {
  const result = await pgPool.query<{ image_style: string }>(
    `SELECT image_style FROM threads_drafts
     WHERE image_style IS NOT NULL
     ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows.map((r) => r.image_style);
}

async function pickImageStyle(): Promise<ImageStyleDef> {
  const recent = new Set(await getRecentImageStyles(10));
  const candidates = IMAGE_STYLES.filter((s) => !recent.has(s.name));
  // 12종 중 최근 10개를 제외해도 항상 최소 2개는 남는다.
  const pool = candidates.length > 0 ? candidates : IMAGE_STYLES;
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function maybeCreateDraft(job: NewJobPayload, salaryNum?: number): Promise<void> {
  await ensureTable();
  if (!isPromotable(job, salaryNum)) return;
  try {
    const style = await pickImageStyle();
    await pgPool.query(
      `INSERT INTO threads_drafts (job_id, text, link_url, image_style, image_copy, image_prompt)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        job.id,
        buildDraftText(job),
        `https://geonseolup.com/detail/${job.id}`,
        style.name,
        style.copy(job),
        style.prompt(job),
      ]
    );
    logger.info({ jobId: job.id, imageStyle: style.name }, "[threads-drafts] 신규 홍보 초안 생성");
  } catch (err) {
    logger.warn({ err: String(err), jobId: job.id }, "[threads-drafts] 초안 생성 실패");
  }
}

export async function listPendingDrafts(): Promise<ThreadsDraft[]> {
  await ensureTable();
  const result = await pgPool.query(
    `SELECT id, job_id AS "jobId", text, link_url AS "linkUrl", status,
            created_at AS "createdAt", published_at AS "publishedAt",
            image_style AS "imageStyle", image_copy AS "imageCopy", image_prompt AS "imagePrompt"
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
            created_at AS "createdAt", published_at AS "publishedAt",
            image_style AS "imageStyle", image_copy AS "imageCopy", image_prompt AS "imagePrompt"
     FROM threads_drafts WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}
