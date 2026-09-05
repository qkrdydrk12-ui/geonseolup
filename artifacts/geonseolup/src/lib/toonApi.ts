import { useEffect, useState } from 'react';

// 노가다툰: 건설꿀팁/현장소식과 달리 정적 시드 데이터가 없다 — 처음부터 DB(toon_episodes/toon_panels)
// 하나로만 운영한다(관리자 패널에서 새 화를 등록하면 배포 없이 바로 반영).

export interface ToonEpisodeSummary {
  id: number;
  slug: string;
  title: string;
  description: string;
  disclaimer: string;
  episodeNumber: number;
  panelCount: number;
  coverImageUrl: string;
  published: boolean;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ToonPanel {
  index: number;
  caption: string | null;
  imageUrl: string;
}

export interface ToonEpisodeDetail extends ToonEpisodeSummary {
  panels: ToonPanel[];
}

let listCache: ToonEpisodeSummary[] | null = null;

export function useToonEpisodes() {
  const [episodes, setEpisodes] = useState<ToonEpisodeSummary[]>(() => listCache ?? []);
  const [loading, setLoading] = useState(!listCache);

  useEffect(() => {
    if (listCache) {
      setEpisodes(listCache);
      setLoading(false);
      return;
    }
    fetch('/api/toon')
      .then((res) => res.json())
      .then((data: { rows: ToonEpisodeSummary[] }) => {
        const rows = data.rows ?? [];
        listCache = rows;
        setEpisodes(rows);
        setLoading(false);
      })
      .catch(() => {
        setEpisodes([]);
        setLoading(false);
      });
  }, []);

  return { episodes, loading };
}

export function useToonEpisode(slug: string | undefined) {
  const [episode, setEpisode] = useState<ToonEpisodeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setNotFound(false);
    fetch(`/api/toon/${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (!res.ok) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const data = (await res.json()) as { row: ToonEpisodeDetail };
        setEpisode(data.row);
        setLoading(false);
      })
      .catch(() => {
        setNotFound(true);
        setLoading(false);
      });
  }, [slug]);

  return { episode, loading, notFound };
}
