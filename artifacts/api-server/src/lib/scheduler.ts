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
  lastError: string | null;
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
  lastError: null as string | null,
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
  const nowKST = new Date(now).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

  let published = 0;
  let retried = 0;
  let failed = 0;

  try {
    // ── 1. 예약 상태 공고 전체 조회 ──────────────────────────────────────────
    logger.info({ kst: nowKST }, "서버 스케줄러: 실행 시작 (Asia/Seoul 기준)");

    const reserved = (await runQuery("jobs", [
      { field: "status", op: "EQUAL", value: "reserved" },
    ])) as Job[];

    logger.info(
      { total: reserved.length, kst: nowKST },
      "서버 스케줄러: 예약 공고 조회 완료"
    );

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

    if (due.length === 0) {
      logger.info("서버 스케줄러: 발행 대기 공고 없음 — 다음 실행 대기");
    } else {
      logger.info(
        { due: due.length, titles: due.map((j) => j.title ?? j.id) },
        "서버 스케줄러: 발행 시간 도달 공고 발견"
      );
    }

    for (const job of due) {
      try {
        const nowIso = new Date().toISOString();
        const nowIsoKST = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

        logger.info(
          { jobId: job.id, title: job.title, reservedAt: job.reservedAt, nowKST: nowIsoKST },
          "서버 스케줄러: publish 시도 중"
        );

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

        logger.info(
          { jobId: job.id, title: job.title, publishedAt: nowIsoKST },
          "서버 스케줄러: DB update 성공 — status → active"
        );

        // 발행 성공 카운트 (이후 로그 저장 실패와 무관하게 성공으로 처리)
        published++;
        _stats.lastError = null;

        // 반복 예약 (repeatDays > 0) — 실패해도 발행 성공은 유지
        if (job.repeatDays && Number(job.repeatDays) > 0) {
          const repeatAt = new Date(
            Date.now() + Number(job.repeatDays) * 24 * 3600000
          ).toISOString();
          const { id: _id, publishedAt: _p, failReason: _f, lastRetryAt: _lr, ...rest } =
            job;
          try {
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
            logger.info(
              { jobId: job.id, repeatAt },
              "서버 스케줄러: 반복 예약 등록 완료"
            );
          } catch (repeatErr) {
            logger.warn(
              { jobId: job.id, err: String(repeatErr) },
              "서버 스케줄러: 반복 예약 등록 실패 (발행은 이미 완료)"
            );
          }
        }

        // 예약 로그 저장 — 실패해도 발행 성공은 유지 (reservationLogs 컬렉션 권한 오류 대응)
        try {
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
        } catch (logErr) {
          logger.warn(
            { jobId: job.id, err: String(logErr) },
            "서버 스케줄러: 예약 로그 저장 실패 (발행은 이미 완료 — reservationLogs 컬렉션 쓰기 권한 확인 필요)"
          );
        }

        logger.info(
          { jobId: job.id, title: job.title, kst: nowKST },
          "서버 스케줄러: 예약 공고 발행 완료"
        );
      } catch (err) {
        failed++;
        const errMsg = String(err);

        // 권한 오류(403) — 재시도해도 해결 안 됨 → 영구 실패 처리
        const perm = isPermissionError(0, errMsg) || errMsg.includes("403");
        // Firestore 규칙이 쓰기를 허용하지 않음
        const reason = perm
          ? `Firestore 권한 오류 — 보안 규칙에서 쓰기를 허용해야 합니다`
          : errMsg.slice(0, 300);

        _stats.lastError = reason;
        const retryCount = Number(job.retryCount ?? 0);

        await updateDocument("jobs", job.id, {
          status: "failed",
          retryCount: perm ? 99 : retryCount + 1,
          lastRetryAt: new Date().toISOString(),
          failReason: reason,
        }).catch((e) => {
          logger.error({ jobId: job.id, err: String(e) }, "서버 스케줄러: 실패 상태 기록도 실패");
        });

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
            title: job.title,
            errMsg,
            reason,
            isPermission: perm,
            collection: "jobs",
          },
          perm
            ? "서버 스케줄러: Firestore 권한 오류 — 보안 규칙 확인 필요"
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
        !(String(j.failReason ?? "").includes("403") ||
          String(j.failReason ?? "").includes("권한 오류") ||
          String(j.failReason ?? "").includes("권한"))
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
          { jobId: job.id, retryCount: job.retryCount, retryAt },
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

    logger.info(
      { published, retried, failed, totalPublished: _stats.totalPublished },
      "서버 스케줄러: 실행 결과"
    );
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
