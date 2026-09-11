import type { Job } from './firebase';

const ACTIVE_HOURS = 48;
const RETENTION_DAYS_AFTER_CLOSE = 90;
const HOUR_MS = 60 * 60 * 1000;

export type AdminJobState =
  | 'visible'
  | 'autoHidden'
  | 'manualHidden'
  | 'closed'
  | 'expired'
  | 'reserved'
  | 'failed'
  | 'deleted';

export interface AdminJobStats {
  total: number;
  visible: number;
  autoHidden: number;
  manualHidden: number;
  closed: number;
  expired: number;
  reserved: number;
  failed: number;
  deleted: number;
  similarPairs: number;
}

function postedAtMs(date: string | undefined): number | null {
  if (!date) return null;
  const timestamp = new Date(date).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

/**
 * 관리자 화면 전용 상태 분류다. 한 공고는 정확히 하나의 상태에만 속한다.
 * 공개 화면의 필터나 Firestore 데이터는 변경하지 않는다.
 */
export function classifyAdminJob(
  job: Pick<Job, 'date' | 'hidden' | '_deleted' | 'status'>,
  autoHideHours: number,
  now: number = Date.now(),
): AdminJobState {
  if (job._deleted === true) return 'deleted';
  if (job.status === 'reserved') return 'reserved';
  if (job.status === 'failed') return 'failed';
  if (job.hidden === true) return 'manualHidden';

  const postedAt = postedAtMs(job.date);
  if (postedAt === null) return 'visible';

  const ageMs = now - postedAt;
  const closesAt = postedAt + ACTIVE_HOURS * HOUR_MS;
  const expiresAt = closesAt + RETENTION_DAYS_AFTER_CLOSE * 24 * HOUR_MS;

  if (now >= expiresAt) return 'expired';
  if (autoHideHours > 0 && ageMs >= autoHideHours * HOUR_MS) return 'autoHidden';
  if (now >= closesAt) return 'closed';
  return 'visible';
}

export function getAdminJobStats(
  jobs: readonly Job[],
  autoHideHours: number,
  now: number = Date.now(),
): AdminJobStats {
  const stats: AdminJobStats = {
    total: jobs.length,
    visible: 0,
    autoHidden: 0,
    manualHidden: 0,
    closed: 0,
    expired: 0,
    reserved: 0,
    failed: 0,
    deleted: 0,
    similarPairs: 0,
  };
  const contactMap = new Map<string, number>();

  for (const job of jobs) {
    stats[classifyAdminJob(job, autoHideHours, now)]++;

    // 기존 유사공고 기준을 유지한다: 수동으로 숨긴 공고만 비교에서 제외한다.
    if (!job.hidden && job.contact?.trim()) {
      const contact = job.contact.trim();
      contactMap.set(contact, (contactMap.get(contact) ?? 0) + 1);
    }
  }

  stats.similarPairs = [...contactMap.values()].filter((count) => count > 1).length;
  return stats;
}

export function getOtherNonVisibleCount(stats: AdminJobStats): number {
  return stats.closed + stats.expired + stats.reserved + stats.failed + stats.deleted;
}