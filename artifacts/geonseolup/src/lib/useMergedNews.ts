import { useEffect, useState } from 'react';
import { NEWS_NEWEST_FIRST, getNewsImage, type NewsArticle } from './newsData';

export interface DisplayNewsArticle extends NewsArticle {
  imageSrc: string;
  sourceUrl?: string;
  sourceLabel?: string;
  /**
   * DB(site_news)에서 온 글이면 true. 이 경우 description은 body 맨 앞부분을 그대로
   * 잘라 만든 것이라(별도 요약 필드가 없음) 상세 페이지에서 본문 첫 문단과 그대로
   * 겹쳐 보이고, 120자 경계에서 단어 중간이 잘리는 문제가 있었다(2026-08-09 발견).
   * 상세 페이지(NewsDetail.tsx)는 이 값이 true면 미리보기 문단을 생략한다.
   */
  isDbArticle?: boolean;
}

interface SiteNewsApiRow {
  id: number;
  slug: string | null;
  title: string;
  body: string;
  imageUrl: string | null;
  sourceLabel: string;
  sourceUrl: string;
  publishedAt: string;
}

let cache: DisplayNewsArticle[] | null = null;

function staticOnly(): DisplayNewsArticle[] {
  return NEWS_NEWEST_FIRST.map((a) => ({ ...a, imageSrc: getNewsImage(a.slug) }));
}

/**
 * 관리자 API로 등록되는 site_news.body는 "## 소제목" 마크다운 스타일 문자열로 저장된다
 * (business1-threads.txt 4번 참고). 예전엔 이걸 파싱 없이 통째로 한 덩어리 텍스트로만
 * 넘겨서, 실제 화면엔 "## 배경" 글자가 h2 태그가 아니라 그냥 본문 텍스트로 그대로
 * 보이는 문제가 있었음(2026-08-09 발견) — "##"를 문단 구분자로 잘라 NewsDetail.tsx가
 * 이미 지원하는 {subtitle, text} 블록 배열로 변환해 진짜 <h2>로 렌더링되게 한다.
 */
/**
 * 문단 텍스트 안에 마크다운 이미지 문법 `![](URL 또는 data:...)`이 있으면 뽑아내서
 * NewsDetail.tsx가 이미 지원하는 block.image로 분리한다(2026-08-12 추가 — 통계 등
 * 수치가 많은 문단을 이미지(차트)로 보여줄 수 있게 하기 위함, body_articles의
 * image?: string 블록 필드와 동일한 개념). 문단 어디에 있든 첫 번째 이미지 문법만
 * 뽑고, 나머지 텍스트에서는 그 구문을 제거한다.
 */
function extractImage(text: string): { image?: string; text: string } {
  const m = text.match(/!\[[^\]]*\]\(([^)]+)\)/);
  if (!m || m.index === undefined) return { text };
  const image = m[1];
  const rest = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim();
  return { image, text: rest };
}

function parseMarkdownBody(raw: string): { subtitle?: string; image?: string; text: string }[] {
  const parts = raw.split(/\n(?=## )/g).map((s) => s.trim()).filter(Boolean);
  const blocks = parts.map((part) => {
    const m = part.match(/^##\s+(.+?)\n+([\s\S]*)$/);
    if (m) {
      const { image, text } = extractImage(m[2].trim());
      return { subtitle: m[1].trim(), image, text };
    }
    const { image, text } = extractImage(part);
    return { image, text };
  });
  return blocks.length > 0 ? blocks : [{ text: raw }];
}

function toDisplay(r: SiteNewsApiRow): DisplayNewsArticle {
  return {
    slug: r.slug || String(r.id),
    title: r.title,
    description: r.body.replace(/^##\s+.+$/m, '').replace(/\s+/g, ' ').trim().slice(0, 120),
    // UTC로 저장된 publishedAt을 그냥 slice하면 한국시간 기준 날짜와 하루 어긋날 수 있다
    // (예: 8/11 05:30 KST 발행 글이 UTC로는 8/10 20:30이라 "8/10"으로 잘못 표시됨,
    // 2026-08-11 발견). sv-SE 로케일은 YYYY-MM-DD 형식을 그대로 주면서 타임존 변환도
    // 정확히 해줘서, AdminSiteNews.tsx가 쓰는 'Asia/Seoul' 변환과 결과가 일치한다.
    date: new Date(r.publishedAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }),
    body: parseMarkdownBody(r.body),
    imageSrc: r.imageUrl || getNewsImage(r.slug || String(r.id)),
    sourceUrl: r.sourceUrl || undefined,
    sourceLabel: r.sourceLabel || undefined,
    isDbArticle: true,
  };
}

/**
 * 관리자 패널("현장 소식" 코너)에서 DB로 직접 발행한 글 + 기존 코드에 하드코딩된
 * NEWS_NEWEST_FIRST(newsData.ts)를 합쳐서 보여준다. slug가 겹치면 DB 쪽을 우선하고,
 * 최종 목록은 (정적/DB 구분과 무관하게) date 내림차순으로 실제 정렬한다.
 */
export function useMergedNews() {
  const [articles, setArticles] = useState<DisplayNewsArticle[]>(() => cache ?? staticOnly());
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) {
      setArticles(cache);
      setLoading(false);
      return;
    }
    fetch('/api/site-news')
      .then((res) => res.json())
      .then((data: { rows: SiteNewsApiRow[] }) => {
        const dynamic = (data.rows ?? []).filter((r) => r.slug).map(toDisplay);
        const staticArticles = staticOnly().filter(
          (s) => !dynamic.some((d) => d.slug === s.slug)
        );
        const merged = [...dynamic, ...staticArticles].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        cache = merged;
        setArticles(merged);
        setLoading(false);
      })
      .catch(() => {
        setArticles(staticOnly());
        setLoading(false);
      });
  }, []);

  return { articles, loading };
}
