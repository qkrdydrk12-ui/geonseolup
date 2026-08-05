import { useState } from 'react';
import Header from '@/components/Header';

export default function Contact() {
  const [copied, setCopied] = useState(false);
  const email = 'qkrdydrk@naver.com';

  function handleCopy() {
    navigator.clipboard.writeText(email).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f1f5f9' }}>
      <Header />
      <main className="flex-1 max-w-[860px] mx-auto w-full px-4 py-10">
        <h1 className="text-2xl font-bold text-[#1e3a5f] mb-6">건설UP 소개 & 문의하기</h1>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 mb-5 text-sm text-gray-700 leading-relaxed space-y-3">
          <p>
            <b className="text-[#1e3a5f]">건설UP</b>은 전국 건설 현장의 구인·구직 정보를 실시간으로 연결하는 서비스입니다.
            조공·배관·용접·전기·화기감시자 등 다양한 직종의 공고를 지역별·직종별로 빠르게 검색하고,
            숙식 제공 여부·급여 조건까지 한눈에 비교할 수 있도록 만들었습니다.
          </p>
          <p>
            등록되는 공고는 자동 심사 및 신고 접수를 거쳐 관리되며, 등록 2일이 지난 공고는 자동으로 내려가
            항상 최신 정보만 노출되도록 운영하고 있습니다. 처음 건설 현장 일을 시작하는 분들을 위한 실무 가이드({' '}
            <a href="/info" className="text-[#f97316] font-semibold no-underline">정보/꿀팁</a>
            )도 함께 제공합니다.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-6 text-sm text-gray-700">

          <p className="leading-relaxed">
            서비스 이용 중 불편한 점, 허위 공고 신고, 개선 제안 등 모든 문의를 아래 이메일로 보내주세요.<br />
            확인 후 최대한 빠르게 답변 드리겠습니다.
          </p>

          <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
            <span className="text-xl">✉️</span>
            <a
              href={`mailto:${email}`}
              className="font-mono font-semibold text-[#1e3a5f] flex-1 hover:text-[#f97316] transition-colors no-underline"
            >
              {email}
            </a>
            <button
              onClick={handleCopy}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: copied ? '#22c55e' : '#f97316', color: '#fff' }}
            >
              {copied ? '복사됨 ✓' : '복사'}
            </button>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 pt-2">
            {[
              { icon: '🚨', title: '허위 공고 신고', desc: '허위·과장 구인 정보를 발견하셨나요?' },
              { icon: '💡', title: '기능 제안', desc: '더 나은 서비스를 위한 아이디어를 알려주세요.' },
              { icon: '🔒', title: '개인정보 문의', desc: '개인정보 처리 관련 궁금한 점을 문의해주세요.' },
            ].map((item) => (
              <div key={item.title} className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                <div className="text-2xl mb-2">{item.icon}</div>
                <div className="font-semibold text-gray-800 mb-1">{item.title}</div>
                <div className="text-xs text-gray-500 leading-relaxed">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
