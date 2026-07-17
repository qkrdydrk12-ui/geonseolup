---
name: Coupang Partners Open API quirks
description: Non-obvious behaviors of Coupang Partners deeplink/search APIs
---
- Deeplink API often returns HTTP 200 with body `{"rCode":"400","rMessage":"url convert failed"}` for plain `www.coupang.com/vp/products/<id>` URLs — check rCode, not just HTTP status.
- The product search API's `productUrl` is ALREADY a partner tracking link (link.coupang.com/re/AFFSDP with lptag). Prefer it over the deeplink API; never fall back to raw product URLs (no commission).
- Search by `keyword=<productId>` works to look up a specific product; match `productId` in results.
- CEA HMAC signing: signed-date format `yyMMdd'T'HHmmss'Z'` UTC; message = date+method+path+query.
- `brandName` in search results is usually empty.

**Why:** deeplink failures were silent early on because the old code fell back to search productUrl, masking that deeplink never worked.
**How to apply:** any change to the Coupang route should keep the "partner-link-or-fail" guarantee and treat rCode inside 200 responses as errors.
