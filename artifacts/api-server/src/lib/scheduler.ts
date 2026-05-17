// 서버 기반 예약 공고 발행 스케줄러
// 매 60초마다 Firebase Firestore를 직접 체크하여 예약 시간 도달 공고를 발행합니다.
// 브라우저/클라이언트 세션과 완전히 독립적으로 동작합니다.

import { runQuery, updateDocument, addDocument, isPermissionError } from "./firestoreClient.js";
import { logger } from "./logger.js";

const INTERVAL_MS = 60 * 1000; // 1분

interface Job {
  id: string;
  title?: string;
  status?: string;
  reservedAt?: string;
  repeatDays?: number;
  retryCount?: number;
  lastRetryAt?: string;
  failReason?: string;
  date?: string;
  hidden?: boolean;
  [key: string]: unknown;
}

export interface SchedulerStats {
  startedAt: string;
  lastRunAt: string | null;
  isRunning: boolean;
  totalPublished: number;
  totalRetried: number;
  totalFailed: number;
  lastPublished: number;
  lastRetried: number;
  lastFailed: number;
  nextRunInSeconds: number;
  intervalSeconds: number;
}

const _stats = {
  startedAt: new Date().toISOString(),
  lastRunAt: null as string | null,
  isRunning: false,
  totalPublished: 0,
  totalRetried: 0,
  totalFailed: 0,
  lastPublished: 0,
  lastRetried: 0,
  lastFailed: 0,
  intervalSeconds: 60,
};

let _lastRunMs = Date.now();
let _intervalHandle: ReturnType<typeof setInterval> | null = null;

export function getSchedulerStats(): SchedulerStats {
  const elapsed = Math.floor((Date.now() - _lastRunMs) / 1000);
  return {
    ..._stats,
    nextRunInSeconds: Math.max(0, _stats.intervalSeconds - elapsed),
  };
}

export async function runSchedulerOnce(): Promise<{
  published: number;
  retried: number;
  failed: number;
}> {
  if (_stats.isRunning) return { published: 0, retried: 0, failed: 0 };

  _stats.isRunning = true;
  _lastRunMs = Date.now();
  const now = Date.now();

  // Asia/Seoul 기준 현재 시각 (로그용)
  const nowKST = new Date(now)
    .toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

  let published = 0;
  let retried = 0;
  let failed = 0;

  try {
    // ── 1. 예약 시간 도달 공고 조회 ───────────────────────────────────────────
    const reserved = (await runQuery("jobs", [
      { field: "status", op: "EQUAL", value: "reserved" },
    ])) as Job[];

    const due = reserved
      .filter(
        (j) =>
          j.reservedAt != null &&
          new Date(j.reservedAt).getTime() <= now
      )
      .sort(
        (a, b) =>
          new Date(a.reservedAt!).getTime() -
          new Date(b.reservedAt!).getTime()
      );

    for (const job of due) {
      try {
        const nowIso = new Date().toISOString();

        // 발행 처리 — status: active, date: 현재, reservedAt 초기화
        await updateDocument("jobs", job.id, {
          status: "active",
          date: nowIso,
          publishedAt: nowIso,
          reservedAt: null,
          retryCount: 0,
          lastRetryAt: null,
          failReason: null,
        });
        published++;

        // 반복 예약 (repeatDays > 0)
        if (job.repeatDays && Number(job.repeatDays) > 0) {
          const repeatAt = new Date(
            Date.now() + Number(job.repeatDays) * 24 * 3600000
          ).toISOString();
          const { id: _id, publishedAt: _p, failReason: _f, lastRetryAt: _lr, ...rest } =
            job;
          await addDocument("jobs", {
            ...rest,
            status: "reserved",
            reservedAt: repeatAt,
            date: nowIso,
            hidden: false,
            retryCount: 0,
            publishedAt: null,
            failReason: null,
            lastRetryAt: null,
          });
        }

        // 예약 로그 저장
        await addDocument("reservationLogs", {
          jobId: job.id,
          jobTitle: job.title ?? "",
          scheduledAt: job.reservedAt ?? "",
          publishedAt: new Date().toISOString(),
          status: "published",
          isRepeat: (job.retryCount ?? 0) > 0,
          repeatDays: job.repeatDays ?? null,
          createdAt: new Date().toISOString(),
        });

        logger.info(
          { jobId: job.id, title: job.title, kst: nowKST },
          "서버 스케줄러: 예약 공고 발행 완료"
        );
      } catch (err) {
        failed++;
        const errMsg = String(err);
        // 권한 오류(403)는 재시도해도 해결 안 됨 → 즉시 영구 실패 처리
        const perm = isPermissionError(0, errMsg) || errMsg.includes("403");
        const reason = perm
          ? `Firestore 권한 오류(403) — Firestore 보안 규칙에서 익명 쓰기 허용 필요 [sdk=REST/anonymous]`
          : errMsg.slice(0, 200);
        const retryCount = Number(job.retryCount ?? 0);

        await updateDocument("jobs", job.id, {
          status: "failed",
          retryCount: perm ? 99 : retryCount + 1, // 권한 오류는 99로 설정해 자동 재시도 차단
          lastRetryAt: new Date().toISOString(),
          failReason: reason,
        }).catch(() => {});

        await addDocument("reservationLogs", {
          jobId: job.id,
          jobTitle: job.title ?? "",
          scheduledAt: job.reservedAt ?? "",
          status: "failed",
          failReason: reason,
          retryCount: perm ? 99 : retryCount + 1,
          createdAt: new Date().toISOString(),
        }).catch(() => {});

        logger.error(
          {
            jobId: job.id,
            errMsg,
            reason,
            isPermission: perm,
            sdk: "REST/anonymous-auth",
            collection: "jobs",
          },
          perm
            ? "서버 스케줄러: Firestore 권한 오류(403) — 보안 규칙 확인 필요"
            : "서버 스케줄러: 예약 공고 발행 실패"
        );
      }
    }

    // ── 2. 실패 공고 자동 재시도 (5분 경과, 최대 3회) ──────────────────────
    const failedJobs = (await runQuery("jobs", [
      { field: "status", op: "EQUAL", value: "failed" },
    ])) as Job[];

    const toRetry = failedJobs.filter(
      (j) =>
        (j.retryCount ?? 0) < 3 &&   // 99는 권한 오류 영구 실패 — 재시도 차단
        j.lastRetryAt != null &&
        now - new Date(j.lastRetryAt).getTime() >= 5 * 60000 &&
        !(String(j.failReason ?? "").includes("403") || String(j.failReason ?? "").includes("권한 오류"))
    );

    for (const job of toRetry) {
      try {
        const retryAt = new Date(Date.now() + 30000).toISOString();
        await updateDocument("jobs", job.id, {
          status: "reserved",
          reservedAt: retryAt,
          failReason: null,
        });
        retried++;
        logger.info(
          { jobId: job.id, retryCount: job.retryCount },
          "서버 스케줄러: 발행 실패 공고 재시도 예약"
        );
      } catch (err) {
        logger.error({ jobId: job.id, err }, "서버 스케줄러: 재시도 예약 실패");
      }
    }
  } catch (err) {
    logger.error({ err }, "서버 스케줄러: 실행 중 오류 발생");
  } finally {
    _stats.isRunning = false;
    _stats.lastRunAt = new Date().toISOString();
    _stats.lastPublished = published;
    _stats.lastRetried = retried;
    _stats.lastFailed = failed;
    _stats.totalPublished += published;
    _stats.totalRetried += retried;
    _stats.totalFailed += failed;

    if (published > 0 || retried > 0 || failed > 0) {
      logger.info(
        { published, retried, failed },
        "서버 스케줄러: 실행 결과"
      );
    }
  }

  return { published, retried, failed };
}

export function startScheduler(): void {
  if (_intervalHandle != null) return;
  logger.info(
    { intervalSeconds: _stats.intervalSeconds },
    "서버 스케줄러 시작 — 브라우저 독립 예약 발행 활성화"
  );
  // 서버 시작 즉시 1회 실행
  runSchedulerOnce().catch((err) =>
    logger.error({ err }, "스케줄러 초기 실행 실패")
  );
  _intervalHandle = setInterval(() => {
    runSchedulerOnce().catch((err) =>
      logger.error({ err }, "스케줄러 주기 실행 실패")
    );
  }, INTERVAL_MS);
}

export function stopScheduler(): void {
  if (_intervalHandle != null) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
    logger.info("서버 스케줄러 중지");
  }
}
