---
name: Firestore security rules gate new collections
description: geonseolup Firebase project rules whitelist collections; new collections are denied for everyone until user updates rules in Firebase console
---
The geonseolup Firebase project's Firestore security rules allow access per collection (jobs/pending/settings/reports/reservationLogs work unauthenticated). Any NEW collection (e.g. `products`) returns PERMISSION_DENIED for both client SDK and REST, and Anonymous Auth is disabled, so there is no workaround from code.

**Why:** Confirmed 2026-07-17 while adding the 건설 추천템 products collection — read and write both 403 via REST and SDK.

**How to apply:** When adding a new Firestore collection, tell the user to add a matching `match /<collection>/{id} { allow read, write: if true; }` block in Firebase console → Firestore → 규칙, then republish. Test with a REST runQuery curl before assuming the feature works.
