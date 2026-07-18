import { Router, type Request, type Response } from "express";
import { createHmac } from "crypto";
import { requireAdmin } from "../lib/adminStore";

const router = Router();

const CP_DOMAIN = "https://api-gateway.coupang.com";
const SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/v1/products/search";
const DEEPLINK_PATH = "/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink";

// ── HMAC (CEA) 서명 ───────────────────────────────────────────────────────────
function coupangAuth(method: string, path: string, query: string): string {
  const accessKey = process.env["COUPANG_ACCESS_KEY"] ?? "";
  const secretKey = process.env["COUPANG_SECRET_KEY"] ?? "";
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const signedDate =
    String(now.getUTCFullYear()).slice(2) +
    pad(now.getUTCMonth() + 1) +
    pad(now.getUTCDate()) +
    "T" +
    pad(now.getUTCHours()) +
    pad(now.getUTCMinutes()) +
    pad(now.getUTCSeconds()) +
    "Z";
  const message = signedDate + method + path + query;
  const signature = createHmac("sha256", secretKey).update(message).digest("hex");
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${signedDate}, signature=${signature}`;
}

async function coupangGet(path: string, query: string): Promise<unknown> {
  const url = `${CP_DOMAIN}${path}${query ? `?${query}` : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: coupangAuth("GET", path, query), "Content-Type": "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`쿠팡 API 오류 [${res.status}]: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function coupangPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${CP_DOMAIN}${path}`, {
    method: "POST",
    headers: { Authorization: coupangAuth("POST", path, ""), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`쿠팡 API 오류 [${res.status}]: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

// ── URL → productId ──────────────────────────────────────────────────────────
const ALLOWED_HOSTS = new Set(["www.coupang.com", "m.coupang.com", "link.coupang.com"]);

/** https + 쿠팡 도메인 정확 일치 검증 (아니면 null) */
function parseCoupangUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || !ALLOWED_HOSTS.has(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

/** 관리자 입력 정규화:
 *  - iframe 임베드 HTML이 붙여넣어지면 src에서 URL 추출
 *  - coupa.ng/{code} 위젯 단축링크는 link.coupang.com/a/{code}로 변환
 *    (coupa.ng 직접 접근은 404지만 link.coupang.com/a/는 같은 코드로 리다이렉트됨) */
function normalizeInput(raw: string): string {
  let s = raw.trim();
  if (s.includes("<")) {
    // HTML 임베드 코드: href/src 속성의 URL 중 쿠팡 링크(이미지 CDN 제외)를 선택
    const urls = [...s.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1] ?? "");
    const pick = urls.find((u) => /^https?:\/\/(link\.coupang\.com|coupa\.ng|www\.coupang\.com|m\.coupang\.com)\//i.test(u));
    if (pick) s = pick;
  }
  const cn = s.match(/^https?:\/\/coupa\.ng\/([A-Za-z0-9]+)/);
  if (cn?.[1]) s = `https://link.coupang.com/a/${cn[1]}`;
  return s;
}

function extractProductId(url: string): string | null {
  const m = url.match(/\/vp\/products\/(\d+)/) || url.match(/[?&]pageKey=(\d+)/);
  return m ? m[1] ?? null : null;
}

/** link.coupang.com 단축링크 → 리다이렉트 따라가 실제 상품 URL 확보.
 *  매 단계 쿠팡 도메인·https만 허용 (SSRF 방지). */
async function resolveUrl(url: string): Promise<string> {
  let current = url;
  for (let i = 0; i < 5; i++) {
    if (extractProductId(current)) return current;
    if (!parseCoupangUrl(current)) break;
    const res = await fetch(current, { method: "HEAD", redirect: "manual" });
    const loc = res.headers.get("location");
    if (!loc) break;
    const next = new URL(loc, current).toString();
    if (!parseCoupangUrl(next)) break;
    current = next;
  }
  return current;
}

// ── 쿠팡 카테고리명 → 건설UP 카테고리 매핑 ──────────────────────────────────
const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/안전화|작업화/, "안전화"],
  [/작업복|조끼|우주복|근무복/, "작업복"],
  [/장갑/, "장갑"],
  [/용접/, "용접용품"],
  [/전동|드릴|그라인더|임팩/, "전동공구"],
  [/우의|우비|레인/, "우의"],
  [/쿨|냉풍|선풍기|아이스|여름/, "여름용품"],
  [/방한|핫팩|난방|겨울|발열/, "겨울용품"],
  [/차량|자동차|카시트|블랙박스/, "차량용품"],
  [/생활|주방|욕실|세제|휴지|물티슈|식품|음료|이미용/, "생활물품"],
];

function mapCategory(nameAndCategory: string): string {
  for (const [re, cat] of CATEGORY_RULES) {
    if (re.test(nameAndCategory)) return cat;
  }
  return "기타";
}

interface SearchItem {
  productId: number;
  productName: string;
  productPrice: number;
  productImage: string;
  productUrl: string;
  categoryName?: string;
  brandName?: string;
}

// POST /api/admin/coupang/product — 쿠팡 상품 URL로 상품정보 자동 조회
router.post("/admin/coupang/product", requireAdmin, async (req: Request, res: Response) => {
  try {
    if (!process.env["COUPANG_ACCESS_KEY"] || !process.env["COUPANG_SECRET_KEY"]) {
      res.status(500).json({ ok: false, message: "쿠팡파트너스 API 키가 설정되지 않았습니다" });
      return;
    }
    const { url, keyword } = req.body as { url?: string; keyword?: string };
    const parsed = url ? parseCoupangUrl(normalizeInput(url)) : null;
    if (!parsed) {
      res.status(400).json({ ok: false, message: "쿠팡 상품 URL을 입력해주세요 (coupang.com·link.coupang.com·coupa.ng 링크 또는 파트너스 iframe HTML 가능)" });
      return;
    }

    // 입력이 이미 파트너스 단축링크(link.coupang.com/a/…, coupa.ng 변환 포함)라면
    // API 조회가 실패해도 그 링크 자체를 파트너스 링크로 쓸 수 있다.
    const inputPartnerLink =
      parsed.hostname === "link.coupang.com" && parsed.pathname.startsWith("/a/")
        ? parsed.toString()
        : "";

    const resolved = await resolveUrl(parsed.toString());
    const productId = extractProductId(resolved);
    if (!productId) {
      res.status(400).json({ ok: false, message: "URL에서 상품번호를 찾을 수 없습니다" });
      return;
    }

    // 1) 검색 API로 상품정보 조회 (productUrl은 파트너스 추적 링크로 반환됨).
    //    검색 API는 키워드와 무관한 인기상품을 섞어 돌려주므로,
    //    productId가 정확히 일치하는 결과만 사용한다 (엉뚱한 상품 자동등록 방지).
    //    상품번호 검색은 거의 못 찾으므로, 관리자가 준 상품명 키워드를 우선 사용.
    //    옵션이 붙은 상품명("우르오스 스킨워시, 500ml, 1개")은 검색이 안 되므로
    //    쉼표 앞부분 등으로 점점 줄여가며 재시도한다.
    const kwVariants: string[] = [];
    const kw0 = (keyword ?? "").trim();
    if (kw0) {
      kwVariants.push(kw0);
      const beforeComma = kw0.split(",")[0]?.trim();
      if (beforeComma && beforeComma !== kw0) kwVariants.push(beforeComma);
      // 뒤쪽 단어를 하나씩 떼며 최대 2단계 축약 (예: "A B C" → "A B")
      let words = (beforeComma || kw0).split(/\s+/);
      for (let i = 0; i < 2 && words.length > 2; i++) {
        words = words.slice(0, -1);
        kwVariants.push(words.join(" "));
      }
    }
    const keywords = [...new Set([...kwVariants, productId])];
    let item: SearchItem | undefined;
    for (const kw of keywords) {
      // 주의: limit이 10을 넘으면 쿠팡 검색 API가 조용히 빈 결과를 반환한다
      const query = `keyword=${encodeURIComponent(kw)}&limit=10`;
      const sr = (await coupangGet(SEARCH_PATH, query)) as {
        data?: { productData?: SearchItem[] };
      };
      const items = sr.data?.productData ?? [];
      item = items.find((it) => String(it.productId) === productId);
      if (item) break;
    }
    if (!item) {
      // 상품정보는 못 찾았지만 파트너스 링크는 만들어서 폼에 채워준다
      let partnerLink = "";
      try {
        const dl = (await coupangPost(DEEPLINK_PATH, { coupangUrls: [resolved] })) as {
          data?: Array<{ shortenUrl?: string; landingUrl?: string }>;
        };
        partnerLink = dl.data?.[0]?.shortenUrl || dl.data?.[0]?.landingUrl || "";
      } catch (e) {
        req.log.warn({ err: e }, "coupang deeplink failed (no search match)");
      }
      if (!partnerLink) partnerLink = inputPartnerLink;
      res.status(404).json({
        ok: false,
        message: partnerLink
          ? "상품 정보를 자동으로 가져오지 못했습니다. 파트너스 링크만 채워두었으니 상품명·가격·이미지를 직접 입력해주세요."
          : "쿠팡 API에서 상품 정보를 찾지 못했습니다. 상품명·가격을 직접 입력해주세요.",
        partnerLink,
      });
      return;
    }

    // 2) 파트너스 수익 링크 확보 — 검색 API의 productUrl(추적 링크) 우선,
    //    없으면 딥링크 API 시도. 둘 다 실패하면 일반 링크로 폴백하지 않고 중단
    //    (일반 링크로 등록되면 수수료가 발생하지 않으므로).
    let partnerLink = item.productUrl || "";
    if (!partnerLink) {
      try {
        const dl = (await coupangPost(DEEPLINK_PATH, { coupangUrls: [resolved] })) as {
          data?: Array<{ shortenUrl?: string; landingUrl?: string }>;
        };
        partnerLink = dl.data?.[0]?.shortenUrl || dl.data?.[0]?.landingUrl || "";
      } catch (e) {
        req.log.warn({ err: e }, "coupang deeplink failed");
      }
    }
    if (!partnerLink) partnerLink = inputPartnerLink;
    if (!partnerLink) {
      res.status(502).json({
        ok: false,
        message: "파트너스 링크 생성에 실패했습니다. 잠시 후 다시 시도하거나 직접 입력해주세요.",
      });
      return;
    }

    res.json({
      ok: true,
      product: {
        productId,
        name: item.productName,
        price: item.productPrice,
        image: item.productImage,
        brand: item.brandName || "",
        categoryName: item.categoryName || "",
        category: mapCategory(`${item.categoryName || ""} ${item.productName}`),
        link: partnerLink,
      },
    });
  } catch (e) {
    req.log.error({ err: e }, "coupang product lookup failed");
    res.status(502).json({ ok: false, message: e instanceof Error ? e.message : "쿠팡 API 호출에 실패했습니다" });
  }
});

export default router;
