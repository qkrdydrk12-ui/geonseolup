// 서버 기반 예약 공고 발행 스케줄러
// 매 60초마다 Firebase Firestore를 직접 체크하여 예약 시간 도달 공고를 발행합니다.
// 브라우저/클라이언트 세션과 완전히 독립적으로 동작합니다.

import {
  runQuery,
  updateDocument,
  updateDocumentGuarded,
  addDocument,
  deleteDocument,
  getDocument,
  isPermissionError,
} from "./firestoreClient.js";
import { logger } from "./logger.js";
import { ACTIVE_HOURS, RETENTION_DAYS_AFTER_CLOSE } from "./jobLifecycle.js";

// 완전 삭제 하한: 활성 48시간 + 마감 상태 30일 유지 = 32일.
// 관리자 설정(autoDeleteHours)이 이보다 짧아도 상세 페이지 유지 기간을 침범하지 않는다.
const MIN_DELETE_HOURS = ACTIVE_HOURS + RETENTION_DAYS_AFTER_CLOSE * 24;

const INTERVAL_MS = 60 * 1000; // 1분

// 정리(자동숨김/자동삭제) 루틴은 매 분 실행하면 과해서 30분마다 1번만 실행
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
let _lastCleanupMs = 0;

interface DupSettings {
  autoHideHours?: number;
  autoDeleteHours?: number;
}

// settings/dup_settings 문서 형태: { value: { autoHideHours, autoDeleteHours } }
async function loadDupSettings(): Promise<DupSettings> {
  try {
    const doc = await getDocument("settings", "dup_settings");
    if (!doc) return { autoHideHours: 48, autoDeleteHours: 0 };
    const v = (doc as { value?: DupSettings }).value;
    if (!v || typeof v !== "object") return { autoHideHours: 48, autoDeleteHours: 0 };
    return {
      autoHideHours: typeof v.autoHideHours === "number" ? v.autoHideHours : 48,
      autoDeleteHours: typeof v.autoDeleteHours === "number" ? v.autoDeleteHours : 0,
    };
  } catch (e) {
    logger.warn({ err: String(e) }, "정리 루틴: dup_settings 조회 실패 — 기본값 사용");
    return { autoHideHours: 48, autoDeleteHours: 0 };
  }
}

// 정리 실행 — 자동숨김은 하지 않는다.
// "등록 48시간 후 모집마감"은 API가 등록일(date) 기준으로 파생 판정하며(jobLifecycle),
// hidden 처리하면 마감 공고의 상세 페이지(30일 유지·SEO)까지 사라지므로 금지.
async function runCleanup(): Promise<{ hidden: number; purged: number; deleted: number }> {
  const settings = await loadDupSettings();
  const autoDeleteHours = settings.autoDeleteHours ?? 0;
  const now = Date.now();

  // 모든 jobs를 한 번에 조회하기 어려우므로 status 필터로 published + (status 없음 기본값) 조회
  // 안전을 위해 status='reserved'와 'failed'는 자동삭제에서 제외 (예약 발행 보호)
  // 자동숨김은 일반 공고(status==='published' 또는 미지정)에만 적용

  // 모든 jobs (status 필터 없이) — runQuery는 필터 1개 이상 요구해서 hidden=false 와 hidden=true 분리 조회
  const visibleJobs = (await runQuery("jobs", [
    { field: "hidden", op: "EQUAL", value: false },
  ])) as Job[];
  const hiddenJobs = (await runQuery("jobs", [
    { field: "hidden", op: "EQUAL", value: true },
  ])) as Job[];

  const hidden = 0; // 자동숨김 제거됨 — 마감 판정은 jobLifecycle이 date 기준으로 파생
  let purged = 0;
  let deleted = 0;

  // ── 1. 24시간 이상 숨김 상태인 공고 하드삭제 (관리자가 수동 숨김한 공고 정리) ──
  {
    const cutoff = now - 24 * 3600000;
    const toPurge = hiddenJobs.filter(
      (j) => typeof j.hiddenAt === "number" && (j.hiddenAt as number) < cutoff
    );
    for (const j of toPurge) {
      try {
        await deleteDocument("jobs", j.id);
        purged++;
      } catch (err) {
        logger.warn({ jobId: j.id, err: String(err) }, "정리 루틴: 숨김 공고 하드삭제 실패");
      }
    }
  }

  // ── 2. 자동삭제: date 기준 초과 → 완전 삭제 (예약/실패 제외) ──
  // 설정값과 무관하게 최소 32일(활성 2일 + 마감 30일)은 보존한다.
  {
    const effectiveHours = Math.max(autoDeleteHours || MIN_DELETE_HOURS, MIN_DELETE_HOURS);
    const cutoff = now - effectiveHours * 3600000;
    const all = [...visibleJobs, ...hiddenJobs];
    const toDelete = all.filter(
      (j) =>
        j.status !== "reserved" &&
        j.status !== "failed" &&
        j.date != null &&
        new Date(j.date).getTime() < cutoff
    );
    for (const j of toDelete) {
      try {
        await deleteDocument("jobs", j.id);
        deleted++;
      } catch (err) {
        logger.warn({ jobId: j.id, err: String(err) }, "정리 루틴: 자동삭제 실패");
      }
    }
  }

  if (purged > 0 || deleted > 0) {
    logger.info(
      { purged, deleted, autoDeleteHours },
      "정리 루틴: 삭제 완료 (자동숨김 없음 — 마감은 등록일 기준 파생)"
    );
  }
  return { hidden, purged, deleted };
}

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

        // 안전망: contact 비었는데 원문에 010 번호가 있으면 자동 보강
        const updatePayload: Record<string, unknown> = {
          status: "active",
          date: nowIso,
          publishedAt: nowIso,
          reservedAt: null,
          retryCount: 0,
          lastRetryAt: null,
          failReason: null,
        };
        const currentContact = ((job as { contact?: string }).contact ?? "").trim();
        const originalText = (job as { originalText?: string }).originalText ?? "";
        if (!currentContact && originalText) {
          const phoneMatch = originalText.match(
            /01[016789][-.\s]*\d{3,4}[-.\s]*\d{4}/
          );
          if (phoneMatch) {
            const rescued = phoneMatch[0]
              .replace(/[\s.]/g, "-")
              .replace(/-+/g, "-");
            updatePayload.contact = rescued;
            logger.info(
              { jobId: job.id, title: job.title, rescued },
              "서버 스케줄러: contact 안전망 — 원문에서 전화번호 자동 보강"
            );
          }
        }

        // 원자적 발행 — 읽은 시점 이후 문서가 안 바뀐 경우에만 적용.
        // 다른 발행 주체(클라이언트 탭/다른 서버 인스턴스)가 먼저 처리했으면 건너뜀(중복 방지).
        const expectedUpdateTime = (job as { _updateTime?: string })._updateTime;
        if (!expectedUpdateTime) {
          // updateTime을 확보하지 못하면 원자성 보장 불가 → 비원자적 발행은
          // 중복 위험이 있으므로 이번 주기는 건너뛰고 다음 주기에 재시도.
          logger.warn(
            { jobId: job.id, title: job.title },
            "서버 스케줄러: updateTime 미확보 — 원자성 보장 불가로 이번 발행 건너뜀(다음 주기 재시도)"
          );
          continue;
        }
        const claimed = await updateDocumentGuarded(
          "jobs",
          job.id,
          updatePayload,
          expectedUpdateTime
        );

        if (!claimed) {
          logger.info(
            { jobId: job.id, title: job.title },
            "서버 스케줄러: publish 건너뜀 — 이미 다른 주체가 발행함(중복 방지)"
          );
          continue;
        }

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
    // ── 3. 자동숨김/자동삭제 정리 (30분마다 1회만 실행) ───────────────────────
    if (Date.now() - _lastCleanupMs >= CLEANUP_INTERVAL_MS) {
      _lastCleanupMs = Date.now();
      try {
        await runCleanup();
      } catch (cleanupErr) {
        logger.error({ err: String(cleanupErr) }, "서버 스케줄러: 정리 루틴 실행 실패");
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

// ── 실패 공고 일괄 초기화 (권한 오류 등으로 retryCount=99 영구 실패된 공고 복구) ──────
export async function bulkResetFailed(): Promise<{ reset: number; total: number }> {
  const failedJobs = (await runQuery("jobs", [
    { field: "status", op: "EQUAL", value: "failed" },
  ])) as Job[];

  const nowPlus30s = new Date(Date.now() + 30000).toISOString();
  let reset = 0;

  for (const job of failedJobs) {
    try {
      await updateDocument("jobs", job.id, {
        status: "reserved",
        reservedAt: nowPlus30s,
        retryCount: 0,
        failReason: null,
        lastRetryAt: null,
      });
      reset++;
    } catch (err) {
      logger.error({ jobId: job.id, err: String(err) }, "bulkResetFailed: 개별 초기화 실패");
    }
  }

  logger.info(
    { reset, total: failedJobs.length },
    "bulkResetFailed: 실패 공고 일괄 초기화 완료"
  );
  return { reset, total: failedJobs.length };
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
