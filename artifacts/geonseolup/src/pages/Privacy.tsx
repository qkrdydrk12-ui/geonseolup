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
            <p>건설UP은 서비스 기능을 제공할 때 아래 정보를 처리합니다.</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><b>구인 등록:</b> 공고 내용(직종·근무지·근무 조건 등), 담당자 정보와 연락처를 받습니다. 연락처는 공고의 명시적 “연락처 보기” 요청에 응답하기 위해 보관하며, 공개 목록·상세 화면에서는 마스킹하여 표시합니다.</li>
              <li><b>중복 등록 확인:</b> 같은 연락처의 반복 등록을 확인하기 위해 연락처를 해시 처리해 사용합니다. 같은 브라우저에서는 30분 등록 제한을 판단하기 위해 연락처와 시각이 브라우저 저장소에 기록될 수 있습니다.</li>
              <li><b>방문·유입 통계:</b> 유입 페이지 경로, 리퍼러, UTM 값, 기기 구분과 요청 IP에서 생성한 해시를 처리합니다. 방문 페이지의 URL 쿼리 문자열은 유입 기록으로 전송하지 않습니다.</li>
              <li><b>페이지 흐름 통계:</b> 탭 단위 임의 세션 ID, 방문 경로, 체류 시간을 처리하고 요청 IP에서 생성한 해시를 사용합니다.</li>
              <li><b>게시글 반응과 댓글:</b> 조회·좋아요의 IP 기반 식별값과, 이용자가 입력한 선택 닉네임·댓글 내용·작성 시각을 처리합니다. 댓글은 게시글에서 공개될 수 있습니다.</li>
            </ul>
            <p className="mt-2">서버는 요청을 처리하는 과정에서 IP 주소를 받지만, 방문·페이지 흐름·게시글 반응을 저장할 때는 원본 IP 대신 해시값을 저장하도록 구성되어 있습니다. 공고 연락처 보기 요청의 횟수 제한에는 원본 IP가 서버 메모리에서 당일 기준으로 사용될 수 있으며, 이 값은 영구 통계 DB에 기록하지 않습니다.</p>
            <p className="mt-2">문의하기 페이지의 이메일은 <b>mailto 링크</b>로 이용자의 이메일 프로그램을 직접 열어드리는 방식입니다. 보내신 이메일은 건설UP 서버가 아닌 이용자 본인의 이메일 계정을 통해 발송됩니다.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">2. 개인정보 수집·이용 목적</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>구인 공고 게시, 공고에 대한 연락처 요청 처리, 본인 브라우저에서의 공고 관리</li>
              <li>같은 연락처의 반복 등록 제한과 서비스 악용·스팸 방지</li>
              <li>게시글 조회·좋아요·댓글 제공 및 댓글 운영</li>
              <li>서비스 이용 통계와 품질 개선(유입 경로·방문 추이·페이지 이동과 체류 시간 분석 포함)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">3. 개인정보 보유 및 이용기간</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>구인 공고와 연락처는 공고 제공 및 연락처 요청 처리에 필요한 기간 동안 보관합니다. 공고가 비공개·삭제되면 공개 화면에서는 제공되지 않습니다.</li>
              <li>방문·유입 통계는 관리자 화면에서 최근 90일 범위까지 조회하도록 제공됩니다. 현재 코드에서는 원본 통계를 90일 후 자동 삭제하는 처리가 확인되지 않아, 이 페이지에서 자동 삭제를 단정하지 않습니다.</li>
              <li>페이지 흐름·게시글 반응 기록과 댓글은 통계·운영·스팸 대응에 필요한 기간 동안 보관할 수 있습니다. 댓글은 운영자가 숨김 처리할 수 있습니다.</li>
              <li>브라우저의 로컬스토리지·세션스토리지는 이용자가 브라우저 설정에서 삭제할 수 있으며, 탭 세션 정보는 일반적으로 탭 또는 브라우저를 닫으면 사라집니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">4. 개인정보의 제3자 제공 및 위탁</h2>
            <p>건설UP은 수집한 개인정보를 광고·마케팅 목적으로 제3자에게 판매하거나 제공하지 않습니다. 공고 데이터와 서비스 운영 데이터는 서비스 제공을 위해 Firebase 등 클라우드·데이터베이스 인프라에서 처리될 수 있으며, 이 과정에서 국외 인프라에 저장·처리될 수 있습니다.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">5. 쿠키와 브라우저 저장소 사용</h2>
            <p>현재 정적 서비스 코드에는 자체 추적 쿠키를 설정하는 기능이 없습니다. 대신 공고 등록 제한·공고 관리·관리자 설정 등에 브라우저 로컬스토리지를, 페이지 흐름 통계의 탭 단위 세션 ID에 세션스토리지를 사용할 수 있습니다. 로컬스토리지와 세션스토리지는 쿠키와 다른 브라우저 저장소입니다.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">6. 광고 및 외부 분석 도구</h2>
            <p>2026년 9월 11일 기준 정적 서비스 코드에는 Google Analytics, Google AdSense 광고 스크립트 또는 광고 슬롯이 내장되어 있지 않습니다. <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">ads.txt</code> 파일의 게시자 인증 정보만으로는 광고가 표시되거나 이용자 행동이 추적되지 않습니다.</p>
            <p className="mt-2">다만 관리자가 브라우저의 head 영역에 외부 스크립트를 추가할 수 있는 기능이 있습니다. 이 방식으로 광고·분석 도구가 실제 도입되면 해당 사업자의 쿠키·개인정보 처리 기준이 적용될 수 있으므로, 도입 전에 이 방침과 필요한 고지·동의 절차를 함께 갱신하겠습니다.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">7. 이용자 유의사항</h2>
            <p>공고 등록·지원 과정에서 주민등록번호, 계좌번호, 신분증 사본 등 민감한 개인정보는 건설UP을 통해 주고받지 않으시길 권장합니다. 이러한 정보 요구를 받으신 경우 아래 문의처로 신고해 주세요.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">8. 개인정보 관련 문의</h2>
            <p>개인정보 관련 문의는 <a href="/contact" className="text-[#f97316] underline">문의하기</a> 페이지를 이용해 주세요.</p>
          </section>

          <p className="text-xs text-gray-400 pt-4 border-t border-gray-100">시행일: 2026년 9월 11일</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
