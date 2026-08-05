import { Router, type Request, type Response } from "express";
import { getPublicJobs, getPublicJobById } from "../lib/jobsCache.js";
import { logger } from "../lib/logger.js";

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
  const res = await fetch(`${SITE_URL}/index.html`);
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
  // 공고는 등록 2일 후 자동 삭제되므로 유효기간도 그에 맞춘다.
  const validThrough = new Date(posted.getTime() + 2 * 24 * 60 * 60 * 1000);

  const descriptionParts = [
    `[${region}] ${jobType} 모집`,
    salary && `일당 ${salary}`,
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

// ── GET /sitemap.xml ─────────────────────────────────────────────────────────
// 정적 sitemap.xml(홈 + /post 2개)을 대체. 공개된 모든 공고 상세페이지를 포함한다.
router.get("/sitemap.xml", async (_req: Request, res: Response) => {
  try {
    const { jobs } = await getPublicJobs();

    const staticUrls = [
      { loc: "/", changefreq: "daily", priority: "1.0" },
      { loc: "/post", changefreq: "monthly", priority: "0.7" },
      { loc: "/shop", changefreq: "weekly", priority: "0.5" },
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

    const allUrls = [...staticUrls, ...jobUrls];

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
  const { id } = req.params;
  try {
    const [template, job] = await Promise.all([
      getIndexTemplate(),
      getPublicJobById(id),
    ]);

    if (!job) {
      // 공고는 등록 2일 후 자동 삭제된다. 존재하지 않는 공고 ID는
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
        <h1 style="font-size:20px;font-weight:700;color:#f97316;margin:40px 0 8px">이 공고는 마감되었거나 만료되었어요</h1>
        <p style="margin:0 0 20px;color:#334155">등록된 공고는 2일 뒤 자동으로 내려갑니다. 지금 올라와 있는 다른 공고를 확인해보세요.</p>
        <p><a href="/" style="color:#f97316;font-weight:700;text-decoration:underline">건설UP 홈에서 다른 공고 보기 →</a></p>
      </div>
    </div>
    <script type="module"`
        );
      res.set("Content-Type", "text/html; charset=utf-8");
      res.status(410).send(expiredHtml);
      return;
    }

    const region = typeof job.region === "string" ? job.region : "";
    const jobType = typeof job.job === "string" ? job.job : "";
    const salary = typeof job.salary === "string" ? job.salary : "";
    const detail = typeof job.detail === "string" ? job.detail : "";
    const rawTitle = typeof job.title === "string" ? job.title : "";

    const titleParts = [region, jobType, salary].filter(Boolean);
    const pageTitle = escapeHtmlAttr(
      `${rawTitle || titleParts.join(" · ") || "건설 구인 공고"} - 건설UP`
    );

    const descParts = [region && `지역: ${region}`, jobType && `직종: ${jobType}`, salary && `급여: ${salary}`, detail]
      .filter(Boolean);
    const pageDesc = escapeHtmlAttr(
      (descParts.join(" | ") || "전국 건설 현장 실시간 구인구직 정보").slice(0, 160)
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

    // JobPosting 구조화 데이터 삽입 (Google 채용정보 검색 노출 자격 부여)
    const jobPostingLd = buildJobPostingLd(job, id);
    html = html.replace("</head>", `  ${jobPostingLd}\n  </head>`);

    // <div id="root"> 안의 정적 폴백 본문(크롤러/JS 미실행 환경용)을
    // 이 공고 전용 내용으로 교체 — React가 mount되면 어차피 덮어써지므로
    // 실제 사용자 경험에는 영향이 없다.
    const meal = typeof job.meal === "string" ? job.meal : "";
    const lodging = typeof job.lodging === "string" ? job.lodging : "";
    const fallbackBody = `
    <div id="root">
      <div style="max-width:760px;margin:0 auto;padding:24px 16px;font-family:Inter,system-ui,-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#1e3a5f;line-height:1.6">
        <h1 style="font-size:22px;font-weight:700;color:#f97316;margin:0 0 8px">${escapeHtmlAttr(rawTitle || titleParts.join(" · ") || "건설 구인 공고")}</h1>
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

export default router;
