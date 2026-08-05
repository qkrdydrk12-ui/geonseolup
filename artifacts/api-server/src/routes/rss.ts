import { Router, type Request, type Response } from "express";

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

// GET /rss
router.get("/rss", async (_req: Request, res: Response) => {
  try {
    const docs = await fetchJobs();
    const siteUrl = "https://geonseolup.com";
    const now = new Date().toUTCString();

    const activeDocs = docs.filter(
      (doc) => !bool(doc, "hidden") && !bool(doc, "_deleted")
    );

    const DUMMY_ITEM = `    <item>
      <title>건설UP - 건설 현장 일자리 정보</title>
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
        const detail = str(doc, "detail");
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

    const itemsXml = items.length > 0 ? items : DUMMY_ITEM;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>건설UP - 건설 현장 일자리 정보</title>
    <link>${siteUrl}</link>
    <description>전국 건설 현장 일자리 정보를 실시간으로 제공합니다. 조공·배관·용접·화기감시자 등 다양한 직종의 구인 공고를 확인하세요.</description>
    <language>ko</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${siteUrl}/rss" rel="self" type="application/rss+xml"/>
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
});

export default router;
