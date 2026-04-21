import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import type { Job } from '@/lib/firebase';
import { fbGetJob, fbLoadJobs } from '@/lib/firebase';
import { SAMPLE_JOBS } from '@/data/sampleJobs';
import { formatDate, getJobIcon, JOB_ICON_BG, JOB_BADGE_COLOR, isNew, markViewed } from '@/lib/utils';

interface Props {
  id: string;
}

export default function Detail({ id }: Props) {
  const [, setLocation] = useLocation();
  const [job, setJob] = useState<Job | null>(null);
  const [related, setRelated] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const sampleFound = SAMPLE_JOBS.find((j) => j.id === id) || null;
      if (sampleFound) {
        setJob(sampleFound);
        markViewed(id);
        const rels = SAMPLE_JOBS.filter((j) => j.id !== id && !j.hidden && j.job === sampleFound.job).slice(0, 10);
        setRelated(rels);
        setLoading(false);
        fbGetJob(id).then((found) => {
          if (found) { setJob(found); }
        });
        fbLoadJobs().then((allJobs) => {
          if (allJobs.length > 0) {
            const job = allJobs.find((j) => j.id === id);
            if (job) setJob(job);
            const rels2 = allJobs.filter((j) => j.id !== id && !j.hidden && j.job === (job?.job || sampleFound.job)).slice(0, 10);
            if (rels2.length > 0) setRelated(rels2);
          }
        });
        return;
      }
      let found = await fbGetJob(id);
      if (!found) {
        found = null;
      }
      setJob(found);
      markViewed(id);
      const allJobs = await fbLoadJobs();
      const pool = allJobs.length > 0 ? allJobs : SAMPLE_JOBS;
      const rels = pool.filter((j) => j.id !== id && !j.hidden && j.job === (found?.job || '')).slice(0, 10);
      setRelated(rels);
      setLoading(false);
    }
    load();
  }, [id]);

  async function doShare() {
    const url = location.href;
    const title = job ? `${job.title} - 건설UP` : '건설UP';
    const desc = job ? `${job.job} / ${job.region} / ${job.salary}` : '';
    if (navigator.share) {
      try {
        await navigator.share({ title, text: desc, url });
        return;
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return;
      }
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url).catch(() => {});
    }
    alert('링크가 복사됐습니다!');
  }

  async function doCopyLink() {
    const url = location.href;
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url).catch(() => {});
    }
    alert('링크가 복사됐습니다!');
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f1f5f9' }}>
        <div className="text-center text-gray-400">
          <div className="text-4xl mb-3 animate-spin">⚙️</div>
          <div className="text-sm">불러오는 중...</div>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f1f5f9' }}>
        <div className="text-center text-gray-400">
          <div className="text-5xl mb-3">😔</div>
          <div className="text-lg font-bold text-gray-700 mb-1">공고를 찾을 수 없습니다</div>
          <button
            className="mt-4 bg-[#f97316] text-white border-none px-6 py-2.5 rounded-lg text-sm font-bold cursor-pointer"
            onClick={() => setLocation('/')}
          >
            ← 목록으로
          </button>
        </div>
      </div>
    );
  }

  const jobBg = JOB_ICON_BG[job.job] || '#f3f4f6';
  const jobBadge = JOB_BADGE_COLOR[job.job] || { bg: '#f3f4f6', text: '#374151' };
  const hasPhone = !!(job.contact && /\d{2,4}-\d{3,4}-\d{4}/.test(job.contact));
  const telHref = hasPhone ? `tel:${job.contact?.replace(/-/g, '')}` : '#';
  const smsHref = hasPhone ? `sms:${job.contact?.replace(/-/g, '')}` : '#';
  const _isNew = isNew(job.date);

  const mealCls =
    job.meal?.includes('제공')
      ? 'text-xs font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-700'
      : 'text-xs font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-700';
  const lodgCls =
    job.lodging?.includes('제공')
      ? 'text-xs font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-700'
      : 'text-xs font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-700';

  return (
    <div className="min-h-screen pb-24" style={{ background: '#f1f5f9' }}>
      <div className="max-w-[860px] mx-auto px-4 pt-5">

        {/* 공유 버튼 */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            className="flex items-center gap-[5px] px-3.5 py-2 rounded-lg text-sm font-bold cursor-pointer border-[1.5px] border-gray-200 bg-gray-50 text-[#1e3a5f] hover:bg-[#1e3a5f] hover:text-white transition-all font-[inherit]"
            onClick={doCopyLink}
          >
            🔗 링크 복사
          </button>
          <button
            className="flex items-center gap-[5px] px-3.5 py-2 rounded-lg text-sm font-bold cursor-pointer border-none font-[inherit] hover:opacity-90 transition-opacity"
            style={{ background: '#fee500', color: '#3c1e1e' }}
            onClick={doShare}
          >
            💛 카카오 공유
          </button>
        </div>

        {/* 상세 카드 */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mb-5">
          {/* hero */}
          <div className="px-[22px] py-[22px] border-b-2 border-gray-100" style={{ background: 'linear-gradient(135deg,#f8faff,#fff)' }}>
            <div className="flex items-start gap-[14px] mb-[14px]">
              <div
                className="w-[58px] h-[58px] rounded-[14px] flex items-center justify-center text-[28px] shrink-0"
                style={{ background: jobBg }}
              >
                {getJobIcon(job.job)}
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-extrabold leading-snug mb-2 text-gray-900">{job.title}</h1>
                <div className="flex flex-wrap gap-[5px]">
                  {_isNew && (
                    <span className="text-xs font-bold px-[9px] py-1 rounded-[7px] bg-[#f97316] text-white">NEW</span>
                  )}
                  <span
                    className="text-xs font-bold px-[9px] py-1 rounded-[7px]"
                    style={{ background: jobBadge.bg, color: jobBadge.text }}
                  >
                    {job.job}
                  </span>
                  {job.weldTest && (
                    <span className={`text-xs font-bold px-[9px] py-1 rounded-[7px] ${job.weldTest === '가능' ? 'bg-pink-100 text-pink-800' : 'bg-purple-100 text-purple-800'}`}>
                      시험{job.weldTest}
                    </span>
                  )}
                  <span className="text-xs font-bold px-[9px] py-1 rounded-[7px] bg-sky-50 text-sky-700">
                    📍 {job.region || '지역미상'}
                  </span>
                </div>
              </div>
            </div>

            {/* 급여 하이라이트 */}
            <div className="flex items-center gap-2.5 rounded-[10px] px-[18px] py-[14px] border-2 border-[#fb923c]" style={{ background: 'linear-gradient(135deg,#fff7ed,#fed7aa)' }}>
              <span className="text-2xl">💰</span>
              <span className="text-[13px] text-orange-900 font-semibold">일급</span>
              <span className="text-[26px] font-black text-[#f97316]">{job.salary || '협의'}</span>
            </div>
          </div>

          {/* 정보 그리드 */}
          <div className="px-[22px] py-5 border-b border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
              {[
                job.site       ? { ico: '🏭', key: '현장명',   val: job.site + (job.line ? ` ${job.line}` : '') } : null,
                job.company    ? { ico: '🏢', key: '회사명',   val: job.company } : null,
                job.headcount  ? { ico: '👥', key: '모집인원', val: job.headcount } : null,
                job.workType   ? { ico: '🚗', key: '근무형태', val: job.workType } : null,
                job.ageLimit   ? { ico: '🎂', key: '나이제한', val: job.ageLimit } : null,
                job.startDate  ? { ico: '📅', key: '투입시기', val: job.startDate } : null,
                job.manager    ? { ico: '👤', key: '담당자',   val: job.manager } : null,
                { ico: '🍚', key: '식사', val: <span className={mealCls}>{job.meal || '정보없음'}</span> },
                { ico: '🏠', key: '숙박', val: <span className={lodgCls}>{job.lodging || '정보없음'}</span> },
                job.weldSub ? { ico: '⚙️', key: '용접종류', val: job.weldSub } : null,
                job.weldTest ? { ico: '🧪', key: '시험여부', val: job.weldTest } : null,
                { ico: '📞', key: '연락처', val: job.contact || '문의' },
                { ico: '🕐', key: '등록일', val: formatDate(job.date) },
                job.detail ? { ico: '📝', key: '비고', val: job.detail, full: true } : null,
              ]
                .filter(Boolean)
                .map((row, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2.5 py-[11px] border-b border-gray-100 text-sm last:border-b-0 ${row!.full ? 'col-span-2' : ''}`}
                  >
                    <span className="text-base shrink-0 mt-0.5">{row!.ico}</span>
                    <span className="text-gray-500 text-[13px] min-w-[70px] shrink-0">{row!.key}</span>
                    <span className="flex-1 font-semibold text-gray-800">{row!.val}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* 원문 */}
          {job.originalText && (
            <div className="px-[22px] py-5">
              <div className="text-[13px] font-bold text-gray-500 mb-2.5">📄 원문 내용</div>
              <pre className="bg-[#f8fafc] border border-gray-200 rounded-lg p-[14px] text-[13px] text-gray-500 whitespace-pre-wrap leading-7 max-h-56 overflow-y-auto">
                {job.originalText}
              </pre>
            </div>
          )}
        </div>

        {/* 비슷한 일자리 */}
        {related.length > 0 && (
          <section className="mb-5">
            <h2 className="text-[15px] font-extrabold text-[#1e3a5f] mb-3 pb-[7px] border-b-2 border-gray-200 flex items-center gap-1.5">
              🔍 비슷한 일자리
              <span className="ml-auto text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                {related.length}
              </span>
            </h2>
            <div className="flex gap-2.5 overflow-x-auto pb-1.5" style={{ scrollbarWidth: 'none' }}>
              {related.map((rel) => {
                const relBg = JOB_ICON_BG[rel.job] || '#f3f4f6';
                return (
                  <a
                    key={rel.id}
                    href={`/detail/${rel.id}`}
                    className="shrink-0 w-[200px] bg-white rounded-[10px] border-[1.5px] border-gray-200 shadow-sm p-[13px] cursor-pointer hover:shadow-md hover:border-[#f97316] hover:-translate-y-0.5 transition-all no-underline text-gray-800 block"
                    onClick={(e) => { e.preventDefault(); setLocation(`/detail/${rel.id}`); }}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-8 h-8 rounded-[7px] flex items-center justify-center text-[15px]" style={{ background: relBg }}>
                        {getJobIcon(rel.job)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold leading-snug line-clamp-2">{rel.title}</div>
                      </div>
                    </div>
                    <span className="block text-[#f97316] text-[13px] font-extrabold mb-0.5">{rel.salary || '협의'}</span>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[10px] text-gray-500">📍 {rel.region}</span>
                      <span className="text-[10px] text-gray-400">{formatDate(rel.date)}</span>
                    </div>
                    {isNew(rel.date) && (
                      <span className="text-[9px] font-bold bg-[#f97316] text-white px-[5px] py-0.5 rounded block mt-1.5 text-center">NEW</span>
                    )}
                  </a>
                );
              })}
            </div>
          </section>
        )}

        {/* 더 많은 공고 배너 */}
        <a
          href="/"
          className="flex items-center justify-between gap-3 rounded-xl px-5 py-[18px] mb-5 no-underline text-white hover:opacity-95 transition-opacity"
          style={{ background: 'linear-gradient(135deg,#1e3a5f,#2d5282)' }}
          onClick={(e) => { e.preventDefault(); setLocation('/'); }}
        >
          <div>
            <div className="text-sm font-bold leading-snug">더 많은 건설 현장 일자리</div>
            <span className="text-xs opacity-80 block mt-0.5">전국 구인 공고 전체 보기</span>
          </div>
          <div className="flex items-center gap-1 text-[13px] font-bold whitespace-nowrap bg-white/20 px-3 py-1.5 rounded-lg">
            목록으로 →
          </div>
        </a>
      </div>

      {/* 하단 고정 CTA */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t-2 border-gray-200 shadow-[-4px_0_16px_rgba(0,0,0,0.08)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-[860px] mx-auto grid grid-cols-2 gap-2.5 px-4 py-3">
          {hasPhone ? (
            <>
              <a
                href={telHref}
                className="flex items-center justify-center gap-1.5 bg-emerald-500 text-white rounded-xl py-[15px] text-base font-bold no-underline hover:bg-emerald-600 transition-colors"
              >
                📞 전화 연결
              </a>
              <a
                href={smsHref}
                className="flex items-center justify-center gap-1.5 bg-blue-500 text-white rounded-xl py-[15px] text-base font-bold no-underline hover:bg-blue-600 transition-colors"
              >
                💬 문자 보내기
              </a>
            </>
          ) : (
            <div className="col-span-2 flex items-center justify-center gap-1.5 bg-amber-500 text-white rounded-xl py-[15px] text-base font-bold">
              📩 문의 필요 — 관리자에 연락하세요
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
