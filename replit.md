# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## 건설UP App

Korean construction job listing website at `artifacts/geonseolup/`.

### Architecture
- **Frontend**: React + Vite + Tailwind CSS + Wouter router
- **Database**: Firebase Firestore (direct from frontend, no backend)
- **Firebase project**: geonseolup (hardcoded config)
- **Preview path**: `/` (port 19759)

### Features
- Real-time job listings via Firebase Firestore (with localStorage fallback)
- 15 sample jobs for fallback when Firebase is empty/unavailable
- Filters: region (17 regions), job type (14 types), welding subtype (TIG/아크/CO2/PVC)
- Keyword search, sort (newest/salary high/salary low)
- Preset presets: salary top, meal+lodging, new today, welding, fire guard
- Job detail page with phone/SMS CTA
- Job posting form (pending approval flow)
- Admin panel with password auth (default: 1234), job management, pending approval, settings
- 건설 추천템 shop (`/shop`): Coupang Partners product recommendations from Firestore `products` collection (13 categories, search, responsive card grid); admin CRUD tab (🛒 추천템) with image upload (client-resized ≤600px JPEG base64), order reorder via batch write. NOTE: requires Firestore rules to allow `products` collection. Header menu 정보/꿀팁 replaced by 건설 추천템 (/info routes still alive).
- Coupang Open API auto-registration: admin pastes Coupang product URL → POST `/api/admin/coupang/product` (api-server, requireAdmin) resolves short links (host-allowlisted redirects, https-only), extracts productId, fetches name/image/price/category via search API (CEA HMAC signing with COUPANG_ACCESS_KEY/SECRET_KEY secrets), maps to shop category, returns partner tracking link (search API `productUrl` preferred; deeplink API fallback; never falls back to a non-partner link). Route: `artifacts/api-server/src/routes/coupang.ts`.

### Key Files
- `src/App.tsx` — Router with pages
- `src/lib/firebase.ts` — Firestore CRUD wrapper with fallback
- `src/lib/utils.ts` — Utilities (formatDate, job icons, badge colors, viewed tracking)
- `src/data/sampleJobs.ts` — 15 sample jobs for offline/fallback
- `src/components/Header.tsx` — Top nav with contact modal and kakao share
- `src/components/JobCard.tsx` — Job card with call/SMS/detail buttons
- `src/pages/Home.tsx` — Main job listing with filters
- `src/pages/Detail.tsx` — Job detail page
- `src/pages/Post.tsx` — Job posting form
- `src/pages/Admin.tsx` — Admin panel

### Brand Colors
- Primary: `#f97316` (orange)
- Secondary: `#1e3a5f` (navy)

### localStorage Keys
- `cj_admin_auth` — admin auth token
- `cj_admin_pw` — admin password (default: 1234)
- `cj_viewed_jobs` — viewed job IDs (max 500)
- `cj_contact_email` / `cj_contact_kakao` / `cj_contact_label` — contact info
- `cj_share_url` — custom share URL
- `cj_dup_settings` — { autoHideHours } (0=disabled)
