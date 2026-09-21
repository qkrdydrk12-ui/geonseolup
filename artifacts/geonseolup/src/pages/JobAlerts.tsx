import { useState } from 'react';
import { Link } from 'wouter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { getRegions, getJobs } from '@/lib/jobFilters';

export default function JobAlerts() {
  const [phone, setPhone] = useState('');
  const [region, setRegion] = useState('__ALL__');
  const [jobType, setJobType] = useState('__ALL__');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const regions = getRegions();
  const jobs = getJobs();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) {
      setErrorMsg('__CONSENT_REQUIRED__');
      return;
    }
    setStatus('submitting');
    setErrorMsg('');
    try {
      const res = await fetch('/api/job-alert-subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          region: region === '__ALL__' ? null : region,
          jobType: jobType === '__ALL__' ? null : jobType,
          consent: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.error === 'invalid_phone') setErrorMsg('__INVALID_PHONE__');
        else setErrorMsg('__GENERIC_ERROR__');
        setStatus('error');
        return;
      }
      setStatus('done');
    } catch {
      setErrorMsg('__GENERIC_ERROR__');
      setStatus('error');
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f1f5f9' }}>
      <Header />
      <main className="flex-1 max-w-[520px] mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-bold text-[#1e3a5f] mb-2">무료알림톡 신청</h1>
        <p className="text-sm text-gray-500 mb-6">관심 지역·직종에 맞는 새 구인 정보를 카카오톡으로 무료로 받아보세요.</p>

        {status === 'done' ? (
          <section className="bg-white rounded-[14px] border-[1.5px] border-gray-200 px-4 py-8 text-center">
            <div className="text-3xl mb-3">✅</div>
            <div className="text-base font-bold text-[#1e3a5f] mb-2">신청이 완료됐어요!</div>
            <p className="text-sm text-gray-500">선택하신 조건에 맞는 새 공고가 올라오면 알려드릴게요.</p>
          </section>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-[14px] border-[1.5px] border-gray-200 px-4 py-5 flex flex-col gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">휴대폰 번호</label>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="010-1234-5678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-lg border-[1.5px] border-gray-300 outline-none focus:border-[#f97316]"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">희망 지역</label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-lg border-[1.5px] border-gray-300 outline-none focus:border-[#f97316] bg-white"
              >
                {regions.map((r) => (
                  <option key={r} value={r === '전체' ? '__ALL__' : r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">희망 직종</label>
              <select
                value={jobType}
                onChange={(e) => setJobType(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-lg border-[1.5px] border-gray-300 outline-none focus:border-[#f97316] bg-white"
              >
                {jobs.map((j) => (
                  <option key={j} value={j === '전체' ? '__ALL__' : j}>{j}</option>
                ))}
              </select>
            </div>

            <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-3 text-[11px] leading-relaxed text-gray-500 whitespace-pre-line">
[필수] 개인정보 수집 및 이용 동의

- 수집 항목: 휴대폰 번호, 희망 지역, 희망 직종
- 수집 목적: 신규 구인 공고 카카오톡 알림톡(문자 대체 발송 포함) 안내
- 보유 및 이용 기간: 알림 해지 요청 시까지 보관 후 즉시 파기
- 위 정보는 구인 알림 발송 목적 외에는 사용되지 않으며, 제3자에게 제공되지 않습니다.
- 동의를 거부하실 수 있으며, 거부 시 알림 서비스 신청이 제한됩니다.
- 알림 해지를 원하시면 

              <Link href="/contact" className="text-[#f97316] font-bold no-underline">문의하기</Link>
              를 통해 요청해주세요.
            </div>

            <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5"
              />
              <span>[필수] 위 개인정보 수집·이용에 동의합니다</span>
            </label>

            {errorMsg === '__CONSENT_REQUIRED__' && (
              <p className="text-xs text-red-500 -mt-2">개인정보 수집·이용에 동의해주세요.</p>
            )}
            {errorMsg === '__INVALID_PHONE__' && (
              <p className="text-xs text-red-500 -mt-2">휴대폰 번호 형식을 확인해주세요. (예: 010-1234-5678)</p>
            )}
            {errorMsg === '__GENERIC_ERROR__' && (
              <p className="text-xs text-red-500 -mt-2">신청 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.</p>
            )}

            <button
              type="submit"
              disabled={status === 'submitting'}
              className="w-full py-3 rounded-lg text-sm font-extrabold text-white border-none cursor-pointer transition-all disabled:opacity-60"
              style={{ background: '#f97316' }}
            >
              {status === 'submitting' ? '신청 중...' : '무료로 알림 신청하기'}
            </button>
          </form>
        )}
      </main>
      <Footer />
    </div>
  );
}
