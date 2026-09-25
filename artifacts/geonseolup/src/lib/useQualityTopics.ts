import { useEffect, useState } from 'react';

export interface QualityTopicListItem {
  id: number;
  code: string;
  category: string;
  title: string;
  slug: string;
  summary: string;
  keywords: string[];
  thumbnail: string | null;
  sourcePage: number | null;
}

let cache: QualityTopicListItem[] | null = null;

// 목록 전체(가벼운 버전, body 없음)를 한 번만 받아서 캐시한다 — 검색/카테고리 필터,
// 책 모드(이전/다음 넘기기) 순서 계산, "자주 찾는 항목" 추천에 전부 재사용.
export function useQualityTopics() {
  const [topics, setTopics] = useState<QualityTopicListItem[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) {
      setTopics(cache);
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch('/api/quality-topics')
      .then((res) => res.json())
      .then((data: { rows?: QualityTopicListItem[] }) => {
        if (cancelled) return;
        cache = data.rows ?? [];
        setTopics(cache);
      })
      .catch(() => {
        if (!cancelled) setTopics([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { topics, loading };
}
