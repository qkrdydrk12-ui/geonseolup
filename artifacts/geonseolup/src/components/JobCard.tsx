import { useState } from 'react';
import { useLocation } from 'wouter';
import type { Job } from '@/lib/firebase';
import {
  formatDate,
  getJobIcon,
  JOB_ICON_BG,
  JOB_BADGE_COLOR,
  isNew,
  isHot,
  getViewed,
  markViewed,
  WELD_SUBS,
} from '@/lib/utils';

interface Props {
  job: Job;
  isDupOld?: boolean;
}

export default function JobCard({ job, isDupOld }: Props) {
  const [, setLocation] = useLocation();
  const [detailOpen, setDetailOpen] = useState(false);
  const viewed = getViewed().has(job.id);
  const _isNew = isNew(job.date);
  const _isHot = isHot(job.date);
  const hasPhone = !!(job.contact && /\d{2,4}-\d{3,4}-\d{4}/.test(job.contact));
  const telHref = hasPhone ? `tel:${job.contact?.replace(/-/g, '')}` : '#';
  const smsHref = hasPhone ? `sms:${job.contact?.replace(/-/g, '')}` : '#';
  const jobBg = JOB_ICON_BG[job.job] || '#f3f4f6';
  const jobBadge = JOB_BADGE_COLOR[job.job] || { bg: '#f3f4f6', text: '#374151' };

  function handleCardClick() {
    markViewed(job.id);
    setLocation(`/detail/${job.id}`);
  }

  function timeColorClass() {
    const diff = (Date.now() - new Date(job.date).getTime()) / 3600000;
    if (diff < 1) return 'text-emerald-600 font-bold';
    if (diff < 12) return 'text-[#f97316] font-bold';
    return '';
  }

  const mealCls =
    job.meal?.includes('제공')
      ? 'text-xs font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-700'
      : 'text-xs font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-700';
  const lodgCls =
    job.lodging?.includes('제공')
      ? 'text-xs font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-700'
      : 'text-xs font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-700';

  return (
    <article
      className={`bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col cursor-pointer transition-all hover:-translate-y-[3px] hover:shadow-md ${
        viewed ? 'bg-[#f8f9fb] border-[#dde1e8] opacity-80 hover:opacity-100' : 'border-gray-200'
      } ${isDupOld ? 'opacity-70 border-dashed bg-gray-50' : ''}`}
      data-id={job.id}
      onClick={handleCardClick}
    >
      {isDupOld && (
        <div className="bg-gray-100 text-gray-500 text-[10px] font-semibold py-1.5 text-center border-b border-dashed border-gray-200 tracking-wide">
          🔁 이전 중복공고
        </div>
      )}

      <div className="px-[13px] pt-[11px] pb-[9px] border-b border-gray-100 flex items-start gap-[9px]">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center text-[17px] shrink-0"
          style={{ background: jobBg }}
        >
          {getJobIcon(job.job)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold leading-snug mb-1 text-gray-900 line-clamp-2">
            {job.title}
          </div>
          <div className="flex flex-wrap gap-[3px]">
            {_isNew && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#f97316] text-white animate-pulse">
                NEW
              </span>
            )}
            {_isHot && !_isNew && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                🔥 오늘
              </span>
            )}
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: jobBadge.bg, color: jobBadge.text }}
            >
              {job.job}
            </span>
            {job.weldTest === '가능' && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-pink-100 text-pink-800">
                시험가능
              </span>
            )}
            {job.weldTest === '불가능' && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">
                시험없음
              </span>
            )}
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">
              📍 {job.region || '지역미상'}
            </span>
          </div>
        </div>
      </div>

      <div className="px-[13px] py-2 flex-1">
        <ul className="list-none">
          <li className="flex items-start gap-1.5 py-[3px] text-xs border-b border-gray-50">
            <span className="w-[15px] text-center shrink-0 mt-0.5">💰</span>
            <span className="text-gray-400 min-w-[56px] shrink-0 text-[11px]">급여</span>
            <span className="flex-1 font-bold text-[#f97316] text-sm">{job.salary || '협의'}</span>
          </li>
          {job.weldSub && WELD_SUBS.includes(job.weldSub) && (
            <li className="flex items-start gap-1.5 py-[3px] text-xs border-b border-gray-50">
              <span className="w-[15px] text-center shrink-0 mt-0.5">⚙️</span>
              <span className="text-gray-400 min-w-[56px] shrink-0 text-[11px]">용접종류</span>
              <span className="flex-1 font-semibold text-gray-800">{job.weldSub}</span>
            </li>
          )}
          <li className="flex items-start gap-1.5 py-[3px] text-xs border-b border-gray-50">
            <span className="w-[15px] text-center shrink-0 mt-0.5">🍚</span>
            <span className="text-gray-400 min-w-[56px] shrink-0 text-[11px]">식사</span>
            <span className="flex-1 font-semibold">
              <span className={mealCls}>{job.meal || '정보없음'}</span>
            </span>
          </li>
          <li className="flex items-start gap-1.5 py-[3px] text-xs border-b border-gray-50">
            <span className="w-[15px] text-center shrink-0 mt-0.5">🏠</span>
            <span className="text-gray-400 min-w-[56px] shrink-0 text-[11px]">숙박</span>
            <span className="flex-1 font-semibold">
              <span className={lodgCls}>{job.lodging || '정보없음'}</span>
            </span>
          </li>
          <li className="flex items-start gap-1.5 py-[3px] text-xs">
            <span className="w-[15px] text-center shrink-0 mt-0.5">📞</span>
            <span className="text-gray-400 min-w-[56px] shrink-0 text-[11px]">연락처</span>
            <span className="flex-1 font-semibold text-gray-800 break-all">
              {job.contact || '문의'}
            </span>
          </li>
          {job.detail && (
            <li className="flex items-start gap-1.5 py-[3px] text-xs border-t border-gray-50">
              <span className="w-[15px] text-center shrink-0 mt-0.5">📝</span>
              <span className="text-gray-400 min-w-[56px] shrink-0 text-[11px]">비고</span>
              <span className="flex-1 font-semibold text-gray-700">{job.detail}</span>
            </li>
          )}
        </ul>
      </div>

      <div className="px-[13px] py-1 bg-[#f8fafc] flex items-center justify-between text-[11px] text-gray-400 border-t border-gray-100">
        <span className={timeColorClass()}>🕐 {formatDate(job.date)}</span>
        <span className="text-[11px] text-gray-400">
          {viewed ? '👁 읽은 공고' : _isNew ? '✨ 최신 등록' : ''}
        </span>
      </div>

      {detailOpen && (
        <div className="px-4 py-3 bg-[#f8fafc] border-t border-dashed border-gray-200" onClick={(e) => e.stopPropagation()}>
          <pre className="text-xs text-gray-500 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto bg-white border border-gray-200 rounded-lg p-2.5">
            {job.originalText || '원문 없음'}
          </pre>
        </div>
      )}

      <div
        className="px-[13px] py-2 border-t border-gray-100 flex items-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-[5px] flex-1 min-w-0">
          {hasPhone ? (
            <>
              <a
                href={telHref}
                className="flex-1 flex items-center justify-center gap-0.5 bg-emerald-500 text-white rounded-lg py-2 text-xs font-bold no-underline hover:bg-emerald-600 transition-colors whitespace-nowrap min-w-0"
              >
                📞 전화
              </a>
              <a
                href={smsHref}
                className="flex-1 flex items-center justify-center gap-0.5 bg-blue-500 text-white rounded-lg py-2 text-xs font-bold no-underline hover:bg-blue-600 transition-colors whitespace-nowrap min-w-0"
              >
                💬 문자
              </a>
            </>
          ) : (
            <span className="flex-1 flex items-center justify-center bg-amber-500 text-white rounded-lg py-2 text-xs font-bold whitespace-nowrap">
              📩 문의
            </span>
          )}
        </div>
        <button
          className="bg-white border-[1.5px] border-gray-200 text-gray-400 py-[7px] px-[9px] rounded-lg text-[11px] font-semibold cursor-pointer hover:border-[#1e3a5f] hover:text-[#1e3a5f] transition-all whitespace-nowrap shrink-0"
          onClick={() => setDetailOpen(!detailOpen)}
        >
          {detailOpen ? '📋 닫기' : '📋 원문'}
        </button>
        <button
          className="bg-[#1e3a5f] text-white border-none py-[7px] px-[9px] rounded-lg text-[11px] font-bold cursor-pointer hover:bg-[#2d5282] transition-colors whitespace-nowrap shrink-0"
          onClick={() => {
            markViewed(job.id);
            setLocation(`/detail/${job.id}`);
          }}
        >
          상세 →
        </button>
      </div>
    </article>
  );
}
