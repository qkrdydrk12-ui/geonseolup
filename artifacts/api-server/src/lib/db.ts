// 신규 기능(조회수, 푸시 구독, 이메일 구독 등)이 공유하는 Postgres 커넥션 풀.
// visitors.ts는 기존에 자체 풀을 쓰고 있어 그대로 두고, 이후 추가되는 기능들은
// 커넥션을 낭비하지 않도록 이 풀 하나를 공유한다.

import { Pool } from "pg";

export const pgPool = new Pool({
  connectionString: process.env["DATABASE_URL"],
  ssl: { rejectUnauthorized: false },
});

// idle 클라이언트 에러가 프로세스를 죽이지 않도록 처리
pgPool.on("error", (err) => {
  console.error("[DB Pool] Unexpected idle client error:", err.message);
});
