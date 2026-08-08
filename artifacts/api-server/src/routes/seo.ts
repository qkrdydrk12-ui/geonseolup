import { Router, type Request, type Response } from "express";
import { getPublicJobs, getPublicJobById, filterActiveJobs } from "../lib/jobsCache.js";
import { getClosesAt, getPostedAt, isJobClosed, isJobExpired, ACTIVE_HOURS } from "../lib/jobLifecycle.js";
import { logger } from "../lib/logger.js";
import { getAllInfoOverrides } from "../lib/infoOverrides.js";
import { INDEXNOW_KEY } from "../lib/indexNow.js";

const router = Router();

const SITE_URL = "https://geonseolup.com";

// ── index.html 템플릿 캐시 ──────────────────────────────────────────────────
// geonseolup(프론트) 정적 서비스가 내려주는 index.html을 그대로 가져와서
// <title>/<meta> 태그만 치환해 재사용한다. 배포마다 해시된 JS/CSS 경로가
// 바뀌므로 직접 하드코딩하지 않고, 짧은 TTL로 캐시만 해서 매 요청마다
// 다시 내려받지 않게 한다.
let _templateCache: { html: string; fetchedAt: number } | null = null;
const TEMPLATE_TTL_MS = 5 * 60_000; // 5분

async function getIndexTemplate(): Promise<string> {
  const now = Date.now();
  if (_templateCache && now - _templateCache.fetchedAt < TEMPLATE_TTL_MS) {
    return _templateCache.html;
  }
  // 개발 환경에서는 로컬 Vite 개발 서버의 index.html을 사용해야 미리보기가 정상 동작한다.
  const templateOrigin =
    process.env.NODE_ENV === "production" ? SITE_URL : "http://localhost:19759";
  const res = await fetch(`${templateOrigin}/index.html`);
  if (!res.ok) {
    throw new Error(`index.html 조회 실패 [${res.status}]`);
  }
  const html = await res.text();
  _templateCache = { html, fetchedAt: now };
  return html;
}

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeHtmlAttr(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// JSON을 <script type="application/ld+json"> 안에 안전하게 삽입하기 위한 이스케이프.
// "</script" 시퀀스가 JSON 문자열 값 안에 있으면 실제로 스크립트가 조기 종료되므로 반드시 처리해야 한다.
function escapeJsonForScriptTag(json: string): string {
  return json.replace(/<\/script/gi, "<\\/script");
}

// ── 채용공고 JobPosting 구조화 데이터 (Google 채용정보 검색 노출용) ─────────────
// https://developers.google.com/search/docs/appearance/structured-data/job-posting
function buildJobPostingLd(job: Record<string, unknown>, id: string): string {
  const region = typeof job.region === "string" ? job.region : "";
  const jobType = typeof job.job === "string" ? job.job : "";
  const salary = typeof job.salary === "string" ? job.salary : "";
  const salaryNum = typeof job.salaryNum === "number" ? job.salaryNum : undefined;
  const detail = typeof job.detail === "string" ? job.detail : "";
  const rawTitle = typeof job.title === "string" ? job.title : "";
  const company = typeof job.company === "string" && job.company ? job.company : "건설UP";
  const dateVal = typeof job.date === "string" ? job.date : undefined;

  const posted = dateVal && !isNaN(new Date(dateVal).getTime()) ? new Date(dateVal) : new Date();
  // 공고는 등록 48시간 뒤 모집마감된다. 구조화 데이터의 validThrough는
  // 화면에 표시되는 마감 상태와 반드시 일치해야 한다 (jobLifecycle.getClosesAt와 동일 규칙).
  const validThrough = getClosesAt(job) ?? new Date(posted.getTime() + ACTIVE_HOURS * 3600_000);

  const meal = typeof job.meal === "string" ? job.meal : "";
  const lodging = typeof job.lodging === "string" ? job.lodging : "";
  const descriptionParts = [
    `[${region}] ${jobType} 모집`,
    salary && `일당 ${salary}`,
    meal && `식사 ${meal}`,
    lodging && `숙박 ${lodging}`,
    detail,
  ].filter(Boolean);
  const description = descriptionParts.join(". ") || `건설 현장 ${jobType || "인력"} 구인 공고`;

  const ld: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: rawTitle || `${region} ${jobType} 모집`.trim(),
    description,
    identifier: {
      "@type": "PropertyValue",
      name: "건설UP",
      value: id,
    },
    datePosted: posted.toISOString(),
    validThrough: validThrough.toISOString(),
    employmentType: "CONTRACTOR",
    hiringOrganization: {
      "@type": "Organization",
      name: company,
      sameAs: SITE_URL,
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressRegion: region || "대한민국",
        addressCountry: "KR",
      },
    },
    directApply: true,
  };

  if (salaryNum && salaryNum > 0) {
    ld.baseSalary = {
      "@type": "MonetaryAmount",
      currency: "KRW",
      value: {
        "@type": "QuantitativeValue",
        value: salaryNum,
        unitText: "DAY",
      },
    };
  }

  return `<script type="application/ld+json">${escapeJsonForScriptTag(JSON.stringify(ld))}</script>`;
}

// BreadcrumbList 구조화 데이터 — 검색결과에 "건설UP > 서울 > 조공" 같은
// 경로 리치스니펫을 노출시켜 클릭률(CTR)을 높인다.
function buildBreadcrumbLd(items: { name: string; url: string }[]): string {
  const ld = {
    "@context": "https://schema.org/",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
  return `<script type="application/ld+json">${escapeJsonForScriptTag(JSON.stringify(ld))}</script>`;
}

// <head>의 canonical 태그를 주어진 URL로 교체. index.html 원본엔 홈 URL이
// 고정으로 박혀있어서, 이걸 안 바꾸면 모든 상세/랜딩 페이지가 "내가 원본이
// 아니라 홈이 원본"이라고 구글에 잘못 신고하는 셈이 되어 개별 페이지가
// 색인에서 홈으로 합쳐지거나 아예 빠질 수 있다 — SEO에 치명적인 버그였음.
function setCanonical(html: string, url: string): string {
  return html.replace(
    /<link rel=["']canonical["'][^>]*\/>/,
    `<link rel="canonical" href="${escapeHtmlAttr(url)}" />`
  );
}

// 지역×직종 조합별 공고 수 집계 (공고가 있는 조합만) — sitemap과 랜딩페이지가 공유.
function countRegionJobCombos(jobs: Array<Record<string, unknown>>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const j of jobs) {
    const region = typeof j.region === "string" ? j.region : "";
    const jobType = typeof j.job === "string" ? j.job : "";
    if (!region || !jobType || region === "전체" || jobType === "전체") continue;
    const key = `${region}::${jobType}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

// ── GET /{key}.txt — IndexNow 소유 확인 키 파일 ──────────────────────────────
router.get(`/${INDEXNOW_KEY}.txt`, (_req: Request, res: Response) => {
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.send(INDEXNOW_KEY);
});

// ── GET /sitemap.xml ─────────────────────────────────────────────────────────
// 정적 sitemap.xml(홈 + /post 2개)을 대체. 공개된 모든 공고 상세페이지 +
// 실제 공고가 있는 지역×직종 랜딩페이지를 포함한다.
router.get("/sitemap.xml", async (_req: Request, res: Response) => {
  try {
    const { jobs: cachedJobs } = await getPublicJobs();
    // 사이트맵에는 활성(모집 중) 공고만 포함 — 마감 공고는 제외해 검색엔진이
    // 만료된 채용정보를 새로 색인하지 않게 한다.
    const jobs = filterActiveJobs(cachedJobs);

    // 건설꿀팁·현장 소식 글 목록 — 프론트 데이터 파일과 DB 블로그 글에서 자동 수집.
    // (새 글 등록·수정 시 별도 작업 없이 사이트맵에 자동 반영, DB 글은 updated_at이 lastmod)
    const [infoArticles, newsArticles] = await Promise.all([
      getMergedInfoMeta().catch(() => [] as ArticleMeta[]),
      getMergedNewsMeta().catch(() => [] as ArticleMeta[]),
    ]);
    const toLastmod = (a: ArticleMeta): string | undefined => {
      const v = a.updated || a.date;
      if (!v) return undefined;
      const d = new Date(v);
      return isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
    };

    const staticUrls: Array<{ loc: string; changefreq: string; priority: string; lastmod?: string }> = [
      { loc: "/", changefreq: "daily", priority: "1.0" },
      { loc: "/post", changefreq: "monthly", priority: "0.7" },
      { loc: "/shop", changefreq: "weekly", priority: "0.5" },
      { loc: "/wages", changefreq: "daily", priority: "0.8" },
      { loc: "/news", changefreq: "daily", priority: "0.8" },
      { loc: "/info", changefreq: "weekly", priority: "0.7" },
      ...infoArticles.map((a) => ({
        loc: `/info/${encodeURIComponent(a.slug)}`, changefreq: "monthly", priority: "0.6",
        lastmod: toLastmod(a),
      })),
      ...newsArticles.map((a) => ({
        loc: `/news/${encodeURIComponent(a.slug)}`, changefreq: "monthly", priority: "0.6",
        lastmod: toLastmod(a),
      })),
    ];

    const jobUrls = jobs
      .filter((j) => typeof j.id === "string" && j.id)
      .map((j) => {
        const dateVal = typeof j.date === "string" ? j.date : undefined;
        const lastmod = dateVal && !isNaN(new Date(dateVal).getTime())
          ? new Date(dateVal).toISOString().slice(0, 10)
          : undefined;
        return { loc: `/detail/${j.id}`, changefreq: "daily", priority: "0.6", lastmod };
      });

    const comboCounts = countRegionJobCombos(jobs);
    const comboUrls = Array.from(comboCounts.keys()).map((key) => {
      const [region, jobType] = key.split("::");
      return {
        loc: `/jobs/${encodeURIComponent(region)}/${encodeURIComponent(jobType)}`,
        changefreq: "daily",
        priority: "0.5",
        lastmod: undefined as string | undefined,
      };
    });

    const allUrls = [...staticUrls, ...jobUrls, ...comboUrls];

    const body = allUrls
      .map((u) => {
        const lastmodTag = u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : "";
        return `  <url>
    <loc>${escapeXml(SITE_URL + u.loc)}</loc>${lastmodTag}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`;
      })
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=1800"); // 30분 — 공고는 자주 바뀌지만 캐시 부담 최소화
    res.send(xml);
  } catch (err) {
    logger.error({ err }, "[sitemap] 생성 실패");
    // 최소한 홈이라도 내려준다 (완전 실패보다 낫다)
    res.set("Content-Type", "application/xml; charset=utf-8");
    res.status(200).send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${SITE_URL}/</loc></url>\n</urlset>\n`
    );
  }
});

// ── GET /detail/:id ──────────────────────────────────────────────────────────
// 프론트 SPA와 동일한 index.html을 내려주되, 해당 공고 정보로 <head>의
// title/description/OG/Twitter 태그를 서버에서 미리 채워넣는다.
// (모든 방문자에게 동일한 내용 — 봇 전용 분기 없음. 클로킹 아님.)
router.get("/detail/:id", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const [template, job] = await Promise.all([
      getIndexTemplate(),
      getPublicJobById(id),
    ]);

    if (!job || isJobExpired(job)) {
      // 마감 후 90일 유지 기간까지 지난 공고(또는 존재하지 않는 ID)는
      // "없을 수도 있음"(404)이 아니라 "확실히 만료되어 사라짐" 상태이므로,
      // 구글이 채용정보 만료 시 권장하는 410 Gone으로 명확히 응답한다.
      // (200으로 홈 화면 껍데기를 내려주면 검색엔진이 "소프트 404"로 인식해 감점됨)
      const expiredHtml = template
        .replace(/<title>[^<]*<\/title>/, "<title>만료된 공고입니다 - 건설UP</title>")
        .replace(
          /<div id="root">[\s\S]*?<script type="module"/,
          `
    <div id="root">
      <div style="max-width:760px;margin:0 auto;padding:24px 16px;font-family:Inter,system-ui,-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#1e3a5f;line-height:1.6;text-align:center">
        <h1 style="font-size:20px;font-weight:700;color:#f97316;margin:40px 0 8px">이 공고는 만료되어 내려갔어요</h1>
        <p style="margin:0 0 20px;color:#334155">모집이 끝난 공고는 90일이 지나면 삭제됩니다. 지금 올라와 있는 다른 공고를 확인해보세요.</p>
        <p><a href="/" style="color:#f97316;font-weight:700;text-decoration:underline">건설UP 홈에서 다른 공고 보기 →</a></p>
      </div>
    </div>
    <script type="module"`
        );
      res.set("Content-Type", "text/html; charset=utf-8");
      res.status(410).send(expiredHtml);
      return;
    }

    const closed = isJobClosed(job);

    const region = typeof job.region === "string" ? job.region : "";
    const jobType = typeof job.job === "string" ? job.job : "";
    const salary = typeof job.salary === "string" ? job.salary : "";
    const detail = typeof job.detail === "string" ? job.detail : "";
    const rawTitle = typeof job.title === "string" ? job.title : "";
    const meal = typeof job.meal === "string" ? job.meal : "";
    const lodging = typeof job.lodging === "string" ? job.lodging : "";

    // 숙식 요약: "숙식 제공" / "숙소 제공" / "식사 제공" / "숙식 미제공" 등
    const mealYes = meal.includes("제공") && !meal.includes("미제공");
    const lodgYes = lodging.includes("제공") && !lodging.includes("미제공");
    const stay =
      mealYes && lodgYes
        ? "숙식 제공"
        : [lodgYes && "숙소 제공", mealYes && "식사 제공"].filter(Boolean).join(" · ") ||
          ((meal || lodging) ? "숙식 문의" : "");

    // 브라우저 제목 — 지역·직종·급여·숙식이 모두 들어간 공고별 고유 제목.
    const titleCore =
      [region && `[${region}]`, jobType, salary && `일당 ${salary}`, stay]
        .filter(Boolean)
        .join(" ") || rawTitle || "건설 구인 공고";
    const closedPrefix = closed ? "[모집마감] " : "";
    const pageTitle = escapeHtmlAttr(`${closedPrefix}${titleCore} - 건설UP`);

    const descParts = closed
      ? [
          "이 공고는 모집이 마감되었습니다.",
          region && `지역: ${region}`,
          jobType && `직종: ${jobType}`,
          "같은 지역·직종의 진행 중인 공고를 건설UP에서 확인하세요.",
        ]
      : [
          region && `지역: ${region}`,
          jobType && `직종: ${jobType}`,
          salary && `급여: ${salary}`,
          meal && `식사: ${meal}`,
          lodging && `숙박: ${lodging}`,
          detail,
        ];
    const pageDesc = escapeHtmlAttr(
      (descParts.filter(Boolean).join(" | ") || "전국 건설 현장 실시간 구인구직 정보").slice(0, 160)
    );

    const pageUrl = `${SITE_URL}/detail/${encodeURIComponent(id)}`;

    let html = template;
    // <title>...</title>
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${pageTitle}</title>`);
    // meta description / og:description / twitter:description
    html = html.replace(
      /(<meta[^>]*name=["']description["'][^>]*content=)["'][^"']*["']/,
      `$1"${pageDesc}"`
    );
    html = html.replace(
      /(<meta[^>]*property=["']og:description["'][^>]*content=)["'][^"']*["']/,
      `$1"${pageDesc}"`
    );
    html = html.replace(
      /(<meta[^>]*name=["']twitter:description["'][^>]*content=)["'][^"']*["']/,
      `$1"${pageDesc}"`
    );
    // og:title / twitter:title
    html = html.replace(
      /(<meta[^>]*property=["']og:title["'][^>]*content=)["'][^"']*["']/,
      `$1"${pageTitle}"`
    );
    html = html.replace(
      /(<meta[^>]*name=["']twitter:title["'][^>]*content=)["'][^"']*["']/,
      `$1"${pageTitle}"`
    );
    // og:url
    html = html.replace(
      /(<meta[^>]*property=["']og:url["'][^>]*content=)["'][^"']*["']/,
      `$1"${pageUrl}"`
    );
    // canonical — 원본 index.html엔 홈 URL이 고정 박혀있어 반드시 이 페이지 URL로 교체해야 함.
    html = setCanonical(html, pageUrl);

    // JobPosting 구조화 데이터 삽입 (Google 채용정보 검색 노출 자격 부여).
    // 등록일이 없거나 깨진 공고는 datePosted/validThrough를 지어낼 수 없으므로 생략한다.
    const jobPostingLd = getPostedAt(job) ? buildJobPostingLd(job, id) : "";
    // BreadcrumbList: 홈 > (지역 직종 랜딩페이지) > 공고 상세
    const breadcrumbLd = buildBreadcrumbLd([
      { name: "건설UP", url: SITE_URL },
      ...(region && jobType
        ? [{ name: `${region} ${jobType}`, url: `${SITE_URL}/jobs/${encodeURIComponent(region)}/${encodeURIComponent(jobType)}` }]
        : []),
      { name: pageTitle.replace(/ - 건설UP$/, ""), url: pageUrl },
    ]);
    html = html.replace("</head>", `  ${jobPostingLd}\n  ${breadcrumbLd}\n  </head>`);

    // <div id="root"> 안의 정적 폴백 본문(크롤러/JS 미실행 환경용)을
    // 이 공고 전용 내용으로 교체 — React가 mount되면 어차피 덮어써지므로
    // 실제 사용자 경험에는 영향이 없다.
    const closedBanner = closed
      ? `<p style="margin:0 0 16px;padding:12px 14px;border-radius:10px;background:#fef2f2;border:1.5px solid #fca5a5;color:#b91c1c;font-weight:700">이 공고는 모집이 마감되었습니다. 아래에서 진행 중인 다른 공고를 확인해보세요.</p>`
      : "";
    const fallbackBody = `
    <div id="root">
      <div style="max-width:760px;margin:0 auto;padding:24px 16px;font-family:Inter,system-ui,-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#1e3a5f;line-height:1.6">
        <h1 style="font-size:22px;font-weight:700;color:#f97316;margin:0 0 8px">${escapeHtmlAttr(closedPrefix + (rawTitle || titleCore))}</h1>
        ${closedBanner}
        <p style="margin:0 0 16px;color:#334155">
          ${[region && `지역: ${escapeHtmlAttr(region)}`, jobType && `직종: ${escapeHtmlAttr(jobType)}`, salary && `급여: ${escapeHtmlAttr(salary)}`, meal && `식사: ${escapeHtmlAttr(meal)}`, lodging && `숙박: ${escapeHtmlAttr(lodging)}`].filter(Boolean).join(" · ")}
        </p>
        ${detail ? `<p style="margin:0 0 16px;color:#334155">${escapeHtmlAttr(detail)}</p>` : ""}
        <p style="margin:0;color:#64748b;font-size:14px">
          페이지를 불러오는 중입니다… 잠시만 기다려 주세요.
          <noscript>이 사이트는 최신 브라우저(JavaScript 사용)에서 정상적으로 표시됩니다.</noscript>
        </p>
      </div>
    </div>
    <script type="module"`;
    html = html.replace(/<div id="root">[\s\S]*?<script type="module"/, fallbackBody);

    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", "public, max-age=60"); // 짧게 — 공고 상태(마감 등) 변경 반영
    res.send(html);
  } catch (err) {
    logger.error({ err, id }, "[detail-seo] 렌더링 실패");
    // 실패해도 SPA 자체는 뜨도록 원본 템플릿 폴백
    try {
      const template = await getIndexTemplate();
      res.set("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(template);
    } catch {
      res.status(500).send("Internal Server Error");
    }
  }
});

// ── GET /jobs/:region/:job ───────────────────────────────────────────────────
// 지역×직종 SEO 랜딩페이지. "화성 조공 구인", "용인 용접 일당" 같은 롱테일 검색을
// 겨냥한 전용 URL. React 쪽 Home 컴포넌트가 동일 필터로 렌더링하므로 실제 방문자
// 경험은 동일하고, 여기서는 <head>와 크롤러용 폴백 본문만 채워준다.
router.get("/jobs/:region/:job", async (req: Request, res: Response) => {
  const region = decodeURIComponent(String(req.params.region));
  const jobType = decodeURIComponent(String(req.params.job));
  try {
    const [template, { jobs }] = await Promise.all([getIndexTemplate(), getPublicJobs()]);

    const matched = jobs.filter(
      (j) => (typeof j.region === "string" ? j.region : "") === region &&
             (typeof j.job === "string" ? j.job : "") === jobType
    );

    const pageTitle = escapeHtmlAttr(`${region} ${jobType} 구인 공고 (${matched.length}건) - 건설UP`);
    const pageDesc = escapeHtmlAttr(
      `${region} 지역 ${jobType} 실시간 구인 공고 ${matched.length}건. 전국 건설 현장 일자리 정보를 건설UP에서 확인하세요.`.slice(0, 160)
    );
    const pageUrl = `${SITE_URL}/jobs/${encodeURIComponent(region)}/${encodeURIComponent(jobType)}`;

    let html = template;
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${pageTitle}</title>`);
    html = html.replace(
      /(<meta[^>]*name=["']description["'][^>]*content=)["'][^"']*["']/,
      `$1"${pageDesc}"`
    );
    html = html.replace(
      /(<meta[^>]*property=["']og:description["'][^>]*content=)["'][^"']*["']/,
      `$1"${pageDesc}"`
    );
    html = html.replace(
      /(<meta[^>]*name=["']twitter:description["'][^>]*content=)["'][^"']*["']/,
      `$1"${pageDesc}"`
    );
    html = html.replace(
      /(<meta[^>]*property=["']og:title["'][^>]*content=)["'][^"']*["']/,
      `$1"${pageTitle}"`
    );
    html = html.replace(
      /(<meta[^>]*name=["']twitter:title["'][^>]*content=)["'][^"']*["']/,
      `$1"${pageTitle}"`
    );
    html = html.replace(
      /(<meta[^>]*property=["']og:url["'][^>]*content=)["'][^"']*["']/,
      `$1"${pageUrl}"`
    );

    // 이 지역×직종 조합 전용 RSS 피드로 자동발견 태그를 교체 (전체 피드 대신).
    const regionJobRssUrl = `${SITE_URL}/rss/${encodeURIComponent(region)}/${encodeURIComponent(jobType)}`;
    html = html.replace(
      /<link rel=["']alternate["'] type=["']application\/rss\+xml["'][^>]*\/>/,
      `<link rel="alternate" type="application/rss+xml" title="${escapeHtmlAttr(`건설UP ${region} ${jobType} 구인 공고`)}" href="${regionJobRssUrl}" />`
    );
    // canonical — 홈 URL 고정값을 이 랜딩페이지 URL로 교체 (동일한 버그, 동일한 이유로 수정).
    html = setCanonical(html, pageUrl);
    // BreadcrumbList: 홈 > 지역 직종 구인 공고
    const breadcrumbLd = buildBreadcrumbLd([
      { name: "건설UP", url: SITE_URL },
      { name: `${region} ${jobType} 구인 공고`, url: pageUrl },
    ]);
    html = html.replace("</head>", `  ${breadcrumbLd}\n  </head>`);

    // 크롤러용 폴백 본문: 실제 매칭 공고 목록(제목+급여+링크)을 그대로 나열.
    // 실사용자는 React가 mount되면서 동일 필터가 적용된 실제 UI로 바로 교체됨.
    const listItems = matched
      .slice(0, 50)
      .map((j) => {
        const id = typeof j.id === "string" ? j.id : "";
        const title = typeof j.title === "string" ? j.title : `${region} ${jobType} 모집`;
        const salary = typeof j.salary === "string" ? j.salary : "";
        return `<li style="margin-bottom:10px"><a href="/detail/${encodeURIComponent(id)}" style="color:#1e3a5f;font-weight:600;text-decoration:underline">${escapeHtmlAttr(title)}</a>${salary ? ` — ${escapeHtmlAttr(salary)}` : ""}</li>`;
      })
      .join("\n");

    const fallbackBody = `
    <div id="root">
      <div style="max-width:760px;margin:0 auto;padding:24px 16px;font-family:Inter,system-ui,-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#1e3a5f;line-height:1.6">
        <h1 style="font-size:22px;font-weight:700;color:#f97316;margin:0 0 8px">${escapeHtmlAttr(region)} ${escapeHtmlAttr(jobType)} 구인 공고</h1>
        <p style="margin:0 0 16px;color:#334155">현재 ${matched.length}건의 공고가 등록되어 있습니다.</p>
        ${matched.length > 0 ? `<ul style="list-style:none;padding:0;margin:0 0 16px">${listItems}</ul>` : `<p style="margin:0 0 16px;color:#64748b">현재 조건에 맞는 공고가 없습니다. 다른 지역/직종도 확인해보세요.</p>`}
        <p style="margin:0;color:#64748b;font-size:14px">
          페이지를 불러오는 중입니다… 잠시만 기다려 주세요.
          <noscript>이 사이트는 최신 브라우저(JavaScript 사용)에서 정상적으로 표시됩니다.</noscript>
        </p>
      </div>
    </div>
    <script type="module"`;
    html = html.replace(/<div id="root">[\s\S]*?<script type="module"/, fallbackBody);

    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", "public, max-age=120");
    res.send(html);
  } catch (err) {
    logger.error({ err, region, jobType }, "[jobs-landing-seo] 렌더링 실패");
    try {
      const template = await getIndexTemplate();
      res.set("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(template);
    } catch {
      res.status(500).send("Internal Server Error");
    }
  }
});

// ── GET /info, /info/:slug ──────────────────────────────────────────────────
// 정보/꿀팁 글 공유 미리보기(OG 태그) 대응. SPA라서 크롤러가 대표 이미지만 보던 문제를
// 서버에서 글별 제목·설명·헤더 이미지로 치환해 해결한다.
// 글 데이터 원본은 프론트(infoData.ts)에 있으므로, 그 파일을 읽어 slug/title/description만
// 추출해 캐시한다 (새 글이 추가돼도 별도 작업 없이 자동 반영).
import {
  getInfoMeta,
  getNewsMeta,
  getBlogArticleMeta,
  getMergedInfoMeta,
  getMergedNewsMeta,
  getBlogArticleFull,
  getSiteNewsFull,
  type ArticleMeta,
} from "../lib/articleMeta";

// Article/NewsArticle 구조화 데이터 — 글별 검색 노출용.
function buildArticleLd(opts: {
  type: "Article" | "NewsArticle";
  headline: string;
  description: string;
  url: string;
  image: string;
  datePublished?: string;
  dateModified?: string;
}): string {
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": opts.type,
    headline: opts.headline,
    description: opts.description,
    image: [opts.image],
    mainEntityOfPage: { "@type": "WebPage", "@id": opts.url },
    author: { "@type": "Organization", name: "건설UP", url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: "건설UP",
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/og-image.png?v=2` },
    },
    inLanguage: "ko",
  };
  if (opts.datePublished) ld.datePublished = opts.datePublished;
  if (opts.dateModified || opts.datePublished) ld.dateModified = opts.dateModified || opts.datePublished;
  return `<script type="application/ld+json">${escapeJsonForScriptTag(JSON.stringify(ld))}</script>`;
}

function replaceMetaTags(template: string, opts: { title: string; desc: string; url: string; image: string }): string {
  const title = escapeHtmlAttr(opts.title);
  const desc = escapeHtmlAttr(opts.desc);
  let html = template;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  html = html.replace(/(<meta[^>]*name=["']description["'][^>]*content=)["'][^"']*["']/, `$1"${desc}"`);
  html = html.replace(/(<meta[^>]*property=["']og:description["'][^>]*content=)["'][^"']*["']/, `$1"${desc}"`);
  html = html.replace(/(<meta[^>]*name=["']twitter:description["'][^>]*content=)["'][^"']*["']/, `$1"${desc}"`);
  html = html.replace(/(<meta[^>]*property=["']og:title["'][^>]*content=)["'][^"']*["']/, `$1"${title}"`);
  html = html.replace(/(<meta[^>]*name=["']twitter:title["'][^>]*content=)["'][^"']*["']/, `$1"${title}"`);
  html = html.replace(/(<meta[^>]*property=["']og:url["'][^>]*content=)["'][^"']*["']/, `$1"${opts.url}"`);
  html = html.replace(/(<meta[^>]*property=["']og:image["'][^>]*content=)["'][^"']*["']/, `$1"${opts.image}"`);
  html = html.replace(/(<meta[^>]*name=["']twitter:image["'][^>]*content=)["'][^"']*["']/, `$1"${opts.image}"`);
  html = setCanonical(html, opts.url);
  return html;
}

router.get("/info", async (_req: Request, res: Response) => {
  try {
    const template = await getIndexTemplate();
    const html = replaceMetaTags(template, {
      title: "정보/꿀팁 — 건설UP",
      desc: "건설 현장 일자리 초보 가이드, 안전수칙, 일당 시세 등 실용 정보를 모았습니다.",
      url: `${SITE_URL}/info`,
      image: `${SITE_URL}/og-image.png?v=2`,
    });
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", process.env.NODE_ENV === "production" ? "public, max-age=300" : "no-store");
    res.send(html);
  } catch (err) {
    logger.error({ err }, "[info-seo] 목록 렌더링 실패");
    res.status(500).send("Internal Server Error");
  }
});

router.get("/info/:slug", async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  try {
    const [template, metaList, overrides] = await Promise.all([
      getIndexTemplate(),
      getMergedInfoMeta(),
      // 관리자가 글 제목/설명을 수정했을 수 있으므로 덮어쓰기를 병합 (실패해도 원본으로 진행).
      getAllInfoOverrides().catch(() => ({}) as Record<string, { title: string; description: string }>),
    ]);
    const base = metaList.find((a) => a.slug === slug);
    const ov = overrides[slug];
    const meta = base
      ? { ...base, title: ov?.title || base.title, description: ov?.description || base.description }
      : undefined;
    const pageUrl = `${SITE_URL}/info/${encodeURIComponent(slug)}`;
    // DB 글은 업로드된 이미지, 정적 글은 slug와 동일한 파일명 규칙 (프론트 getArticleImage와 동일).
    const imageUrl = meta
      ? meta.imageUrl
        ? `${SITE_URL}${meta.imageUrl}`
        : `${SITE_URL}/images/info/${encodeURIComponent(slug)}.webp`
      : `${SITE_URL}/og-image.png?v=2`;
    let html = replaceMetaTags(template, {
      title: meta ? `${meta.title} — 건설UP` : "정보/꿀팁 — 건설UP",
      desc: meta ? meta.description : "건설 현장 일자리 실용 정보를 모았습니다.",
      url: meta ? pageUrl : `${SITE_URL}/info`,
      image: imageUrl,
    });
    if (meta) {
      // Article 구조화 데이터 + 탐색경로 — 글별 독립 검색 노출용.
      const ldTags =
        buildArticleLd({
          type: "Article",
          headline: meta.title,
          description: meta.description,
          url: pageUrl,
          image: imageUrl,
          datePublished: meta.date,
          dateModified: meta.updated,
        }) +
        buildBreadcrumbLd([
          { name: "건설UP", url: `${SITE_URL}/` },
          { name: "정보/꿀팁", url: `${SITE_URL}/info` },
          { name: meta.title, url: pageUrl },
        ]);
      html = html.replace("</head>", `${ldTags}</head>`);

      // 관리자 패널("건설 꿀팁" 코너)에서 DB로 발행한 글이면 실제 제목·본문을
      // 크롤러가 JS 실행 없이도 읽을 수 있게 <div id="root"> 폴백에 직접 넣는다.
      // (기존 19개 정적 글은 body를 여기서 파싱하지 않으므로 메타/구조화 데이터까지만 적용됨.)
      const full = await getBlogArticleFull(slug).catch(() => null);
      if (full) {
        const bodyHtml = full.body
          .map((b) => `${b.subtitle ? `<h2 style="font-size:16px;font-weight:700;color:#1e3a5f;margin:16px 0 6px">${escapeHtmlAttr(b.subtitle)}</h2>` : ""}<p style="margin:0 0 14px;color:#334155">${escapeHtmlAttr(b.text)}</p>`)
          .join("\n");
        const fallbackBody = `
    <div id="root">
      <div style="max-width:760px;margin:0 auto;padding:24px 16px;font-family:Inter,system-ui,-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#1e3a5f;line-height:1.6">
        <h1 style="font-size:22px;font-weight:700;color:#f97316;margin:0 0 8px">${escapeHtmlAttr(meta.title)}</h1>
        <p style="margin:0 0 16px;color:#64748b;font-size:14px">${escapeHtmlAttr(meta.description)}</p>
        ${bodyHtml}
        <p style="margin:0;color:#64748b;font-size:14px">
          페이지를 불러오는 중입니다… 잠시만 기다려 주세요.
          <noscript>이 사이트는 최신 브라우저(JavaScript 사용)에서 정상적으로 표시됩니다.</noscript>
        </p>
      </div>
    </div>
    <script type="module"`;
        html = html.replace(/<div id="root">[\s\S]*?<script type="module"/, fallbackBody);
      }
    }
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", process.env.NODE_ENV === "production" ? "public, max-age=300" : "no-store");
    // 존재하지 않는 글은 404로 응답 (SPA 셸은 그대로 렌더링되므로 사용자 경험 동일, 검색엔진 오염 방지).
    res.status(meta ? 200 : 404).send(html);
  } catch (err) {
    logger.error({ err, slug }, "[info-seo] 렌더링 실패");
    try {
      const template = await getIndexTemplate();
      res.set("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(template);
    } catch {
      res.status(500).send("Internal Server Error");
    }
  }
});

// ── GET /news, /news/:slug ──────────────────────────────────────────────────
// 건설업 현장 소식 공유 미리보기. 데이터 원본은 프론트 newsData.ts (info와 동일한 방식).
router.get("/news", async (_req: Request, res: Response) => {
  try {
    const template = await getIndexTemplate();
    const html = replaceMetaTags(template, {
      title: "건설업 현장 소식 — 건설UP",
      desc: "대형 현장 착공, 투자, 인력 수요 등 건설업계 소식을 현장 근로자 시각에서 정리했습니다.",
      url: `${SITE_URL}/news`,
      image: `${SITE_URL}/og-image.png?v=2`,
    });
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", process.env.NODE_ENV === "production" ? "public, max-age=300" : "no-store");
    res.send(html);
  } catch (err) {
    logger.error({ err }, "[news-seo] 목록 렌더링 실패");
    res.status(500).send("Internal Server Error");
  }
});

router.get("/news/:slug", async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  try {
    const [template, metaList] = await Promise.all([getIndexTemplate(), getMergedNewsMeta()]);
    const meta = metaList.find((a) => a.slug === slug);
    const pageUrl = `${SITE_URL}/news/${encodeURIComponent(slug)}`;
    // DB 글은 업로드된 이미지, 정적 글은 slug와 동일한 파일명 규칙(프론트 getNewsImage와 동일).
    const imageUrl = meta
      ? meta.imageUrl
        ? `${SITE_URL}${meta.imageUrl}`
        : `${SITE_URL}/images/news/${encodeURIComponent(slug)}.webp`
      : `${SITE_URL}/og-image.png?v=2`;
    let html = replaceMetaTags(template, {
      title: meta ? `${meta.title} — 건설UP` : "건설업 현장 소식 — 건설UP",
      desc: meta ? meta.description : "건설업계 소식을 현장 근로자 시각에서 정리했습니다.",
      url: meta ? pageUrl : `${SITE_URL}/news`,
      image: imageUrl,
    });
    if (meta) {
      const full = await getSiteNewsFull(slug).catch(() => null);
      // 홍보성으로 재게시된 짧은 글(예: Threads/Instagram 원문 재게시)에는 NewsArticle을
      // 잘못 적용하지 않는다 — 뉴스 보도가 아니라 일반 Article로 처리한다.
      const isPromoRepost = !!full && /threads|instagram/i.test(full.sourceLabel) && full.body.length < 400;
      const ldType = full && isPromoRepost ? "Article" : "NewsArticle";
      const ldTags =
        buildArticleLd({
          type: ldType,
          headline: meta.title,
          description: meta.description,
          url: pageUrl,
          image: imageUrl,
          datePublished: meta.date,
          dateModified: meta.updated,
        }) +
        buildBreadcrumbLd([
          { name: "건설UP", url: `${SITE_URL}/` },
          { name: "현장 소식", url: `${SITE_URL}/news` },
          { name: meta.title, url: pageUrl },
        ]);
      html = html.replace("</head>", `${ldTags}</head>`);

      // 관리자 패널("현장 소식" 코너)에서 DB로 발행한 글이면 실제 제목·본문을
      // 초기 HTML에 넣어 크롤러가 JS 실행 없이도 읽을 수 있게 한다.
      if (full) {
        const paragraphs = full.body
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p) => `<p style="margin:0 0 14px;color:#334155;white-space:pre-line">${escapeHtmlAttr(p)}</p>`)
          .join("\n");
        const fallbackBody = `
    <div id="root">
      <div style="max-width:760px;margin:0 auto;padding:24px 16px;font-family:Inter,system-ui,-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#1e3a5f;line-height:1.6">
        <h1 style="font-size:22px;font-weight:700;color:#f97316;margin:0 0 8px">${escapeHtmlAttr(meta.title)}</h1>
        ${paragraphs}
        <p style="margin:0;color:#64748b;font-size:14px">
          페이지를 불러오는 중입니다… 잠시만 기다려 주세요.
          <noscript>이 사이트는 최신 브라우저(JavaScript 사용)에서 정상적으로 표시됩니다.</noscript>
        </p>
      </div>
    </div>
    <script type="module"`;
        html = html.replace(/<div id="root">[\s\S]*?<script type="module"/, fallbackBody);
      }
    }
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", process.env.NODE_ENV === "production" ? "public, max-age=300" : "no-store");
    res.status(meta ? 200 : 404).send(html);
  } catch (err) {
    logger.error({ err, slug }, "[news-seo] 렌더링 실패");
    try {
      const template = await getIndexTemplate();
      res.set("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(template);
    } catch {
      res.status(500).send("Internal Server Error");
    }
  }
});

export default router;
