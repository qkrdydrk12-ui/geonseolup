export const DEFAULT_REGIONS = ['전체', '서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '해외'];
export const DEFAULT_JOBS = ['전체', '조공', '배관', '용접', '형틀', '철근', '미장', '도장', '토공', '전기', '설비', '화기감시자', '유도원', '양중', '덕트', '비계', '포설', '보온', '관리자', '안전담당자', '안전시설반', '품질담당자', '공사담당자', '칸막이', '청소', '기타'];

export function getRegions(): string[] {
  try {
    const stored = localStorage.getItem('cj_custom_regions');
    if (stored) {
      const arr = JSON.parse(stored);
      if (Array.isArray(arr) && arr.length > 0) return ['전체', ...arr];
    }
  } catch {}
  return DEFAULT_REGIONS;
}

export function getJobs(): string[] {
  try {
    const stored = localStorage.getItem('cj_custom_jobs');
    if (stored) {
      const arr = JSON.parse(stored);
      if (Array.isArray(arr) && arr.length > 0) {
        const merged = [...arr];
        // 기존 저장 목록에 신규 직종이 없으면 '기타' 앞에 추가
        for (const j of ['포설', '보온', '관리자', '칸막이', '청소']) {
          if (!merged.includes(j)) {
            const idx = merged.indexOf('기타');
            merged.splice(idx === -1 ? merged.length : idx, 0, j);
          }
        }
        return ['전체', ...merged];
      }
    }
  } catch {}
  return DEFAULT_JOBS;
}
