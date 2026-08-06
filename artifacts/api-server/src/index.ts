import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./lib/scheduler";
import { startEmailDigestScheduler } from "./lib/emailSubscribers";
import { startThreadsTokenScheduler } from "./lib/threadsToken";
import { startCommentPolling } from "./lib/threadsComments";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  // 이메일 구독 다이제스트는 Firestore가 아닌 Postgres/Resend만 쓰므로
  // 읽기 쿼터와 무관 — 환경 상관없이 항상 켠다 (RESEND_API_KEY 없으면 내부에서 조용히 스킵).
  startEmailDigestScheduler();
  // Threads 장기 토큰 자동 갱신 — THREADS_ACCESS_TOKEN_SEED 없으면 내부에서 조용히 스킵.
  startThreadsTokenScheduler();
  // Threads 댓글 감지(10분마다) — 답글 초안만 자동 생성, 실제 발행은 항상 사람 승인 필요.
  startCommentPolling();
  // 스케줄러(예약 발행 + 자동숨김/삭제 정리)는 Firestore를 주기적으로 읽는다.
  // 개발 환경과 운영 환경이 같은 Firestore 프로젝트를 공유하므로, 둘 다 켜면
  // 무료 읽기 한도를 두 배로 소진한다. 운영(NODE_ENV=production)에서만 켜고,
  // 개발에서 강제로 켜야 할 때만 ENABLE_SCHEDULER=1 로 활성화한다.
  const schedulerEnabled =
    process.env["NODE_ENV"] === "production" ||
    process.env["ENABLE_SCHEDULER"] === "1";
  if (schedulerEnabled) {
    startScheduler();
  } else {
    logger.info(
      "서버 스케줄러 비활성화 (개발 환경) — Firestore 읽기 쿼터 절약. 켜려면 ENABLE_SCHEDULER=1",
    );
  }
});
