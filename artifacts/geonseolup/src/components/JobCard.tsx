import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import type { Job } from '@/lib/firebase';
import { fbAddReport, fbGetJobContact } from '@/lib/firebase';
import { maskPhonesInText } from '@/lib/phone';
import { isMyPost } from '@/lib/myPosts';
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

export default function JobCard({ job, isDupOld, isAdmin = false, onDelete }: Props) {
  const [, setLocation] = useLocation();
  // 실제 번호는 "보기" 버튼을 눌렀을 때만 서버에서 가져온다 (공개 응답에는 마스킹본만 있음)
  const [revealedNum, setRevealedNum] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportNote, setReportNote] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reportDone, setReportDone] = useState(false);

  const [reportsEnabled, setReportsEnabled] = useState(
    () => typeof window === 'undefined' || localStorage.getItem('cj_reports_enabled') !== '0'
  );
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'cj_reports_enabled') {
        setReportsEnabled(e.newValue !== '0');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const viewed = getViewed().has(job.id);
  const _isNew = isNew(job.date);
  const _isHot = isHot(job.date);
  // 서버 응답에는 contact 원본이 없고 hasContact 여부만 온다.
  // (로컬 저장본/Firestore 폴백 등 구형 데이터에는 contact가 남아있을 수 있음)
  // 공개 화면에는 전화번호 숫자를 일부도 표시하지 않는다 — '연락처 보기' 클릭 후에만 노출.
  const hasPhone = job.hasContact ?? (job.contact ? job.contact.replace(/[^0-9]/g, '').length >= 9 : false);
  const revealDigits = revealedNum ? revealedNum.replace(/[^0-9]/g, '') : '';
  const telHref = revealDigits ? `tel:${revealDigits}` : '#';
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
      className={`relative bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col cursor-pointer transition-all hover:-translate-y-[3px] hover:shadow-md ${
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

      {/* 신고 버튼 — 카드 오른쪽 위 구석에 작게 (하단 버튼 줄 혼잡 해소) */}
      {reportsEnabled && (
        <button
          type="button"
          className="absolute top-1.5 right-1.5 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-white/90 border border-gray-200 text-[13px] cursor-pointer opacity-60 hover:opacity-100 hover:border-red-400 transition-all shrink-0"
          onClick={(e) => { e.stopPropagation(); setReportOpen(true); setReportDone(false); setReportReason(''); setReportNote(''); }}
          title="이 공고 신고"
          aria-label="이 공고 신고"
        >
          🚨
        </button>
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
            {!hasPhone ? (
              <span className="font-semibold text-red-400">번호없음</span>
            ) : revealedNum ? (
              <a
                href={telHref}
                className="font-bold text-[#1e3a5f] no-underline hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {revealedNum}
              </a>
            ) : null}
            {hasPhone && !revealedNum && (
              <>
                {blocked ? (
                  <span className="text-[10px] text-red-500 font-semibold">일일 한도 초과</span>
                ) : (
                  <button
                    disabled={revealing}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (isContactBlocked()) {
                        setBlocked(true);
                        return;
                      }
                      setRevealing(true);
                      // 실번호는 오직 서버에서만 가져온다 (서버 측 조회 한도 적용).
                      // 서버 실패 시에도 로컬 데이터의 번호는 절대 사용하지 않는다.
                      const r = await fbGetJobContact(job.id);
                      const num: string | null = r.contact;
                      if (!num) {
                        if (r.reason === 'limit') setBlocked(true);
                        setRevealing(false);
                        return;
                      }
                      recordContactReveal();
                      setRevealedNum(num);
                      setRevealing(false);
                    }}
                    style={{
                      backgroundImage: "linear-gradient(#f97316, #f97316)",
                      color: "#ffffff",
                      WebkitTextFillColor: "#ffffff",
                    }}
                    className="shrink-0 text-[10px] px-2 py-[3px] rounded-full font-bold cursor-pointer border-none hover:opacity-90 transition-opacity whitespace-nowrap [forced-color-adjust:none]"
                  >
                    {revealing ? '확인 중…' : <>👁 보기 ({getTodayContactCount()}/{getContactDailyLimit()})</>}
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
            <span className="flex-1 font-semibold text-gray-700">{maskPhonesInText(job.detail)}</span>
          </li>
        )}
      </ul>

      <div className="px-[13px] py-1 bg-[#f8fafc] flex items-center justify-between text-[11px] text-gray-400 border-t border-gray-100">
        <span className={timeColorClass()}>🕐 {formatDate(job.date)}</span>
        <span className="text-[11px] text-gray-400">
          {viewed ? '👁 읽은 공고' : _isNew ? '✨ 최신 등록' : ''}
        </span>
      </div>

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
          {hasPhone && revealedNum && (
            <>
              <a
                href={telHref}
                className="flex-1 flex items-center justify-center gap-0.5 bg-emerald-500 text-white rounded-lg py-2 text-xs font-bold no-underline hover:bg-emerald-600 transition-colors whitespace-nowrap min-w-0"
              >
                📞 전화
              </a>
              <a
                href={revealDigits ? `sms:${revealDigits}` : '#'}
                className="flex-1 flex items-center justify-center gap-0.5 bg-blue-500 text-white rounded-lg py-2 text-xs font-bold no-underline hover:bg-blue-600 transition-colors whitespace-nowrap min-w-0"
              >
                💬 문자
              </a>
            </>
          )}
        </div>
        {/* 이 브라우저에서 올린 글이면 글쓴이에게만 수정 버튼 노출 */}
        {isMyPost(job.id) && (
          <button
            className="bg-white border-[1.5px] border-[#f97316] text-[#f97316] py-[7px] px-[9px] rounded-lg text-[11px] font-bold cursor-pointer hover:bg-orange-50 transition-colors whitespace-nowrap shrink-0"
            onClick={() => setLocation(`/post?edit=${job.id}`)}
            title="내가 올린 공고 수정"
          >
            ✏️ 수정
          </button>
        )}
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

      {/* 신고 모달 — body에 portal 렌더링 (부모 transform 회피) */}
      {reportOpen && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => { e.stopPropagation(); setReportOpen(false); }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-[420px] p-5 shadow-2xl my-auto max-h-[calc(100vh-2rem)] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {reportDone ? (
              <>
                <div className="text-center py-4">
                  <div className="text-4xl mb-2">✅</div>
                  <h3 className="text-base font-bold text-[#1e3a5f] mb-1">신고가 접수되었습니다</h3>
                  <p className="text-xs text-gray-500">관리자가 확인 후 조치하겠습니다. 감사합니다.</p>
                </div>
                <button
                  className="w-full bg-[#1e3a5f] text-white border-none py-2.5 rounded-lg text-sm font-bold cursor-pointer hover:bg-[#2d5282] font-[inherit]"
                  onClick={() => setReportOpen(false)}
                >
                  닫기
                </button>
              </>
            ) : (
              <>
                <h3 className="text-base font-bold text-[#1e3a5f] mb-1 flex items-center gap-1.5">
                  🚩 공고 신고하기
                </h3>
                <p className="text-[11px] text-gray-500 mb-3 line-clamp-1">{job.title}</p>
                <div className="space-y-1.5 mb-3">
                  {[
                    '연락이 안 됨',
                    '이미 마감된 공고',
                    '잘못된 전화번호',
                    '허위/과장 정보',
                    '기타',
                  ].map((r) => (
                    <label
                      key={r}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-[13px] font-medium transition-colors ${
                        reportReason === r
                          ? 'bg-red-50 border-red-300 text-red-700'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="reportReason"
                        value={r}
                        checked={reportReason === r}
                        onChange={() => setReportReason(r)}
                        className="accent-red-500"
                      />
                      {r}
                    </label>
                  ))}
                </div>
                <textarea
                  className="w-full border border-gray-200 rounded-lg p-2 text-[13px] resize-none focus:outline-none focus:border-[#1e3a5f] font-[inherit]"
                  rows={2}
                  placeholder="추가 내용 (선택)"
                  value={reportNote}
                  onChange={(e) => setReportNote(e.target.value)}
                  maxLength={300}
                />
                <div className="flex gap-2 mt-3">
                  <button
                    className="flex-1 bg-white border border-gray-300 text-gray-600 py-2.5 rounded-lg text-sm font-semibold cursor-pointer hover:bg-gray-50 font-[inherit]"
                    onClick={() => setReportOpen(false)}
                  >
                    취소
                  </button>
                  <button
                    disabled={!reportReason || reporting}
                    className="flex-1 bg-red-500 text-white border-none py-2.5 rounded-lg text-sm font-bold cursor-pointer hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed font-[inherit]"
                    onClick={async () => {
                      if (!reportReason || reporting) return;
                      setReporting(true);
                      try {
                        await fbAddReport({
                          jobId: job.id,
                          jobTitle: job.title || '',
                          jobContact: job.contact || '',
                          reason: reportReason,
                          note: reportNote.trim(),
                          createdAt: new Date().toISOString(),
                        });
                        setReportDone(true);
                      } catch {
                        alert('신고 접수에 실패했습니다. 잠시 후 다시 시도해주세요.');
                      } finally {
                        setReporting(false);
                      }
                    }}
                  >
                    {reporting ? '접수 중…' : '신고하기'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </article>
  );
}
