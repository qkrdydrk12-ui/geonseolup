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
  [/안전모|헬멧/, "안전모"],
  [/작업복|조끼|우주복|근무복/, "작업복"],
  [/장갑/, "장갑"],
  [/용접/, "용접용품"],
  [/전동|드릴|그라인더|임팩/, "전동공구"],
  [/측정|레벨기|수평|줄자|레이저/, "측정기"],
  [/공구/, "공구"],
  [/우의|우비|레인/, "우의"],
  [/쿨|냉풍|선풍기|아이스|여름/, "여름용품"],
  [/방한|핫팩|난방|겨울|발열/, "겨울용품"],
  [/차량|자동차|카시트|블랙박스/, "차량용품"],
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
    const parsed = url ? parseCoupangUrl(url.trim()) : null;
    if (!parsed) {
      res.status(400).json({ ok: false, message: "쿠팡 상품 URL을 입력해주세요 (https://www.coupang.com 또는 link.coupang.com 링크만 가능)" });
      return;
    }

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
    const keywords = [
      ...(keyword && keyword.trim() ? [keyword.trim()] : []),
      productId,
    ];
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
