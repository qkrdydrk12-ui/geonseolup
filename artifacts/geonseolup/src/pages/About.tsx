import Header from '@/components/Header';
import { usePageMeta } from '@/lib/seo';

export default function About() {
  usePageMeta({
    title: '건설UP 소개 | 건설 현장 일자리 정보 서비스',
    description: '건설UP의 운영 목적, 공고 관리 원칙, 건설 근로자를 위한 구인 정보와 실무 콘텐츠 제공 기준을 안내합니다.',
    path: '/about',
  });

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f1f5f9' }}>
      <Header />
      <main className="flex-1 max-w-[860px] mx-auto w-full px-4 py-10">
        <h1 className="text-2xl font-bold text-[#1e3a5f] mb-6">건설UP 소개</h1>
        
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-8 text-sm text-gray-700 leading-relaxed">
          
          <section>
            <h2 className="text-lg font-bold text-gray-800 mb-3">건설UP 서비스 소개</h2>
            <p>
              건설UP은 전국 건설 현장의 구인·구직 정보와 실무에 필요한 유용한 정보를 한곳에 모아 제공하는 생활 밀착형 플랫폼입니다. 
              현장 근로자분들이 복잡한 절차 없이 손쉽게 일자리를 찾고, 필요한 지식을 빠르게 습득할 수 있도록 직관적이고 편리한 서비스를 지향합니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-800 mb-3">건설업 종사자를 위한 맞춤형 공간</h2>
            <p>
              초보 조공부터 배관, 용접, 전기, 화기감시자 등 숙련된 기술자까지 건설업에 종사하는 모든 분들을 대상으로 합니다.
              전국의 다양한 근로자들이 한곳에 모여 정보를 교류하고 소통하며, 건설업 종사자만의 공감대를 형성할 수 있는 열린 공간을 제공합니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-800 mb-3">전국 구인·구직 정보</h2>
            <p>
              전국 각지의 건설 현장 구인 공고를 지역별, 직종별로 쉽게 검색할 수 있습니다. 
              숙식 제공 여부, 단가, 근무 조건 등을 한눈에 비교할 수 있어 사용자에게 가장 적합한 현장을 빠르게 찾을 수 있도록 지원합니다.
              공고는 등록 후 48시간 동안 모집 중으로 공개되며, 이후에는 마감 상태를 명확히 안내해 오래된 정보로 인한 혼선을 줄입니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-800 mb-3">현장소식 및 실무 정보/꿀팁</h2>
            <p>
              지속적으로 업데이트되는 현장소식을 통해 최신 업계 동향을 파악할 수 있습니다. 
              또한, 처음 건설 현장 일을 시작하는 분들을 위한 기초 가이드부터 안전 수칙, 작업 노하우, 현장 용어 해설 등 
              실제 현장에서 바로 활용할 수 있는 다양한 건설 실무 정보와 꿀팁을 지속적으로 제공합니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-800 mb-3">구인정보 이용 주의사항</h2>
            <p>
              건설UP은 사용자 편의를 위해 구인 정보를 중개 및 제공하고 있으나, 등록된 공고의 완전성이나 신뢰성을 전적으로 보증하지는 않습니다.
              구직 시에는 반드시 공고 담당자와 직접 연락하여 근로 조건과 현장 상황을 명확히 확인하신 후 결정하시기 바랍니다. 
              허위나 과장된 정보로 의심되는 경우 신고 기능을 통해 즉시 알려주시면 확인 후 조치하겠습니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-gray-800 mb-3">운영 목적</h2>
            <p>
              건설UP은 정보의 비대칭성을 해소하고, 투명하고 건강한 건설 현장 구인·구직 문화를 만드는 데 기여하고자 합니다. 
              누구나 안전하고 정당하게 일할 수 있는 환경을 찾을 수 있도록, 사용자 여러분의 목소리에 귀 기울이며 지속적으로 서비스를 개선하고 발전시켜 나가겠습니다.
            </p>
          </section>
          
        </div>
      </main>
    </div>
  );
}
