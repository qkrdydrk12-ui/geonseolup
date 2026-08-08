import { Router, type Request, type Response } from "express";
import { maskPhonesInText } from "../lib/contactMask.js";
import { getMergedInfoMeta, getNewsMeta } from "../lib/articleMeta";

const router = Router();

const PROJECT_ID = "geonseolup";
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRfc822(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return new Date().toUTCString();
    return d.toUTCString();
  } catch {
    return new Date().toUTCString();
  }
}

interface FieldValue {
  stringValue?: string;
  booleanValue?: boolean;
  integerValue?: string;
  timestampValue?: string;
  nullValue?: null;
}

interface FirestoreDoc {
  name: string;
  fields?: Record<string, FieldValue>;
}

function str(doc: FirestoreDoc, key: string): string {
  const f = doc.fields?.[key];
  return f?.stringValue ?? "";
}

function bool(doc: FirestoreDoc, key: string): boolean {
  const f = doc.fields?.[key];
  return f?.booleanValue === true;
}

async function fetchJobs(): Promise<FirestoreDoc[]> {
  // Use orderBy with a single field (no composite index needed)
  const url = `${FIRESTORE_BASE}:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: "jobs" }],
      orderBy: [{ field: { fieldPath: "date" }, direction: "DESCENDING" }],
      limit: 100,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // Fallback: simple page read
    const fallback = await fetch(`${FIRESTORE_BASE}/jobs?pageSize=100`);
    if (!fallback.ok) {
      throw new Error(`Firestore error: ${fallback.status}`);
    }
    const data = (await fallback.json()) as { documents?: FirestoreDoc[] };
    return data.documents ?? [];
  }

  const results = (await res.json()) as Array<{ document?: FirestoreDoc }>;
  return results.filter((r) => r.document).map((r) => r.document!);
}

// 공통 RSS 생성 로직 — 전체 피드와 지역/직종 필터 피드가 함께 쓴다.
async function buildFeed(
  res: Response,
  opts: { region?: string; job?: string; feedPath: string; feedTitleSuffix?: string }
): Promise<void> {
  try {
    const docs = await fetchJobs();
    const siteUrl = "https://geonseolup.com";
    const now = new Date().toUTCString();

    let activeDocs = docs.filter(
      (doc) => !bool(doc, "hidden") && !bool(doc, "_deleted")
    );
    if (opts.region) {
      activeDocs = activeDocs.filter((doc) => str(doc, "region") === opts.region);
    }
    if (opts.job) {
      activeDocs = activeDocs.filter((doc) => str(doc, "job") === opts.job);
    }

    const feedTitle = `건설UP${opts.feedTitleSuffix ? ` - ${opts.feedTitleSuffix}` : " - 건설 현장 일자리 정보"}`;

    const DUMMY_ITEM = `    <item>
      <title>${escapeXml(feedTitle)}</title>
      <link>https://geonseolup.com</link>
      <description>전국 건설 현장 일자리 정보를 실시간으로 제공합니다. 조공·배관·용접·화기감시자 등 다양한 직종의 구인 공고를 확인하세요.</description>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <guid isPermaLink="true">https://geonseolup.com</guid>
    </item>`;

    const items = (activeDocs.length === 0 ? [] : activeDocs)
      .slice(0, 50)
      .map((doc) => {
        const id = doc.name.split("/").pop() ?? "";
        const region = str(doc, "region");
        const job = str(doc, "job");
        const salary = str(doc, "salary");
        const meal = str(doc, "meal");
        const lodging = str(doc, "lodging");
        // 비고에는 전화번호가 섞일 수 있어 반드시 마스킹 (RSS는 공개 크롤링 대상)
        const detail = maskPhonesInText(str(doc, "detail"));
        const date = str(doc, "date");

        const titleParts = [region, job, salary].filter(Boolean);
        const title = escapeXml(titleParts.length ? titleParts.join(" · ") : "건설 구인 공고");

        const descParts = [
          region && `지역: ${region}`,
          job && `직종: ${job}`,
          salary && `급여: ${salary}`,
          meal && meal !== "식사없음" && `식사: ${meal}`,
          lodging && lodging !== "숙박없음" && `숙박: ${lodging}`,
          detail,
        ].filter(Boolean);
        const desc = escapeXml(descParts.join(" | "));

        // 2026-08-05: 예전엔 #job-id 해시 프래그먼트를 썼는데, 이건 실제 문서가 아니라
        // 검색엔진이 전부 홈페이지로만 인식해서 개별 공고가 색인되지 않았다.
        // /detail/:id는 api-server의 seo.ts가 공고별 title/description/OG/JobPosting
        // 구조화 데이터를 서버에서 채워주는 진짜 개별 URL이므로 이걸 링크해야 한다.
        const link = `${siteUrl}/detail/${id}`;
        const pubDate = toRfc822(date || new Date().toISOString());

        return `    <item>
      <title>${title}</title>
      <link>${link}</link>
      <description>${desc}</description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">${id}</guid>
    </item>`;
      })
      .join("\n");

    // 전체 피드(/rss)에는 건설꿀팁·현장 소식 글도 자동 포함한다.
    // (프론트 데이터 파일 + DB 블로그 글에서 자동 수집 — 새 글 등록·수정 시 자동 반영)
    let articleItems = "";
    if (!opts.region && !opts.job) {
      try {
        const [infoArticles, newsArticles] = await Promise.all([
          getMergedInfoMeta().catch(() => []),
          getNewsMeta().catch(() => []),
        ]);
        const toItem = (base: "info" | "news") => (a: { slug: string; title: string; description: string; date?: string; updated?: string }) => {
          const link = `${siteUrl}/${base}/${encodeURIComponent(a.slug)}`;
          const dateVal = a.updated || a.date;
          const pubDate = dateVal && !isNaN(new Date(dateVal).getTime())
            ? `\n      <pubDate>${new Date(dateVal).toUTCString()}</pubDate>` : "";
          return `    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${link}</link>
      <description>${escapeXml(a.description)}</description>${pubDate}
      <guid isPermaLink="true">${link}</guid>
    </item>`;
        };
        articleItems = [
          ...newsArticles.map(toItem("news")),
          ...infoArticles.map(toItem("info")),
        ].join("\n");
      } catch (e) {
        console.error("[RSS] 아티클 항목 생성 실패:", e);
      }
    }

    const jobItemsXml = items.length > 0 ? items : DUMMY_ITEM;
    const itemsXml = articleItems ? `${jobItemsXml}\n${articleItems}` : jobItemsXml;
    const feedDesc = opts.region || opts.job
      ? `${[opts.region, opts.job].filter(Boolean).join(" ")} 건설 현장 구인 공고를 실시간으로 제공합니다.`
      : "전국 건설 현장 일자리 정보를 실시간으로 제공합니다. 조공·배관·용접·화기감시자 등 다양한 직종의 구인 공고를 확인하세요.";

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(feedTitle)}</title>
    <link>${siteUrl}</link>
    <description>${escapeXml(feedDesc)}</description>
    <language>ko</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${siteUrl}${opts.feedPath}" rel="self" type="application/rss+xml"/>
    <image>
      <url>${siteUrl}/og-image.png</url>
      <title>건설UP</title>
      <link>${siteUrl}</link>
    </image>
${itemsXml}
  </channel>
</rss>`;

    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(xml);
  } catch (err) {
    console.error("[RSS] Error generating feed:", err);
    const fallbackXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>건설UP - 건설 현장 일자리 정보</title>
    <link>https://geonseolup.com</link>
    <description>전국 건설 현장 일자리 정보를 실시간으로 제공합니다.</description>
    <language>ko</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="https://geonseolup.com/rss" rel="self" type="application/rss+xml"/>
  </channel>
</rss>`;
    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    res.status(200).send(fallbackXml);
  }
}

// GET /rss — 전체 공고 피드
router.get("/rss", async (_req: Request, res: Response) => {
  await buildFeed(res, { feedPath: "/rss" });
});

// GET /rss/:region/:job — 지역×직종 필터 피드 (롱테일 구독/신디케이션용).
// "전체"는 필터 없음으로 취급한다 (예: /rss/전체/조공 → 조공 전체 지역).
router.get("/rss/:region/:job", async (req: Request, res: Response) => {
  const region = decodeURIComponent(String(req.params.region));
  const job = decodeURIComponent(String(req.params.job));
  const opts = {
    region: region && region !== "전체" ? region : undefined,
    job: job && job !== "전체" ? job : undefined,
    feedPath: `/rss/${encodeURIComponent(region)}/${encodeURIComponent(job)}`,
    feedTitleSuffix: [region !== "전체" ? region : "", job !== "전체" ? job : "", "구인 공고"]
      .filter(Boolean)
      .join(" "),
  };
  await buildFeed(res, opts);
});

export default router;
