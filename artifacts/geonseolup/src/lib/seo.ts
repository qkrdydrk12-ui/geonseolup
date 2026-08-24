import { useEffect } from 'react';

const SITE_URL = 'https://geonseolup.com';

export interface PageMeta {
  title: string;
  description: string;
  path: string;
  image?: string;
  robots?: 'index,follow' | 'noindex,follow' | 'noindex,nofollow';
  type?: 'website' | 'article';
  enabled?: boolean;
}

function absoluteUrl(path: string): string {
  const base = new URL(import.meta.env.BASE_URL || '/', SITE_URL);
  return new URL(path.replace(/^\//, ''), base).toString();
}

function setMeta(selector: string, attrs: Record<string, string>, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    Object.entries(attrs).forEach(([key, value]) => element!.setAttribute(key, value));
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

export function applyPageMeta({
  title,
  description,
  path,
  image = '/og-image.png?v=2',
  robots = 'index,follow',
  type = 'website',
}: PageMeta) {
  const canonicalUrl = absoluteUrl(path);
  const imageUrl = image.startsWith('http') ? image : absoluteUrl(image);

  document.title = title;
  setMeta('meta[name="description"]', { name: 'description' }, description);
  setMeta('meta[name="robots"]', { name: 'robots' }, robots);
  setMeta('meta[property="og:title"]', { property: 'og:title' }, title);
  setMeta('meta[property="og:description"]', { property: 'og:description' }, description);
  setMeta('meta[property="og:url"]', { property: 'og:url' }, canonicalUrl);
  setMeta('meta[property="og:image"]', { property: 'og:image' }, imageUrl);
  setMeta('meta[property="og:type"]', { property: 'og:type' }, type);
  setMeta('meta[name="twitter:card"]', { name: 'twitter:card' }, 'summary_large_image');
  setMeta('meta[name="twitter:title"]', { name: 'twitter:title' }, title);
  setMeta('meta[name="twitter:description"]', { name: 'twitter:description' }, description);
  setMeta('meta[name="twitter:image"]', { name: 'twitter:image' }, imageUrl);

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = canonicalUrl;
}

export function usePageMeta(meta: PageMeta) {
  useEffect(() => {
    if (meta.enabled === false) return;
    applyPageMeta(meta);
  }, [
    meta.title,
    meta.description,
    meta.path,
    meta.image,
    meta.robots,
    meta.type,
    meta.enabled,
  ]);
}