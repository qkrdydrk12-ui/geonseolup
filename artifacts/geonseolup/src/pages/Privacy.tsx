import Header from '@/components/Header';
import { usePageMeta } from '@/lib/seo';

export default function Privacy() {
  usePageMeta({
    title: '개인정보처리방침 | 건설UP',
    description: '건설UP이 구인 등록과 서비스 운영 과정에서 처리하는 개인정보, 이용 목적, 보유 기준과 이용자 문의 방법을 안내합니다.',
    path: '/privacy',
  });

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f1f5f9' }}>
      <Header />
      <main className="flex-1 max-w-[860px] mx-auto w-full px-4 py-10">
        <h1 className="text-2xl font-bold text-[#1e3a5f] mb-6">개인정보처리방침</h1>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-6 text-sm text-gray-700 leading-relaxed">

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">1. 수집하는 개인정보 항목</h2>
            <p>건설UP은 구인 등록과 서비스 운영 과정에서 다음 정보를 처리할 수 있습니다.</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>구인 공고 내용과 담당자 연락처 — 공고 제공, 지원 연결, 신고 처리 목적</li>
              <li>연락처 해시값 — 단시간 중복 등록 방지 목적</li>
              <li>접속 기록 또는 비식별 통계 정보 — 서비스 안정성 확인과 이용 통계 목적</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">2. 개인정보 수집·이용 목적</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>중복 게시 방지 (30분 쿨타임 적용)</li>
              <li>구인 공고 제공과 연락처 열람 기능 운영</li>
              <li>허위·마감 공고 신고 확인 및 운영상 분쟁 대응</li>
              <li>서비스 이용 통계 및 품질 개선</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">3. 개인정보 보유 및 이용기간</h2>
            <p>
              공고는 등록 후 48시간 동안 모집 중으로 공개되며 이후 마감 처리됩니다. 마감 공고는 서비스 정책에 따라
              일정 기간 보관될 수 있고, 공개 상세 제공 기간이 끝나면 접근이 중단됩니다. 중복 방지용 임시 정보와
              운영 기록은 처리 목적 달성 또는 관련 법령상 보관 기간 종료 후 파기합니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">4. 개인정보의 제3자 제공</h2>
            <p>
              건설UP은 이용자의 개인정보를 판매하지 않습니다. 법령에 따른 요청이 있거나 서비스 제공에 필요한
              처리 위탁이 있는 경우에는 필요한 범위에서만 처리하며, 관련 기준을 준수합니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">5. 브라우저 저장 정보 및 광고</h2>
            <p>
              서비스는 화면 설정과 이용 편의를 위해 로컬스토리지를 사용할 수 있습니다. 또한 Google AdSense 등
              제3자 광고 서비스가 광고 제공·빈도 관리·성과 측정을 위해 쿠키 또는 광고 식별자를 사용할 수 있습니다.
              이용자는 브라우저 설정이나 Google 광고 설정에서 맞춤 광고 사용을 관리할 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">6. 개인정보 보호 책임자</h2>
            <p>개인정보 관련 문의는 <a href="/contact" className="text-[#f97316] underline">문의하기</a> 페이지를 이용해 주세요.</p>
          </section>

          <p className="text-xs text-gray-400 pt-4 border-t border-gray-100">시행일: 2026년 1월 1일</p>
        </div>
      </main>
    </div>
  );
}
