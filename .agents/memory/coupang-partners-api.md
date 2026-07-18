---
name: Coupang Partners Open API quirks
description: Non-obvious behaviors of Coupang Partners deeplink/search APIs
---
- Deeplink API often returns HTTP 200 with body `{"rCode":"400","rMessage":"url convert failed"}` for plain `www.coupang.com/vp/products/<id>` URLs — check rCode, not just HTTP status.
- The product search API's `productUrl` is ALREADY a partner tracking link (link.coupang.com/re/AFFSDP with lptag). Prefer it over the deeplink API; never fall back to raw product URLs (no commission).
- Search by `keyword=<productId>` does NOT reliably find that product — it returns unrelated popular items. Only use results whose `productId` matches exactly; NEVER fall back to items[0] (caused wrong-product auto-registration).
- Deeplink API converts full product URLs WITH `itemId` query param fine; plain `/vp/products/<id>` URLs fail with rCode 400. Keep query params when resolving short links.
- CEA HMAC signing: signed-date format `yyMMdd'T'HHmmss'Z'` UTC; message = date+method+path+query.
- `brandName` in search results is usually empty.
- Search API `limit` > 10 silently returns EMPTY productData (rCode 0, no error). Always use limit<=10.
- Partners widget iframe embeds use `coupa.ng/{code}` — fetching coupa.ng directly returns 404, but `link.coupang.com/a/{code}` with the same code 302-redirects to the real product URL. The coupa.ng link itself IS the user's partner link, so it's a safe partnerLink fallback when search+deeplink fail.
- Deeplink API fails ("url convert failed") for some specific products regardless of URL format (with/without itemId) — not convertible via API at all.
- Search fails on full product titles with options ("우르오스 스킨워시, 500ml, 1개") — retry with progressively shortened keywords (strip after comma, drop trailing words).
- Search API only covers a curated ad feed — many live products (e.g. niche safety shoes) never appear for any keyword. Best flow: search with admin-provided product-name keyword, match productId exactly; if absent, return deeplink-only partial so admin fills details manually.

**Why:** deeplink failures were silent early on because the old code fell back to search productUrl, masking that deeplink never worked.
**How to apply:** any change to the Coupang route should keep the "partner-link-or-fail" guarantee and treat rCode inside 200 responses as errors.
