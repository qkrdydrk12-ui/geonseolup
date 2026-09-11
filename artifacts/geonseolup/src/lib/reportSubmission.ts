export interface PersistedReport {
  id: string;
}

/**
 * 저장소가 반환한 문서 ID가 있을 때만 신고를 접수된 것으로 취급한다.
 * 저장 오류와 불완전한 저장 결과는 호출자에게 그대로 전달한다.
 */
export async function requirePersistedReport(
  save: () => Promise<PersistedReport>,
): Promise<string> {
  const saved = await save();
  if (!saved?.id) {
    throw new Error('신고 저장 확인에 실패했습니다.');
  }
  return saved.id;
}