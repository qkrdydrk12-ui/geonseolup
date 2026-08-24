import Header from '@/components/Header';

export default function Terms() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f1f5f9' }}>
      <Header />
      <main className="flex-1 max-w-[860px] mx-auto w-full px-4 py-10">
        <h1 className="text-2xl font-bold text-[#1e3a5f] mb-6">이용약관</h1>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-6 text-sm text-gray-700 leading-relaxed">

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">제1조 (목적)</h2>
            <p>이 약관은 건설UP(이하 "서비스")이 제공하는 건설 현장 구인·구직 정보 서비스의 이용 조건 및 절차, 이용자와 서비스 간의 권리·의무 및 책임 사항을 규정함을 목적으로 합니다.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">제2조 (서비스 내용)</h2>
            <p>건설UP은 건설 현장 구인 정보 게시 및 열람 서비스를 무료로 제공합니다. 서비스는 사전 고지 없이 내용이 변경되거나 중단될 수 있습니다.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">제3조 (게시물 관리)</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>허위·과장된 구인 정보 게시를 금지합니다.</li>
              <li>동일 연락처로 30분 이내 중복 게시를 제한합니다.</li>
              <li>서비스 운영자는 부적절한 게시물을 사전 통보 없이 삭제할 수 있습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">제4조 (면책사항)</h2>
            <p>건설UP은 게시된 구인 정보의 정확성·신뢰성을 보증하지 않습니다. 이용자는 직접 확인 후 거래하시기 바라며, 이로 인해 발생하는 손해에 대해 서비스는 책임을 지지 않습니다.</p>
          </section>

          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">제5조 (약관 변경)</h2>
            <p>본 약관은 관계 법령 변경 또는 서비스 정책에 따라 변경될 수 있으며, 변경 시 서비스 내 공지를 통해 안내합니다.</p>
          </section>

          <p className="text-xs text-gray-400 pt-4 border-t border-gray-100">시행일: 2026년 1월 1일</p>
        </div>
      </main>
    </div>
  );
}
