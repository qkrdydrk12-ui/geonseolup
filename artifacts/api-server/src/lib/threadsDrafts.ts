// 신규 공고 중 "홍보할 만한" 것이 등록되면 Threads 홍보 문구 초안을 자동으로
// 만들어 큐에 쌓아둔다. 실제 발행은 절대 여기서 하지 않는다 — 관리자가
// /admin 화면에서 초안을 보고 "발행" 버튼을 눌러야만 나간다 (사람 승인 필수).

import { pgPool } from "./db.js";
import { logger } from "./logger.js";
import { generateImage } from "./imageGen.js";

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
  hasImage: boolean;
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
      image_prompt TEXT,
      image_data BYTEA,
      image_mime TEXT
    );
    ALTER TABLE threads_drafts ADD COLUMN IF NOT EXISTS image_style TEXT;
    ALTER TABLE threads_drafts ADD COLUMN IF NOT EXISTS image_copy TEXT;
    ALTER TABLE threads_drafts ADD COLUMN IF NOT EXISTS image_prompt TEXT;
    ALTER TABLE threads_drafts ADD COLUMN IF NOT EXISTS image_data BYTEA;
    ALTER TABLE threads_drafts ADD COLUMN IF NOT EXISTS image_mime TEXT;
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

// 주의: AI 이미지 생성 모델은 이미지 안에 정확한 한글 텍스트를 그리는 데
// 취약하다 — 특정 단어·숫자를 그려달라고 요청하면 글자가 깨지거나(오타),
// 심하면 프롬프트와 전혀 무관한 엉뚱한 장면(예: 학습 데이터의 다른 광고
// 템플릿)을 대신 그려버리는 경우가 있었다(실제 테스트에서 확인됨).
// 그래서 모든 프롬프트는 "텍스트/숫자/글자 없이" 순수 비주얼만 요청하고,
// 실제 문구는 copy 필드로 별도 보관해 발행 시 캡션으로 쓴다. 매 프롬프트에
// region/job 등 실제 공고 맥락을 넣어 완전히 무관한 장면이 나오는 것도 방지.
const IMAGE_STYLES: ImageStyleDef[] = [
  {
    name: "와디즈 랜딩페이지",
    copy: (j) => `${j.job ?? "구인"} 일당 ${j.salary ?? "협의"}`,
    prompt: (j) => `${j.region ?? ""} 건설 현장, ${j.job ?? "작업자"}가 일하는 모습. 흰 배경, 미니멀한 여백 중심 레이아웃, 절제된 색감. 텍스트·숫자·글자는 절대 넣지 말 것 — 순수 이미지만.`,
  },
  {
    name: "토스 스타일",
    copy: (j) => `${j.region ?? ""} ${j.job ?? ""} 조건 한눈에 보기`,
    prompt: (j) => `${j.region ?? ""} 건설 현장 ${j.job ?? ""} 관련 장면. 파란색(#3182F6류) 포인트 컬러, 둥근 모서리 카드 UI 느낌의 배경, 깔끔한 라인 아이콘, 여백 넉넉한 모던 핀테크 앱 스타일. 텍스트·숫자·글자는 절대 넣지 말 것.`,
  },
  {
    name: "애플 발표 스타일",
    copy: (j) => `${j.region ?? ""} ${j.job ?? ""} 현장`,
    prompt: (j) => `${j.region ?? ""} 건설 현장, ${j.job ?? "작업자"} 실루엣. 검정 배경, 매우 넓은 여백, 프리미엄하고 절제된 키노트 발표 슬라이드 느낌의 미니멀한 구도. 텍스트·숫자·글자는 절대 넣지 말 것.`,
  },
  {
    name: "신문 헤드라인 스타일",
    copy: (j) => `${j.region ?? ""} ${j.job ?? ""} 일당 ${j.salary ?? ""}`,
    prompt: (j) => `${j.region ?? ""} 건설 현장에서 ${j.job ?? "작업자"}가 일하는 다큐멘터리풍 장면. 검정과 빨강 배색, 신문 1면 사진 같은 강한 구도, 정보 전달 위주의 딱딱하고 신뢰감 있는 톤. 텍스트·숫자·글자는 절대 넣지 말 것.`,
  },
  {
    name: "인포그래픽 스타일",
    copy: () => "지원 전 꼭 확인할 조건",
    prompt: (j) => `${j.job ?? "건설"} 작업 관련 단순한 도형과 화살표로 구성된 인포그래픽 스타일 배경, 건설 현장 관련 아이콘(안전모, 공구 등) 활용, 파스텔 톤. 텍스트·숫자·글자는 절대 넣지 말 것.`,
  },
  {
    name: "체크리스트 스타일",
    copy: () => "지원 전 체크리스트",
    prompt: (j) => `체크박스(□) 아이콘 3~4개가 배치된 준비물/체크리스트 느낌의 배경, "${j.job ?? "현장"}" 관련 도구·안전장비 아이콘, 화이트보드나 메모지 느낌의 깔끔한 구성. 텍스트·숫자·글자는 절대 넣지 말 것.`,
  },
  {
    name: "비교표 스타일",
    copy: () => "경력 있음 vs 경력 없음",
    prompt: (j) => `${j.job ?? "건설"} 작업자 두 명을 좌우로 대비시킨 2단 비교 구도(초보자와 숙련자), 중앙에 심플한 구분선. 심플한 색상 대비. 텍스트·숫자·글자는 절대 넣지 말 것.`,
  },
  {
    name: "숫자 강조 스타일",
    copy: (j) => `${j.salary ?? "협의"}`,
    prompt: (j) => `${j.region ?? ""} 건설 현장, ${j.job ?? "작업자"}의 모습을 중심에 두고 나머지는 여백으로 처리한 강렬한 대비의 미니멀 포스터 구도. 텍스트·숫자·글자는 절대 넣지 말 것 (숫자는 발행 시 별도 캡션으로 넣음).`,
  },
  {
    name: "실제 현장 포스터 스타일",
    copy: (j) => `${j.region ?? ""} ${j.job ?? ""} 현장`,
    prompt: (j) => `${j.region ?? ""} 실제 건설현장 사진 같은 거친 질감, 안전모를 쓴 ${j.job ?? "작업자"}, 다큐멘터리 톤의 로우한 현장 포스터 스타일, 과한 보정 없이. 텍스트·숫자·글자는 절대 넣지 말 것.`,
  },
  {
    name: "프리미엄 잡지 표지 스타일",
    copy: (j) => `${j.job ?? "건설"} 현장 이야기`,
    prompt: (j) => `${j.region ?? ""} 건설 현장에서 일하는 ${j.job ?? "작업자"}를 잡지 표지처럼 크게 담은 인물 사진 구도, 고급스러운 에디토리얼 조명과 여백. 텍스트·숫자·글자는 절대 넣지 말 것.`,
  },
  {
    name: "유리모피즘 스타일",
    copy: (j) => `${j.region ?? ""} ${j.job ?? ""}`,
    prompt: (j) => `${j.job ?? "건설"} 현장 관련 아이콘과 반투명 유리 질감의 카드(glassmorphism)가 떠 있는 입체적인 구성, 흰색/파스텔 배경. 텍스트·숫자·글자는 절대 넣지 말 것.`,
  },
  {
    name: "SNS 카드뉴스 스타일",
    copy: (j) => `${j.region ?? ""} ${j.job ?? ""} 일당 ${j.salary ?? ""} 한 장 정리`,
    prompt: (j) => `${j.region ?? ""} 건설 현장, ${j.job ?? "작업자"}가 일하는 모습을 SNS 피드에 최적화된 정사각형 구도로 담은 장면, 아이콘 몇 개로 포인트를 준 깔끔한 레이아웃. 텍스트·숫자·글자는 절대 넣지 말 것.`,
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

// 초안 생성 시점엔 이미지를 자동으로 만들지 않는다 (비용 절약 — 신규 공고마다
// 매번 생성하면 관리자가 실제로 안 쓸 이미지에도 비용이 나가게 됨). 스타일/문구/
// 프롬프트만 미리 준비해두고, 실제 이미지는 관리자가 "이미지 생성" 버튼을
// 눌렀을 때만(generateDraftImage) 그 초안 하나에 대해서 생성한다.
export async function maybeCreateDraft(job: NewJobPayload, salaryNum?: number): Promise<void> {
  await ensureTable();
  if (!isPromotable(job, salaryNum)) return;
  try {
    const style = await pickImageStyle();
    const prompt = style.prompt(job);

    await pgPool.query(
      `INSERT INTO threads_drafts (job_id, text, link_url, image_style, image_copy, image_prompt)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [job.id, buildDraftText(job), `https://geonseolup.com/detail/${job.id}`, style.name, style.copy(job), prompt]
    );
    logger.info({ jobId: job.id, imageStyle: style.name }, "[threads-drafts] 신규 홍보 초안 생성");
  } catch (err) {
    logger.warn({ err: String(err), jobId: job.id }, "[threads-drafts] 초안 생성 실패");
  }
}

// 관리자가 "이미지 생성" 버튼을 눌렀을 때만 호출 — 이 초안 하나에 대해서만
// 실제 이미지를 만들어 저장한다 (비용이 실제로 발생하는 지점).
export async function generateDraftImage(id: number): Promise<{ ok: boolean; error?: string }> {
  await ensureTable();
  const draft = await getDraftById(id);
  if (!draft) return { ok: false, error: "초안을 찾을 수 없음" };
  if (!draft.imagePrompt) return { ok: false, error: "이미지 프롬프트가 없는 초안" };

  const result = await generateImage(draft.imagePrompt);
  if (!result.ok) return { ok: false, error: result.error };

  await pgPool.query(`UPDATE threads_drafts SET image_data = $1, image_mime = $2 WHERE id = $3`, [
    result.image.data,
    result.image.mime,
    id,
  ]);
  logger.info({ draftId: id }, "[threads-drafts] 관리자 요청으로 이미지 생성 완료");
  return { ok: true };
}

export async function listPendingDrafts(): Promise<ThreadsDraft[]> {
  await ensureTable();
  const result = await pgPool.query(
    `SELECT id, job_id AS "jobId", text, link_url AS "linkUrl", status,
            created_at AS "createdAt", published_at AS "publishedAt",
            image_style AS "imageStyle", image_copy AS "imageCopy", image_prompt AS "imagePrompt",
            (image_data IS NOT NULL) AS "hasImage"
     FROM threads_drafts WHERE status = 'pending' ORDER BY created_at DESC LIMIT 30`
  );
  return result.rows;
}

// 이미지 바이트 자체는 목록 조회에 포함하지 않고(용량 부담), 실제 <img> 요청이
// 올 때만 이 함수로 별도 조회한다 (GET /api/threads-image/:id 라우트에서 사용).
export async function getDraftImage(id: number): Promise<{ data: Buffer; mime: string } | null> {
  await ensureTable();
  const result = await pgPool.query<{ image_data: Buffer | null; image_mime: string | null }>(
    `SELECT image_data, image_mime FROM threads_drafts WHERE id = $1`,
    [id]
  );
  const row = result.rows[0];
  if (!row?.image_data) return null;
  return { data: row.image_data, mime: row.image_mime || "image/png" };
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
