import assert from 'node:assert/strict';
import { requirePersistedReport } from './reportSubmission.ts';

let writeCount = 0;
const id = await requirePersistedReport(async () => {
  writeCount += 1;
  return { id: 'saved-report-id' };
});

assert.equal(id, 'saved-report-id');
assert.equal(writeCount, 1);

await assert.rejects(
  () => requirePersistedReport(async () => {
    throw new Error('Firestore write failed');
  }),
  /Firestore write failed/,
);

await assert.rejects(
  () => requirePersistedReport(async () => ({ id: '' })),
  /신고 저장 확인에 실패했습니다/,
);

console.log('reportSubmission regression checks passed');