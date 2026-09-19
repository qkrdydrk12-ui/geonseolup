import assert from 'node:assert/strict';
import type { Job } from './firebase.ts';
import { classifyAdminJob, getAdminJobStats } from './adminJobStats.ts';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const now = Date.UTC(2026, 8, 11, 12, 0, 0);

function job(id: string, ageMs: number, overrides: Partial<Job> = {}): Job {
  return {
    id,
    title: id,
    region: '경기',
    job: '조공',
    salary: '150,000원',
    date: new Date(now - ageMs).toISOString(),
    ...overrides,
  };
}

function assertPartition(stats: ReturnType<typeof getAdminJobStats>) {
  const buckets =
    stats.visible +
    stats.autoHidden +
    stats.manualHidden +
    stats.closed +
    stats.expired +
    stats.reserved +
    stats.failed +
    stats.deleted;
  assert.equal(buckets, stats.total, 'every stored job must be in exactly one state');
}

// 자동숨김 시각의 정확한 경계와 비활성화 상태를 확인한다.
assert.equal(classifyAdminJob(job('auto-at-boundary', 24 * HOUR_MS), 24, now), 'autoHidden');
assert.equal(classifyAdminJob(job('before-auto-boundary', 24 * HOUR_MS - 1), 24, now), 'visible');
assert.equal(classifyAdminJob(job('closed-with-auto-disabled', 48 * HOUR_MS), 0, now), 'closed');

// 만료 경계와 상태 중첩의 우선순위를 확인한다.
const expiresAtAge = (48 + 90 * 24) * HOUR_MS;
assert.equal(classifyAdminJob(job('expired-at-boundary', expiresAtAge), 0, now), 'expired');
assert.equal(classifyAdminJob(job('before-expiry-boundary', expiresAtAge - 1), 0, now), 'closed');
assert.equal(
  classifyAdminJob(job('manual-before-expiry', expiresAtAge, { hidden: true }), 0, now),
  'manualHidden',
);
assert.equal(
  classifyAdminJob(job('reserved-before-manual', 1, { hidden: true, status: 'reserved' }), 0, now),
  'reserved',
);
assert.equal(
  classifyAdminJob(job('deleted-before-everything', expiresAtAge, { hidden: true, _deleted: true }), 24, now),
  'deleted',
);

// 기존 관리자 요약의 대표 수치가 전체 보관 수와 일치하는지 확인한다.
const regressionJobs = [
  ...Array.from({ length: 341 }, (_, index) => job(`visible-${index}`, HOUR_MS)),
  ...Array.from({ length: 2999 }, (_, index) => job(`auto-${index}`, 49 * HOUR_MS)),
  ...Array.from({ length: 5 }, (_, index) => job(`manual-${index}`, 49 * HOUR_MS, { hidden: true })),
];
const regressionStats = getAdminJobStats(regressionJobs, 48, now);
assert.equal(regressionStats.total, 3345);
assert.equal(regressionStats.visible, 341);
assert.equal(regressionStats.autoHidden, 2999);
assert.equal(regressionStats.manualHidden, 5);
assertPartition(regressionStats);

const mixedStats = getAdminJobStats([
  job('visible', HOUR_MS),
  job('auto', 25 * HOUR_MS),
  job('manual', 25 * HOUR_MS, { hidden: true }),
  job('closed', 48 * HOUR_MS),
  job('expired', expiresAtAge),
  job('reserved', HOUR_MS, { status: 'reserved' }),
  job('failed', HOUR_MS, { status: 'failed' }),
  job('deleted', HOUR_MS, { _deleted: true }),
], 24, now);
assertPartition(mixedStats);

console.log('adminJobStats regression checks passed');