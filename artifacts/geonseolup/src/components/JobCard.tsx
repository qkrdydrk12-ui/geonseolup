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
  isContactBlocked,
  recordContactReveal,
  getTodayContactCount,
  getContactDailyLimit,
} from '@/lib/utils';

interface Props {
  job: Job;
  isDupOld?: boolean;
  isAdmin?: boolean;
  onDelete?: (id: string, title: string) => void;
}

function maskContact(contact: string): string {
  const d = contact.replace(/[^0-9]/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}-****-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-***-${d.slice(6)}`;
  if (d.length >= 7) return `${d.slice(0, 3)}-****`;
  return contact ? contact.slice(0, 3) + '****' : '번호없음';
}

export default function JobCard({ job, isDupOld, isAdmin = false, onDelete }: Props) {
  const [, setLocation] = useLocation();
  const [detailOpen, setDetailOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const viewed = getViewed().has(job.id);
  const _isNew = isNew(job.date);
  const _isHot = isHot(job.date);
  const rawDigits = job.contact ? job.contact.replace(/[^0-9]/g, '') : '';
  const hasPhone = rawDigits.length >= 9;
  const telHref = hasPhone ? `tel:${rawDigits}` : '#';
  const smsHref = hasPhone ? `sms:${rawDigits}` : '#';
  const jobBg = JOB_ICON_BG[job.job] || '#f3f4f6';
  const jobBadge = JOB_BADGE_COLOR[job.job] || { bg: '#f3f4f6', text: '#374151' };

  function handleCardClick() {
    if (confirmDelete) return;
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

  async function handleConfirmDelete() {
    if (!onDelete || deleting) return;
    setDeleting(true);
    onDelete(job.id, job.title || '');
    setConfirmDelete(false);
    setDeleting(false);
  }

  return (
    <article
      className={`bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col cursor-pointer transition-all hover:-translate-y-[3px] hover:shadow-md ${
        viewed ? 'bg-[#f8f9fb] border-[#dde1e8] opacity-80 hover:opacity-100' : 'border-gray-200'
      } ${isDupOld ? 'opacity-70 border-dashed bg-gray-50' : ''} ${
        isAdmin && !hasPhone ? 'ring-2 ring-red-300 ring-offset-1' : ''
      }`}
      data-id={job.id}
      onClick={handleCardClick}
    >
      {isDupOld && (
        <div className="bg-gray-100 text-gray-500 text-[10px] font-semibold py-1.5 text-center border-b border-dashed border-gray-200 tracking-wide">
          🔁 이전 중복공고
        </div>
      )}

      {/* 관리자 전용: 번호없음 경고 배지 */}
      {isAdmin && !hasPhone && (
        <div className="bg-red-500 text-white text-[10px] font-bold py-1 text-center tracking-wide">
          ⚠️ 번호없음 — 관리자 전용 경고
        </div>
      )}

      <div className="p-[13px] flex gap-[10px] flex-1">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 mt-0.5"
          style={{ background: jobBg }}
        >
          {getJobIcon(job.job)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-1.5 flex-wrap mb-1">
            {_isNew && (
              <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-[#f97316] text-white tracking-wide shrink-0">
                NEW
              </span>
            )}
            {_isHot && !_isNew && (
              <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-red-500 text-white tracking-wide shrink-0">
                🔥 HOT
              </span>
            )}
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
              style={{ background: jobBadge.bg, color: jobBadge.text }}
            >
              {job.job}
            </span>
            {job.job === '용접' && job.weldSub && WELD_SUBS.includes(job.weldSub) && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 shrink-0">
                {job.weldSub}
              </span>
            )}
            <h2 className="text-[14px] font-bold text-gray-900 leading-snug min-w-0 break-words">
              {job.title}
            </h2>
          </div>
          <div className="text-[12px] text-gray-500 flex items-center gap-1 flex-wrap">
            <span>📍 {job.region}</span>
            {job.salary && <><span className="text-gray-300">|</span><span className="font-semibold text-[#1e3a5f]">💰 {job.salary}</span></>}
          </div>
        </div>
      </div>

      <ul className="px-[13px] pb-[10px] flex flex-col gap-0">
        {(job.meal || job.lodging) && (
          <li className="flex items-center gap-1.5 py-[3px] text-xs border-t border-gray-50">
            <span className="w-[15px] text-center shrink-0">🍱</span>
            <span className="text-gray-400 min-w-[56px] shrink-0 text-[11px]">식사/숙박</span>
            <span className="flex items-center gap-1 flex-wrap">
              {job.meal && <span className={mealCls}>{job.meal}</span>}
              {job.lodging && <span className={lodgCls}>{job.lodging}</span>}
            </span>
          </li>
        )}
        <li className="flex items-center gap-1.5 py-[3px] text-xs border-t border-gray-50">
          <span className="w-[15px] text-center shrink-0">📞</span>
          <span className="text-gray-400 min-w-[56px] shrink-0 text-[11px]">연락처</span>
          <span className="flex items-center gap-1.5 flex-wrap">
            {!job.contact ? (
              <span className="font-semibold text-red-400">번호없음</span>
            ) : revealed ? (
              <a
                href={telHref}
                className="font-bold text-[#1e3a5f] no-underline hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {job.contact}
              </a>
            ) : (
              <span className="font-semibold text-gray-600">{maskContact(job.contact)}</span>
            )}
            {job.contact && !revealed && (
              <>
                {blocked ? (
                  <span className="text-[10px] text-red-500 font-semibold">일일 한도 초과</span>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isContactBlocked()) {
                        setBlocked(true);
                        return;
                      }
                      recordContactReveal();
                      setRevealed(true);
                    }}
                    className="shrink-0 text-[10px] bg-[#f97316] text-white px-2 py-[3px] rounded-full font-bold cursor-pointer border-none hover:bg-[#ea580c] transition-colors whitespace-nowrap"
                  >
                    👁 보기 ({getTodayContactCount()}/{getContactDailyLimit()})
                  </button>
                )}
              </>
            )}
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

      {/* 삭제 확인 UI */}
      {confirmDelete && (
        <div
          className="px-[13px] py-2.5 bg-red-50 border-t border-red-200 flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-[12px] text-red-700 font-semibold flex-1">
            이 공고를 삭제하시겠습니까?
          </span>
          <button
            type="button"
            className="text-[11px] bg-white border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg font-semibold cursor-pointer hover:bg-gray-50 font-[inherit] whitespace-nowrap"
            onClick={() => setConfirmDelete(false)}
          >
            취소
          </button>
          <button
            type="button"
            disabled={deleting}
            className="text-[11px] bg-red-500 text-white border-none px-3 py-1.5 rounded-lg font-bold cursor-pointer hover:bg-red-600 font-[inherit] whitespace-nowrap disabled:opacity-50"
            onClick={handleConfirmDelete}
          >
            {deleting ? '삭제 중…' : '삭제 확인'}
          </button>
        </div>
      )}

      {/* 하단 액션 버튼 */}
      <div
        className="px-[13px] py-2 border-t border-gray-100 flex items-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-[5px] flex-1 min-w-0">
          {hasPhone && revealed && (
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
        {/* 관리자 전용 삭제 버튼 */}
        {isAdmin && onDelete && (
          <button
            type="button"
            className={`py-[7px] px-[9px] rounded-lg text-[11px] font-bold cursor-pointer border-none transition-colors whitespace-nowrap shrink-0 ${
              confirmDelete
                ? 'bg-red-100 text-red-500'
                : 'bg-red-500 text-white hover:bg-red-600'
            }`}
            onClick={() => setConfirmDelete(!confirmDelete)}
            title="공고 삭제"
          >
            🗑 삭제
          </button>
        )}
      </div>
    </article>
  );
}
