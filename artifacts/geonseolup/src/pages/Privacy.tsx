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
            <p>건설UP은 구인 정보와 커뮤니티 기능을 제공하고 서비스를 안전하게 운영하기 위해 아래 정보를 처리할 수 있습니다.</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><b>구인 등록:</b> 공고 내용, 담당자 정보, 연락처를 받습니다. 연락처는 구직자가 공고에서 연락처 보기를 요청할 때 제공되며, 공고 목록과 상세 화면에서는 일부 가려서 표시합니다.</li>
              <li><b>서비스 이용:</b> 방문한 페이지, 유입 경로, 기기 구분, 페이지 이용 시간 등 서비스 이용 정보를 통계와 품질 개선을 위해 처리할 수 있습니다.</li>
              <li><b>부정 이용 방지:</b> 중복 등록·스팸 방지와 이용 횟수 제한을 위해 요청 정보와 IP 주소에서 생성한 식별값을 사용할 수 있습니다.</li>
              <li><b>댓글과 반응:</b> 선택 닉네임, 댓글 내용, 작성 시각, 게시글 조회·좋아요 정보가 처리됩니다. 작성한 댓글과 닉네임은 다른 이용자에게 공개될 수 있습니다.</li>
            </ul>
            <p className="mt-2">문의하기의 이메일 링크는 이용자의 이메일 앱을 여는 방식입니다. 이메일을 보내면 그 내용은 이용자가 사용하는 이메일 서비스의 정책에 따라 처리될 수 있습니다.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">2. 개인정보 수집·이용 목적</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>구인 공고 게시, 공고 검색, 연락처 보기 등 구인 서비스 제공</li>
              <li>댓글·좋아요 등 커뮤니티 기능 제공과 게시물 운영</li>
              <li>중복 등록, 스팸, 비정상 이용 방지와 서비스 보안 유지</li>
              <li>방문 흐름과 이용 현황을 분석하여 서비스 품질 개선</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">3. 개인정보 보유 및 이용기간</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>구인 공고와 연락처는 공고 제공, 연락처 요청 처리, 부정 이용 방지와 분쟁 대응에 필요한 기간 동안 보관합니다. 공고가 비공개되거나 삭제되면 공개 화면에서는 제공되지 않습니다.</li>
              <li>댓글과 게시글 반응, 서비스 이용 기록은 서비스 운영·통계·스팸 대응에 필요한 기간 동안 보관할 수 있습니다. 운영 기준에 따라 댓글은 숨김 처리될 수 있습니다.</li>
              <li>관련 법령에서 보관을 요구하는 정보는 해당 기간 동안 보관한 뒤 지체 없이 삭제하거나, 더 이상 필요하지 않은 정보는 안전한 방법으로 삭제합니다.</li>
              <li>브라우저에 저장된 정보는 이용자가 브라우저 설정에서 직접 삭제할 수 있습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">4. 개인정보의 제3자 제공 및 위탁</h2>
            <p>건설UP은 개인정보를 광고·마케팅 목적으로 판매하지 않습니다. 서비스 제공을 위해 Firebase 등 클라우드·데이터베이스 인프라를 이용할 수 있으며, 이 경우 해당 사업자가 서비스를 제공하는 데 필요한 범위에서 정보를 처리할 수 있습니다. 서비스 특성상 정보가 국외 인프라에 저장·처리될 수 있습니다.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">5. 쿠키와 브라우저 저장소 사용</h2>
            <p>서비스는 이용 상태 유지, 공고 관리, 중복 등록 방지, 화면 기능 제공을 위해 쿠키 또는 브라우저 저장소(로컬스토리지·세션스토리지)를 사용할 수 있습니다. 이용자는 브라우저 설정에서 쿠키와 저장된 정보를 허용·차단·삭제할 수 있으나, 일부 기능이 정상적으로 작동하지 않을 수 있습니다.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">6. Google 광고와 광고 설정</h2>
            <p>서비스에 Google 광고가 제공되는 경우 Google 및 광고 파트너는 광고 제공, 성과 측정, 광고 개인화 또는 비개인화 광고 제공을 위해 쿠키, 기기 식별자 또는 이와 유사한 기술을 사용할 수 있습니다. 적용되는 정보 처리 방식은 Google의 개인정보처리방침과 광고 정책을 따릅니다.</p>
            <p className="mt-2">개인 맞춤 광고 설정은 <a href="https://myadcenter.google.com/" className="text-[#f97316] underline" target="_blank" rel="noreferrer">Google 내 광고 센터</a>에서 관리할 수 있습니다. 브라우저의 쿠키 설정으로도 일부 광고 관련 저장 정보를 관리할 수 있습니다.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">7. 이용자의 권리와 요청 방법</h2>
            <p>이용자는 본인 개인정보에 대해 열람, 정정, 삭제, 처리 정지 등을 요청할 수 있습니다. 공고 또는 댓글의 수정·삭제 요청, 개인정보 처리 관련 문의는 아래 문의처로 알려 주세요. 법령상 보관 의무가 있거나 다른 이용자의 권리·안전과 충돌하는 경우에는 요청을 제한할 수 있습니다.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">8. 개인정보 관련 문의</h2>
            <p>개인정보 관련 문의와 권리 행사 요청은 <a href="/contact" className="text-[#f97316] underline">문의하기</a> 페이지를 이용해 주세요. 요청 내용과 본인 확인에 필요한 최소한의 정보를 확인한 뒤 처리 결과를 안내드리겠습니다.</p>
            <p className="mt-2">공고 등록·지원 과정에서 주민등록번호, 계좌번호, 신분증 사본, 비밀번호와 같은 민감한 정보는 건설UP을 통해 주고받지 마세요. 이러한 정보를 요구받은 경우 문의처로 알려 주세요.</p>
          </section>

          <p className="text-xs text-gray-400 pt-4 border-t border-gray-100">시행일: 2026년 9월 11일</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
