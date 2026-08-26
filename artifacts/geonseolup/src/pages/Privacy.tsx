import Header from '@/components/Header';
import Footer from '@/components/Footer';

export default function Privacy() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f1f5f9' }}>
      <Header />
      <main className="flex-1 max-w-[860px] mx-auto w-full px-4 py-10">
        <h1 className="text-2xl font-bold text-[#1e3a5f] mb-6">개인정보처리방침</h1>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-6 text-sm text-gray-700 leading-relaxed">

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">1. 수집하는 개인정보 항목</h2>
            <p>건설UP은 구인 등록 시 다음 정보를 수집합니다.</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>연락처 (전화번호) — 중복 등록 방지를 위해 해시(SHA-256) 처리 후 저장</li>
              <li>방문자 IP — 통계 목적으로 해시 처리 후 저장, 원본 미보관</li>
              <li>방문 유입 경로 — 검색엔진·SNS 등 어디를 통해 들어왔는지를 통계 목적으로 분류하여 저장 (개인 식별 정보 아님)</li>
            </ul>
            <p className="mt-2">문의하기 페이지의 이메일은 <b>mailto 링크</b>로 이용자의 이메일 프로그램을 직접 열어드리는 방식이며, 보내신 이메일은 건설UP 서버가 아닌 이용자 본인의 이메일 계정을 통해 발송되어 서버에 저장되지 않습니다.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">2. 개인정보 수집·이용 목적</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>중복 게시 방지 (30분 쿨타임 적용)</li>
              <li>서비스 이용 통계 및 품질 개선 (유입 경로·방문 추이 분석 포함)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">3. 개인정보 보유 및 이용기간</h2>
            <p>수집된 해시 데이터는 수집일로부터 1시간 이내 자동 삭제됩니다. 방문 통계는 90일 후 자동 삭제됩니다.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">4. 개인정보의 제3자 제공 및 위탁</h2>
            <p>건설UP은 수집한 개인정보를 광고·마케팅 목적으로 제3자에게 제공하지 않습니다. 다만 서비스 운영을 위해 Google(Firebase) 등 클라우드 인프라 사업자의 서버를 이용하며, 이 경우 국외 인프라에 데이터가 저장될 수 있습니다.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">5. 쿠키(Cookie) 사용</h2>
            <p>서비스는 로그인 상태 유지 및 UI 설정 저장을 위해 브라우저 로컬스토리지를 사용합니다. 별도의 추적 쿠키는 사용하지 않습니다.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">6. 이용자 유의사항</h2>
            <p>공고 등록·지원 과정에서 주민등록번호, 계좌번호, 신분증 사본 등 민감한 개인정보는 건설UP을 통해 주고받지 않으시길 권장합니다. 이러한 정보 요구를 받으신 경우 아래 문의처로 신고해 주세요.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">7. 개인정보 보호 책임자</h2>
            <p>개인정보 관련 문의는 <a href="/contact" className="text-[#f97316] underline">문의하기</a> 페이지를 이용해 주세요.</p>
          </section>

          <p className="text-xs text-gray-400 pt-4 border-t border-gray-100">시행일: 2026년 1월 1일</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
