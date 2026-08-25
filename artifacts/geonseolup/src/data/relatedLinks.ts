// 내부링크 보강용 관련 글 매핑 (2026-08-25 신설)
// 키: `news:${slug}` 또는 `info:${slug}` — RelatedLinks 컴포넌트가 이 키로 조회한다.
export interface RelatedLinkEntry {
  type: "news" | "info";
  slug: string;
  title: string;
}

export const RELATED_LINKS: Record<string, RelatedLinkEntry[]> = {
  "news:불법-다단계-하도급-이제-증거-없이-신고해도-포상금-나온다": [
    { type: "news", slug: "하청노조와도-직접-교섭해야-한다-10대-건설사-8곳이-그-대상에-올랐다", title: "하청노조와도 직접 교섭해야 한다, 10대 건설사 8곳이 그 대상에 올랐다" },
    { type: "info", slug: "construction-job-scam-warning-signs-202608", title: "일당 20만원 준다는 공고에 통장 사진부터 보냈다간 큰일 납니다" },
    { type: "info", slug: "job-scam-prevention-guide", title: "작업복값 3만원 먼저 보내라는 팀장, 여기서 이미 사기입니다" },
  ],
  "news:경기도-건설기계-임대료-체불-3년-새-세-배로-늘었다": [
    { type: "news", slug: "폐업-건설사-노동자-밀린-월급-내일부터-6개월치까지-대지급금으로-받는다", title: "폐업 건설사 노동자 밀린 월급, 내일부터 6개월치까지 대지급금으로 받는다" },
    { type: "news", slug: "건설사-폐업-하루-13곳-두-달-새-500곳-넘게-문-닫았다", title: "건설사 폐업 하루 13곳, 두 달 새 500곳 넘게 문 닫았다" },
    { type: "news", slug: "임금체불-처벌-대폭-강화-10월-8일-시행건설현장-파장은", title: "임금체불 처벌 대폭 강화, 10월 8일 시행…건설현장 파장은" },
  ],
  "news:건설-일용직-퇴직공제부금-8700원으로-인상-적립-근로자는-오히려-줄었다": [
    { type: "info", slug: "unemployment-benefit-vs-retirement-fund-202608", title: "실업급여 받으면 퇴직공제금은 포기해야 하는 줄 아셨죠? 사실은 아닙니다" },
    { type: "info", slug: "retirement-pay-guide", title: "건설 일용직도 퇴직금 받을 수 있을까? (건설근로자 퇴직공제제도)" },
    { type: "info", slug: "ecard-tag-guide", title: "전자카드 태그 깜빡하면 퇴직금이 통째로 날아갑니다" },
  ],
  "news:하청노조와도-직접-교섭해야-한다-10대-건설사-8곳이-그-대상에-올랐다": [
    { type: "news", slug: "불법-다단계-하도급-이제-증거-없이-신고해도-포상금-나온다", title: "불법 다단계 하도급, 이제 증거 없이 신고해도 포상금 나온다" },
    { type: "news", slug: "노란봉투법-첫-시험대플랜트건설노조-8월-총파업-초읽기", title: "노란봉투법 첫 시험대…플랜트건설노조 8월 총파업 초읽기" },
  ],
  "news:수도권-폭우-임박-현장-침수붕괴-위험-24시간-집중": [
    { type: "news", slug: "경기-고양-재개발현장-벌쏘임-근로자-15일-투병-끝-숨져", title: "경기 고양 재개발현장 벌쏘임 근로자, 15일 투병 끝 숨져" },
    { type: "news", slug: "철거-현장에-로봇드론-도입-확산-안전기준산재-책임은-아직-공백", title: "철거 현장에 로봇·드론 도입 확산, 안전기준·산재 책임은 아직 공백" },
    { type: "news", slug: "서초-반포-재건축-현장서-50대-근로자-쓰러져-사망폭염철-안전관리-다시-도마-위", title: "서초 반포 재건축 현장서 50대 근로자 쓰러져 사망…폭염철 안전관리 다시 도마 위" },
  ],
  "news:극한기후-작업중지-수당-서울시가-9만원까지-올렸습니다": [
    { type: "news", slug: "폭염에-작업-멈추면-하루-9만원서울시-건설현장-안심수당-전면-개편", title: "폭염에 작업 멈추면 하루 9만원…서울시 건설현장 안심수당 전면 개편" },
    { type: "info", slug: "heatwave-work-stop-wage-guide", title: "폭염특보 떠서 현장 스톱됐는데, 오늘 일당은 어떻게 되나요" },
    { type: "news", slug: "온열질환-산재-6년-새-4배-늘었다건설업이-42로-최다", title: "온열질환 산재, 6년 새 4배 늘었다…건설업이 42%로 최다" },
  ],
  "news:외국인-근로자-안전교육-의무화되고-산업안전관리비-10년-만에-19-오른다": [
    { type: "news", slug: "외국인-근로자-8만-명-확정-건설업-몫은-394명뿐", title: "외국인 근로자 8만 명 확정, 건설업 몫은 394명뿐" },
    { type: "info", slug: "new-site-first-day-safety-checklist-202608", title: "낯선 현장에 처음 나간 날, 사고를 줄이는 법" },
    { type: "info", slug: "construction-site-entry-safety-education-202608", title: "기초안전교육 4시간 받았는데, 현장 옮기면 왜 또 1시간을 받아야 할까요" },
  ],
  "news:폐업-건설사-노동자-밀린-월급-내일부터-6개월치까지-대지급금으로-받는다": [
    { type: "news", slug: "건설사-폐업-하루-13곳-두-달-새-500곳-넘게-문-닫았다", title: "건설사 폐업 하루 13곳, 두 달 새 500곳 넘게 문 닫았다" },
    { type: "news", slug: "경기도-건설기계-임대료-체불-3년-새-세-배로-늘었다", title: "경기도 건설기계 임대료 체불, 3년 새 세 배로 늘었다" },
    { type: "news", slug: "임금체불-처벌-대폭-강화-10월-8일-시행건설현장-파장은", title: "임금체불 처벌 대폭 강화, 10월 8일 시행…건설현장 파장은" },
  ],
  "news:광복절-대체공휴일에도-돌아가는-건설현장-휴일수당은-이렇게-계산된다": [
    { type: "info", slug: "daily-worker-weekly-holiday-pay-guide-202608", title: "일용직은 주휴수당 못 받는다는 얘기, 절반만 맞습니다" },
    { type: "news", slug: "광복절-토요일과-겹쳐-대체공휴일-8월-17일-지정-일용직-적용은-불투명", title: "광복절 토요일과 겹쳐 대체공휴일 8월 17일 지정, 일용직 적용은 불투명" },
    { type: "info", slug: "pipe-fitter-grade-wage-guide-202608", title: "배관공, 조공으로 시작하면 일당이 등급별로 얼마나 다른지 아세요?" },
  ],
  "news:경기-고양-재개발현장-벌쏘임-근로자-15일-투병-끝-숨져": [
    { type: "news", slug: "서초-반포-재건축-현장서-50대-근로자-쓰러져-사망폭염철-안전관리-다시-도마-위", title: "서초 반포 재건축 현장서 50대 근로자 쓰러져 사망…폭염철 안전관리 다시 도마 위" },
    { type: "news", slug: "수도권-폭우-임박-현장-침수붕괴-위험-24시간-집중", title: "수도권 폭우 임박, 현장 침수·붕괴 위험 24시간 집중" },
    { type: "news", slug: "온열질환-산재-6년-새-4배-늘었다건설업이-42로-최다", title: "온열질환 산재, 6년 새 4배 늘었다…건설업이 42%로 최다" },
  ],
  "news:광복절-토요일과-겹쳐-대체공휴일-8월-17일-지정-일용직-적용은-불투명": [
    { type: "news", slug: "광복절-대체공휴일에도-돌아가는-건설현장-휴일수당은-이렇게-계산된다", title: "광복절 대체공휴일에도 돌아가는 건설현장, 휴일수당은 이렇게 계산된다" },
    { type: "info", slug: "daily-worker-weekly-holiday-pay-guide-202608", title: "일용직은 주휴수당 못 받는다는 얘기, 절반만 맞습니다" },
  ],
  "news:건설사-폐업-하루-13곳-두-달-새-500곳-넘게-문-닫았다": [
    { type: "news", slug: "폐업-건설사-노동자-밀린-월급-내일부터-6개월치까지-대지급금으로-받는다", title: "폐업 건설사 노동자 밀린 월급, 내일부터 6개월치까지 대지급금으로 받는다" },
    { type: "news", slug: "경기도-건설기계-임대료-체불-3년-새-세-배로-늘었다", title: "경기도 건설기계 임대료 체불, 3년 새 세 배로 늘었다" },
    { type: "news", slug: "임금체불-처벌-대폭-강화-10월-8일-시행건설현장-파장은", title: "임금체불 처벌 대폭 강화, 10월 8일 시행…건설현장 파장은" },
  ],
  "news:건설기능등급제-개편-2028년부터-숙련도평가-추가된다": [
    { type: "info", slug: "aerial-work-platform-safety-education-202608", title: "고소작업대 올라가기 전 2시간, 안 받으면 현장에서 못 올라갑니다" },
    { type: "info", slug: "towercrane-signalman-certificate-guide-202608", title: "신호수 교육 안 받고 타워크레인 옆에 서면 과태료 나옵니다" },
    { type: "info", slug: "forklift-license-vs-certificate-guide-202608", title: "지게차 자격증 시험 붙었는데, 아직 무면허일 수 있습니다" },
  ],
  "news:온열질환-산재-6년-새-4배-늘었다건설업이-42로-최다": [
    { type: "news", slug: "서초-반포-재건축-현장서-50대-근로자-쓰러져-사망폭염철-안전관리-다시-도마-위", title: "서초 반포 재건축 현장서 50대 근로자 쓰러져 사망…폭염철 안전관리 다시 도마 위" },
    { type: "news", slug: "극한기후-작업중지-수당-서울시가-9만원까지-올렸습니다", title: "극한기후 작업중지 수당, 서울시가 9만원까지 올렸습니다" },
    { type: "news", slug: "경기-고양-재개발현장-벌쏘임-근로자-15일-투병-끝-숨져", title: "경기 고양 재개발현장 벌쏘임 근로자, 15일 투병 끝 숨져" },
  ],
  "news:외국인-근로자-8만-명-확정-건설업-몫은-394명뿐": [
    { type: "news", slug: "외국인-근로자-안전교육-의무화되고-산업안전관리비-10년-만에-19-오른다", title: "외국인 근로자 안전교육 의무화되고 산업안전관리비 10년 만에 19% 오른다" },
  ],
  "news:철거-현장에-로봇드론-도입-확산-안전기준산재-책임은-아직-공백": [
    { type: "news", slug: "수도권-폭우-임박-현장-침수붕괴-위험-24시간-집중", title: "수도권 폭우 임박, 현장 침수·붕괴 위험 24시간 집중" },
    { type: "news", slug: "경기-고양-재개발현장-벌쏘임-근로자-15일-투병-끝-숨져", title: "경기 고양 재개발현장 벌쏘임 근로자, 15일 투병 끝 숨져" },
    { type: "news", slug: "서초-반포-재건축-현장서-50대-근로자-쓰러져-사망폭염철-안전관리-다시-도마-위", title: "서초 반포 재건축 현장서 50대 근로자 쓰러져 사망…폭염철 안전관리 다시 도마 위" },
  ],
  "news:폭염에-작업-멈추면-하루-9만원서울시-건설현장-안심수당-전면-개편": [
    { type: "news", slug: "극한기후-작업중지-수당-서울시가-9만원까지-올렸습니다", title: "극한기후 작업중지 수당, 서울시가 9만원까지 올렸습니다" },
    { type: "info", slug: "heatwave-work-stop-wage-guide", title: "폭염특보 떠서 현장 스톱됐는데, 오늘 일당은 어떻게 되나요" },
    { type: "news", slug: "온열질환-산재-6년-새-4배-늘었다건설업이-42로-최다", title: "온열질환 산재, 6년 새 4배 늘었다…건설업이 42%로 최다" },
  ],
  "news:노란봉투법-첫-시험대플랜트건설노조-8월-총파업-초읽기": [
    { type: "news", slug: "하청노조와도-직접-교섭해야-한다-10대-건설사-8곳이-그-대상에-올랐다", title: "하청노조와도 직접 교섭해야 한다, 10대 건설사 8곳이 그 대상에 올랐다" },
  ],
  "news:임금체불-처벌-대폭-강화-10월-8일-시행건설현장-파장은": [
    { type: "news", slug: "경기도-건설기계-임대료-체불-3년-새-세-배로-늘었다", title: "경기도 건설기계 임대료 체불, 3년 새 세 배로 늘었다" },
    { type: "news", slug: "폐업-건설사-노동자-밀린-월급-내일부터-6개월치까지-대지급금으로-받는다", title: "폐업 건설사 노동자 밀린 월급, 내일부터 6개월치까지 대지급금으로 받는다" },
    { type: "news", slug: "건설사-폐업-하루-13곳-두-달-새-500곳-넘게-문-닫았다", title: "건설사 폐업 하루 13곳, 두 달 새 500곳 넘게 문 닫았다" },
  ],
  "news:서초-반포-재건축-현장서-50대-근로자-쓰러져-사망폭염철-안전관리-다시-도마-위": [
    { type: "news", slug: "경기-고양-재개발현장-벌쏘임-근로자-15일-투병-끝-숨져", title: "경기 고양 재개발현장 벌쏘임 근로자, 15일 투병 끝 숨져" },
    { type: "news", slug: "온열질환-산재-6년-새-4배-늘었다건설업이-42로-최다", title: "온열질환 산재, 6년 새 4배 늘었다…건설업이 42%로 최다" },
    { type: "info", slug: "summer-heat-safety", title: "혹서기 건설현장 온열질환 예방수칙" },
  ],
  "news:gtx-c노선-2년-표류-끝내고-8월-본격-착공수도권-인력-수요-늘어나나": [
    { type: "news", slug: "용인-반도체-클러스터-연결도로-9000억-턴키-공사-사업자-선정-절차-돌입", title: "용인 반도체 클러스터 연결도로, 9000억 턴키 공사 사업자 선정 절차 돌입" },
    { type: "info", slug: "giheung-sr5-dram-fab-jobs-202608", title: "요즘 기흥 공고가 부쩍 늘었다 했더니, 이유가 있었습니다" },
  ],
  "news:용인-반도체-클러스터-연결도로-9000억-턴키-공사-사업자-선정-절차-돌입": [
    { type: "info", slug: "giheung-sr5-dram-fab-jobs-202608", title: "요즘 기흥 공고가 부쩍 늘었다 했더니, 이유가 있었습니다" },
    { type: "news", slug: "gtx-c노선-2년-표류-끝내고-8월-본격-착공수도권-인력-수요-늘어나나", title: "GTX-C노선, 2년 표류 끝내고 8월 본격 착공…수도권 인력 수요 늘어나나" },
    { type: "info", slug: "cheongju-ochang-sk-hynix-wage-housing-202608", title: "오창 일당은 오르는데, 방 구하기는 오히려 더 어려워졌습니다" },
  ],
  "news:체감온도-35도-넘으면-오후-2시5시-작업중지": [
    { type: "news", slug: "극한기후-작업중지-수당-서울시가-9만원까지-올렸습니다", title: "극한기후 작업중지 수당, 서울시가 9만원까지 올렸습니다" },
    { type: "news", slug: "온열질환-산재-6년-새-4배-늘었다건설업이-42로-최다", title: "온열질환 산재, 6년 새 4배 늘었다…건설업이 42%로 최다" },
    { type: "news", slug: "폭염에-작업-멈추면-하루-9만원서울시-건설현장-안심수당-전면-개편", title: "폭염에 작업 멈추면 하루 9만원…서울시 건설현장 안심수당 전면 개편" },
  ],
  "info:pipe-fitter-grade-wage-guide-202608": [
    { type: "info", slug: "cheongju-ochang-sk-hynix-wage-housing-202608", title: "오창 일당은 오르는데, 방 구하기는 오히려 더 어려워졌습니다" },
    { type: "info", slug: "pyeongtaek-yongin-wage-compare-202608", title: "평택 유도원 13만 5천, 용인은 16만인 이유" },
    { type: "info", slug: "plumbing-job-guide", title: "배관공(설비)이 하는 일 상세 가이드" },
  ],
  "info:unemployment-benefit-vs-retirement-fund-202608": [
    { type: "news", slug: "건설-일용직-퇴직공제부금-8700원으로-인상-적립-근로자는-오히려-줄었다", title: "건설 일용직 퇴직공제부금 8,700원으로 인상, 적립 근로자는 오히려 줄었다" },
    { type: "info", slug: "retirement-pay-guide", title: "건설 일용직도 퇴직금 받을 수 있을까? (건설근로자 퇴직공제제도)" },
    { type: "info", slug: "unemployment-benefit-guide", title: "이거 몰라서 실업급여 못 받는 일용직 진짜 많습니다" },
  ],
  "info:ppe-free-issue-safety-shoes-helmet-202608": [
    { type: "news", slug: "수도권-폭우-임박-현장-침수붕괴-위험-24시간-집중", title: "수도권 폭우 임박, 현장 침수·붕괴 위험 24시간 집중" },
    { type: "news", slug: "경기-고양-재개발현장-벌쏘임-근로자-15일-투병-끝-숨져", title: "경기 고양 재개발현장 벌쏘임 근로자, 15일 투병 끝 숨져" },
    { type: "news", slug: "철거-현장에-로봇드론-도입-확산-안전기준산재-책임은-아직-공백", title: "철거 현장에 로봇·드론 도입 확산, 안전기준·산재 책임은 아직 공백" },
  ],
  "info:daily-worker-weekly-holiday-pay-guide-202608": [
    { type: "news", slug: "광복절-대체공휴일에도-돌아가는-건설현장-휴일수당은-이렇게-계산된다", title: "광복절 대체공휴일에도 돌아가는 건설현장, 휴일수당은 이렇게 계산된다" },
    { type: "news", slug: "광복절-토요일과-겹쳐-대체공휴일-8월-17일-지정-일용직-적용은-불투명", title: "광복절 토요일과 겹쳐 대체공휴일 8월 17일 지정, 일용직 적용은 불투명" },
    { type: "info", slug: "pipe-fitter-grade-wage-guide-202608", title: "배관공, 조공으로 시작하면 일당이 등급별로 얼마나 다른지 아세요?" },
  ],
  "info:new-site-first-day-safety-checklist-202608": [
    { type: "news", slug: "외국인-근로자-안전교육-의무화되고-산업안전관리비-10년-만에-19-오른다", title: "외국인 근로자 안전교육 의무화되고 산업안전관리비 10년 만에 19% 오른다" },
    { type: "info", slug: "construction-site-entry-safety-education-202608", title: "기초안전교육 4시간 받았는데, 현장 옮기면 왜 또 1시간을 받아야 할까요" },
    { type: "info", slug: "aerial-work-platform-safety-education-202608", title: "고소작업대 올라가기 전 2시간, 안 받으면 현장에서 못 올라갑니다" },
  ],
  "info:agency-referral-fee-limit-202608": [
    { type: "news", slug: "광복절-대체공휴일에도-돌아가는-건설현장-휴일수당은-이렇게-계산된다", title: "광복절 대체공휴일에도 돌아가는 건설현장, 휴일수당은 이렇게 계산된다" },
    { type: "info", slug: "pipe-fitter-grade-wage-guide-202608", title: "배관공, 조공으로 시작하면 일당이 등급별로 얼마나 다른지 아세요?" },
    { type: "info", slug: "daily-worker-weekly-holiday-pay-guide-202608", title: "일용직은 주휴수당 못 받는다는 얘기, 절반만 맞습니다" },
  ],
  "info:cheongju-ochang-sk-hynix-wage-housing-202608": [
    { type: "info", slug: "pipe-fitter-grade-wage-guide-202608", title: "배관공, 조공으로 시작하면 일당이 등급별로 얼마나 다른지 아세요?" },
    { type: "info", slug: "giheung-sr5-dram-fab-jobs-202608", title: "요즘 기흥 공고가 부쩍 늘었다 했더니, 이유가 있었습니다" },
    { type: "info", slug: "pyeongtaek-yongin-wage-compare-202608", title: "평택 유도원 13만 5천, 용인은 16만인 이유" },
  ],
  "info:construction-site-meal-cost-deduction-guide-202608": [
    { type: "news", slug: "광복절-대체공휴일에도-돌아가는-건설현장-휴일수당은-이렇게-계산된다", title: "광복절 대체공휴일에도 돌아가는 건설현장, 휴일수당은 이렇게 계산된다" },
    { type: "info", slug: "pipe-fitter-grade-wage-guide-202608", title: "배관공, 조공으로 시작하면 일당이 등급별로 얼마나 다른지 아세요?" },
    { type: "info", slug: "daily-worker-weekly-holiday-pay-guide-202608", title: "일용직은 주휴수당 못 받는다는 얘기, 절반만 맞습니다" },
  ],
  "info:construction-site-entry-safety-education-202608": [
    { type: "news", slug: "외국인-근로자-안전교육-의무화되고-산업안전관리비-10년-만에-19-오른다", title: "외국인 근로자 안전교육 의무화되고 산업안전관리비 10년 만에 19% 오른다" },
    { type: "info", slug: "new-site-first-day-safety-checklist-202608", title: "낯선 현장에 처음 나간 날, 사고를 줄이는 법" },
    { type: "info", slug: "aerial-work-platform-safety-education-202608", title: "고소작업대 올라가기 전 2시간, 안 받으면 현장에서 못 올라갑니다" },
  ],
  "info:aerial-work-platform-safety-education-202608": [
    { type: "news", slug: "외국인-근로자-안전교육-의무화되고-산업안전관리비-10년-만에-19-오른다", title: "외국인 근로자 안전교육 의무화되고 산업안전관리비 10년 만에 19% 오른다" },
    { type: "news", slug: "건설기능등급제-개편-2028년부터-숙련도평가-추가된다", title: "건설기능등급제 개편, 2028년부터 숙련도평가 추가된다" },
    { type: "info", slug: "new-site-first-day-safety-checklist-202608", title: "낯선 현장에 처음 나간 날, 사고를 줄이는 법" },
  ],
  "info:towercrane-signalman-certificate-guide-202608": [
    { type: "info", slug: "forklift-license-vs-certificate-guide-202608", title: "지게차 자격증 시험 붙었는데, 아직 무면허일 수 있습니다" },
    { type: "news", slug: "건설기능등급제-개편-2028년부터-숙련도평가-추가된다", title: "건설기능등급제 개편, 2028년부터 숙련도평가 추가된다" },
    { type: "info", slug: "pipe-fitter-grade-wage-guide-202608", title: "배관공, 조공으로 시작하면 일당이 등급별로 얼마나 다른지 아세요?" },
  ],
  "info:forklift-license-vs-certificate-guide-202608": [
    { type: "info", slug: "towercrane-signalman-certificate-guide-202608", title: "신호수 교육 안 받고 타워크레인 옆에 서면 과태료 나옵니다" },
    { type: "news", slug: "건설기능등급제-개편-2028년부터-숙련도평가-추가된다", title: "건설기능등급제 개편, 2028년부터 숙련도평가 추가된다" },
    { type: "info", slug: "pipe-fitter-grade-wage-guide-202608", title: "배관공, 조공으로 시작하면 일당이 등급별로 얼마나 다른지 아세요?" },
  ],
  "info:tbm-work-instructions-checklist-202608": [
    { type: "news", slug: "외국인-근로자-안전교육-의무화되고-산업안전관리비-10년-만에-19-오른다", title: "외국인 근로자 안전교육 의무화되고 산업안전관리비 10년 만에 19% 오른다" },
    { type: "info", slug: "new-site-first-day-safety-checklist-202608", title: "낯선 현장에 처음 나간 날, 사고를 줄이는 법" },
    { type: "info", slug: "construction-site-entry-safety-education-202608", title: "기초안전교육 4시간 받았는데, 현장 옮기면 왜 또 1시간을 받아야 할까요" },
  ],
  "info:construction-job-scam-warning-signs-202608": [
    { type: "news", slug: "불법-다단계-하도급-이제-증거-없이-신고해도-포상금-나온다", title: "불법 다단계 하도급, 이제 증거 없이 신고해도 포상금 나온다" },
    { type: "info", slug: "job-scam-prevention-guide", title: "작업복값 3만원 먼저 보내라는 팀장, 여기서 이미 사기입니다" },
  ],
  "info:giheung-sr5-dram-fab-jobs-202608": [
    { type: "news", slug: "용인-반도체-클러스터-연결도로-9000억-턴키-공사-사업자-선정-절차-돌입", title: "용인 반도체 클러스터 연결도로, 9000억 턴키 공사 사업자 선정 절차 돌입" },
    { type: "info", slug: "cheongju-ochang-sk-hynix-wage-housing-202608", title: "오창 일당은 오르는데, 방 구하기는 오히려 더 어려워졌습니다" },
    { type: "news", slug: "gtx-c노선-2년-표류-끝내고-8월-본격-착공수도권-인력-수요-늘어나나", title: "GTX-C노선, 2년 표류 끝내고 8월 본격 착공…수도권 인력 수요 늘어나나" },
  ],
  "info:pyeongtaek-yongin-wage-compare-202608": [
    { type: "info", slug: "pipe-fitter-grade-wage-guide-202608", title: "배관공, 조공으로 시작하면 일당이 등급별로 얼마나 다른지 아세요?" },
    { type: "info", slug: "cheongju-ochang-sk-hynix-wage-housing-202608", title: "오창 일당은 오르는데, 방 구하기는 오히려 더 어려워졌습니다" },
    { type: "info", slug: "yongin-wonsam-housing-shortage-tips", title: "월세 85만원에도 방이 없다는 용인 원삼, 그래도 방법은 있습니다" },
  ],
  "info:yongin-wonsam-housing-shortage-tips": [
    { type: "info", slug: "cheongju-ochang-sk-hynix-wage-housing-202608", title: "오창 일당은 오르는데, 방 구하기는 오히려 더 어려워졌습니다" },
    { type: "info", slug: "pyeongtaek-yongin-wage-compare-202608", title: "평택 유도원 13만 5천, 용인은 16만인 이유" },
    { type: "info", slug: "pyeongtaek-godeok-housing-guide", title: "평택 고덕 현장, 원룸 500채가 통째로 계약돼서 없습니다" },
  ],
  "info:job-daypay-conditions-checklist": [
    { type: "info", slug: "guide3", title: "일당 높은 건설 일자리 찾는 5가지 방법" },
    { type: "news", slug: "광복절-대체공휴일에도-돌아가는-건설현장-휴일수당은-이렇게-계산된다", title: "광복절 대체공휴일에도 돌아가는 건설현장, 휴일수당은 이렇게 계산된다" },
    { type: "info", slug: "pipe-fitter-grade-wage-guide-202608", title: "배관공, 조공으로 시작하면 일당이 등급별로 얼마나 다른지 아세요?" },
  ],
  "info:pyeongtaek-godeok-housing-guide": [
    { type: "info", slug: "cheongju-ochang-sk-hynix-wage-housing-202608", title: "오창 일당은 오르는데, 방 구하기는 오히려 더 어려워졌습니다" },
    { type: "info", slug: "pyeongtaek-yongin-wage-compare-202608", title: "평택 유도원 13만 5천, 용인은 16만인 이유" },
    { type: "info", slug: "yongin-wonsam-housing-shortage-tips", title: "월세 85만원에도 방이 없다는 용인 원삼, 그래도 방법은 있습니다" },
  ],
  "info:job-scam-prevention-guide": [
    { type: "news", slug: "불법-다단계-하도급-이제-증거-없이-신고해도-포상금-나온다", title: "불법 다단계 하도급, 이제 증거 없이 신고해도 포상금 나온다" },
    { type: "info", slug: "construction-job-scam-warning-signs-202608", title: "일당 20만원 준다는 공고에 통장 사진부터 보냈다간 큰일 납니다" },
  ],
  "info:heatwave-work-stop-wage-guide": [
    { type: "news", slug: "극한기후-작업중지-수당-서울시가-9만원까지-올렸습니다", title: "극한기후 작업중지 수당, 서울시가 9만원까지 올렸습니다" },
    { type: "news", slug: "폭염에-작업-멈추면-하루-9만원서울시-건설현장-안심수당-전면-개편", title: "폭염에 작업 멈추면 하루 9만원…서울시 건설현장 안심수당 전면 개편" },
    { type: "news", slug: "광복절-대체공휴일에도-돌아가는-건설현장-휴일수당은-이렇게-계산된다", title: "광복절 대체공휴일에도 돌아가는 건설현장, 휴일수당은 이렇게 계산된다" },
  ],
  "info:plumbing-job-guide": [
    { type: "info", slug: "pipe-fitter-grade-wage-guide-202608", title: "배관공, 조공으로 시작하면 일당이 등급별로 얼마나 다른지 아세요?" },
    { type: "info", slug: "towercrane-signalman-certificate-guide-202608", title: "신호수 교육 안 받고 타워크레인 옆에 서면 과태료 나옵니다" },
    { type: "info", slug: "forklift-license-vs-certificate-guide-202608", title: "지게차 자격증 시험 붙었는데, 아직 무면허일 수 있습니다" },
  ],
  "info:industrial-accident-guide": [
    { type: "news", slug: "경기-고양-재개발현장-벌쏘임-근로자-15일-투병-끝-숨져", title: "경기 고양 재개발현장 벌쏘임 근로자, 15일 투병 끝 숨져" },
    { type: "news", slug: "온열질환-산재-6년-새-4배-늘었다건설업이-42로-최다", title: "온열질환 산재, 6년 새 4배 늘었다…건설업이 42%로 최다" },
    { type: "news", slug: "서초-반포-재건축-현장서-50대-근로자-쓰러져-사망폭염철-안전관리-다시-도마-위", title: "서초 반포 재건축 현장서 50대 근로자 쓰러져 사망…폭염철 안전관리 다시 도마 위" },
  ],
  "info:basic-safety-education": [
    { type: "news", slug: "외국인-근로자-안전교육-의무화되고-산업안전관리비-10년-만에-19-오른다", title: "외국인 근로자 안전교육 의무화되고 산업안전관리비 10년 만에 19% 오른다" },
    { type: "info", slug: "new-site-first-day-safety-checklist-202608", title: "낯선 현장에 처음 나간 날, 사고를 줄이는 법" },
    { type: "info", slug: "construction-site-entry-safety-education-202608", title: "기초안전교육 4시간 받았는데, 현장 옮기면 왜 또 1시간을 받아야 할까요" },
  ],
  "info:summer-heat-safety": [
    { type: "news", slug: "서초-반포-재건축-현장서-50대-근로자-쓰러져-사망폭염철-안전관리-다시-도마-위", title: "서초 반포 재건축 현장서 50대 근로자 쓰러져 사망…폭염철 안전관리 다시 도마 위" },
    { type: "news", slug: "수도권-폭우-임박-현장-침수붕괴-위험-24시간-집중", title: "수도권 폭우 임박, 현장 침수·붕괴 위험 24시간 집중" },
    { type: "news", slug: "극한기후-작업중지-수당-서울시가-9만원까지-올렸습니다", title: "극한기후 작업중지 수당, 서울시가 9만원까지 올렸습니다" },
  ],
  "info:fire-watch-guide": [
    { type: "news", slug: "외국인-근로자-안전교육-의무화되고-산업안전관리비-10년-만에-19-오른다", title: "외국인 근로자 안전교육 의무화되고 산업안전관리비 10년 만에 19% 오른다" },
    { type: "info", slug: "pipe-fitter-grade-wage-guide-202608", title: "배관공, 조공으로 시작하면 일당이 등급별로 얼마나 다른지 아세요?" },
    { type: "info", slug: "new-site-first-day-safety-checklist-202608", title: "낯선 현장에 처음 나간 날, 사고를 줄이는 법" },
  ],
  "info:welding-types-guide": [
    { type: "info", slug: "pipe-fitter-grade-wage-guide-202608", title: "배관공, 조공으로 시작하면 일당이 등급별로 얼마나 다른지 아세요?" },
    { type: "info", slug: "towercrane-signalman-certificate-guide-202608", title: "신호수 교육 안 받고 타워크레인 옆에 서면 과태료 나옵니다" },
    { type: "info", slug: "forklift-license-vs-certificate-guide-202608", title: "지게차 자격증 시험 붙었는데, 아직 무면허일 수 있습니다" },
  ],
  "info:wage-delay-response": [
    { type: "news", slug: "경기도-건설기계-임대료-체불-3년-새-세-배로-늘었다", title: "경기도 건설기계 임대료 체불, 3년 새 세 배로 늘었다" },
    { type: "news", slug: "폐업-건설사-노동자-밀린-월급-내일부터-6개월치까지-대지급금으로-받는다", title: "폐업 건설사 노동자 밀린 월급, 내일부터 6개월치까지 대지급금으로 받는다" },
    { type: "news", slug: "건설사-폐업-하루-13곳-두-달-새-500곳-넘게-문-닫았다", title: "건설사 폐업 하루 13곳, 두 달 새 500곳 넘게 문 닫았다" },
  ],
  "info:retirement-pay-guide": [
    { type: "news", slug: "건설-일용직-퇴직공제부금-8700원으로-인상-적립-근로자는-오히려-줄었다", title: "건설 일용직 퇴직공제부금 8,700원으로 인상, 적립 근로자는 오히려 줄었다" },
    { type: "info", slug: "unemployment-benefit-vs-retirement-fund-202608", title: "실업급여 받으면 퇴직공제금은 포기해야 하는 줄 아셨죠? 사실은 아닙니다" },
    { type: "info", slug: "ecard-tag-guide", title: "전자카드 태그 깜빡하면 퇴직금이 통째로 날아갑니다" },
  ],
  "info:wage-gyeonggi-202608": [
    { type: "info", slug: "pipe-fitter-grade-wage-guide-202608", title: "배관공, 조공으로 시작하면 일당이 등급별로 얼마나 다른지 아세요?" },
    { type: "info", slug: "cheongju-ochang-sk-hynix-wage-housing-202608", title: "오창 일당은 오르는데, 방 구하기는 오히려 더 어려워졌습니다" },
    { type: "info", slug: "pyeongtaek-yongin-wage-compare-202608", title: "평택 유도원 13만 5천, 용인은 16만인 이유" },
  ],
  "info:guide5": [
    { type: "info", slug: "new-site-first-day-safety-checklist-202608", title: "낯선 현장에 처음 나간 날, 사고를 줄이는 법" },
    { type: "info", slug: "cheongju-ochang-sk-hynix-wage-housing-202608", title: "오창 일당은 오르는데, 방 구하기는 오히려 더 어려워졌습니다" },
    { type: "info", slug: "yongin-wonsam-housing-shortage-tips", title: "월세 85만원에도 방이 없다는 용인 원삼, 그래도 방법은 있습니다" },
  ],
  "info:guide4": [
    { type: "news", slug: "수도권-폭우-임박-현장-침수붕괴-위험-24시간-집중", title: "수도권 폭우 임박, 현장 침수·붕괴 위험 24시간 집중" },
    { type: "news", slug: "외국인-근로자-안전교육-의무화되고-산업안전관리비-10년-만에-19-오른다", title: "외국인 근로자 안전교육 의무화되고 산업안전관리비 10년 만에 19% 오른다" },
    { type: "news", slug: "경기-고양-재개발현장-벌쏘임-근로자-15일-투병-끝-숨져", title: "경기 고양 재개발현장 벌쏘임 근로자, 15일 투병 끝 숨져" },
  ],
  "info:guide3": [
    { type: "info", slug: "job-daypay-conditions-checklist", title: "잡부 일당 16만 원, 금액보다 먼저 확인할 5가지" },
    { type: "news", slug: "광복절-대체공휴일에도-돌아가는-건설현장-휴일수당은-이렇게-계산된다", title: "광복절 대체공휴일에도 돌아가는 건설현장, 휴일수당은 이렇게 계산된다" },
    { type: "info", slug: "pipe-fitter-grade-wage-guide-202608", title: "배관공, 조공으로 시작하면 일당이 등급별로 얼마나 다른지 아세요?" },
  ],
  "info:guide2": [
    { type: "info", slug: "pipe-fitter-grade-wage-guide-202608", title: "배관공, 조공으로 시작하면 일당이 등급별로 얼마나 다른지 아세요?" },
    { type: "info", slug: "new-site-first-day-safety-checklist-202608", title: "낯선 현장에 처음 나간 날, 사고를 줄이는 법" },
    { type: "info", slug: "towercrane-signalman-certificate-guide-202608", title: "신호수 교육 안 받고 타워크레인 옆에 서면 과태료 나옵니다" },
  ],
  "info:guide1": [
    { type: "info", slug: "new-site-first-day-safety-checklist-202608", title: "낯선 현장에 처음 나간 날, 사고를 줄이는 법" },
    { type: "info", slug: "job-daypay-conditions-checklist", title: "잡부 일당 16만 원, 금액보다 먼저 확인할 5가지" },
    { type: "info", slug: "guide5", title: "숙식 제공 건설 일자리 장단점 정리" },
  ],
  "info:unemployment-benefit-guide": [
    { type: "info", slug: "unemployment-benefit-vs-retirement-fund-202608", title: "실업급여 받으면 퇴직공제금은 포기해야 하는 줄 아셨죠? 사실은 아닙니다" },
  ],
  "info:ecard-tag-guide": [
    { type: "news", slug: "건설-일용직-퇴직공제부금-8700원으로-인상-적립-근로자는-오히려-줄었다", title: "건설 일용직 퇴직공제부금 8,700원으로 인상, 적립 근로자는 오히려 줄었다" },
    { type: "info", slug: "unemployment-benefit-vs-retirement-fund-202608", title: "실업급여 받으면 퇴직공제금은 포기해야 하는 줄 아셨죠? 사실은 아닙니다" },
    { type: "info", slug: "retirement-pay-guide", title: "건설 일용직도 퇴직금 받을 수 있을까? (건설근로자 퇴직공제제도)" },
  ],
  "info:p5-guide-worker-guide": [
    { type: "info", slug: "pyeongtaek-yongin-wage-compare-202608", title: "평택 유도원 13만 5천, 용인은 16만인 이유" },
    { type: "info", slug: "pyeongtaek-godeok-housing-guide", title: "평택 고덕 현장, 원룸 500채가 통째로 계약돼서 없습니다" },
    { type: "news", slug: "외국인-근로자-안전교육-의무화되고-산업안전관리비-10년-만에-19-오른다", title: "외국인 근로자 안전교육 의무화되고 산업안전관리비 10년 만에 19% 오른다" },
  ],
  "info:wage-tax-withholding-guide": [
    { type: "news", slug: "광복절-대체공휴일에도-돌아가는-건설현장-휴일수당은-이렇게-계산된다", title: "광복절 대체공휴일에도 돌아가는 건설현장, 휴일수당은 이렇게 계산된다" },
    { type: "info", slug: "pipe-fitter-grade-wage-guide-202608", title: "배관공, 조공으로 시작하면 일당이 등급별로 얼마나 다른지 아세요?" },
    { type: "info", slug: "daily-worker-weekly-holiday-pay-guide-202608", title: "일용직은 주휴수당 못 받는다는 얘기, 절반만 맞습니다" },
  ],
};
