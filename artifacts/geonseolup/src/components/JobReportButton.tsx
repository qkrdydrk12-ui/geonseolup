import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Job } from '@/lib/firebase';
import { fbAddReport } from '@/lib/firebase';

interface Props {
  job: Job;
  children?: ReactNode;
  className?: string;
  title?: string;
}

export default function JobReportButton({
  job,
  children = '🚩 이 공고 신고',
  className = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors',
  title = '이 공고 신고',
}: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [enabled, setEnabled] = useState(
    () => typeof window === 'undefined' || localStorage.getItem('cj_reports_enabled') !== '0'
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'cj_reports_enabled') setEnabled(event.newValue !== '0');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    const focusableSelector = [
      'button:not([disabled])',
      'input:not([disabled])',
      'textarea:not([disabled])',
      '[href]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    const focusable = () => Array.from(
      dialog?.querySelectorAll<HTMLElement>(focusableSelector) || []
    ).filter((element) => !element.hasAttribute('disabled'));

    requestAnimationFrame(() => {
      (focusable()[0] || dialog)?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      if (elements.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (open && done) {
      requestAnimationFrame(() => {
        dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
      });
    }
  }, [open, done]);

  if (!enabled) return null;

  function showDialog(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setReason('');
    setNote('');
    setDone(false);
    setOpen(true);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className}
        title={title}
        aria-label={title}
        onClick={showDialog}
      >
        {children}
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
          role="presentation"
          onClick={(event) => { event.stopPropagation(); setOpen(false); }}
        >
          <div
            ref={dialogRef}
            className="bg-white rounded-2xl w-full max-w-[420px] p-5 shadow-2xl my-auto max-h-[calc(100vh-2rem)] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`report-title-${job.id}`}
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            {done ? (
              <>
                <div className="text-center py-4">
                  <div className="text-4xl mb-2" aria-hidden="true">✅</div>
                  <h2 id={`report-title-${job.id}`} className="text-base font-bold text-[#1e3a5f] mb-1">
                    신고가 접수되었습니다
                  </h2>
                  <p className="text-xs text-gray-500">관리자가 확인 후 조치하겠습니다. 감사합니다.</p>
                </div>
                <button
                  type="button"
                  className="w-full min-h-11 bg-[#1e3a5f] text-white border-none py-2.5 rounded-lg text-sm font-bold cursor-pointer hover:bg-[#2d5282] font-[inherit]"
                  onClick={() => setOpen(false)}
                >
                  닫기
                </button>
              </>
            ) : (
              <>
                <h2 id={`report-title-${job.id}`} className="text-base font-bold text-[#1e3a5f] mb-1 flex items-center gap-1.5">
                  🚩 공고 신고하기
                </h2>
                <p className="text-[11px] text-gray-500 mb-3 line-clamp-1">{job.title}</p>
                <div className="space-y-1.5 mb-3">
                  {[
                    '연락이 안 됨',
                    '이미 마감된 공고',
                    '잘못된 전화번호',
                    '허위/과장 정보',
                    '기타',
                  ].map((item) => (
                    <label
                      key={item}
                      className={`flex min-h-11 items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-[13px] font-medium transition-colors ${
                        reason === item
                          ? 'bg-red-50 border-red-300 text-red-700'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`reportReason-${job.id}`}
                        value={item}
                        checked={reason === item}
                        onChange={() => setReason(item)}
                        className="accent-red-500"
                      />
                      {item}
                    </label>
                  ))}
                </div>
                <textarea
                  className="w-full border border-gray-200 rounded-lg p-2 text-[13px] resize-none focus:outline-none focus:border-[#1e3a5f] font-[inherit]"
                  rows={3}
                  placeholder="추가 내용 (선택)"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={300}
                />
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    className="flex-1 min-h-11 bg-white border border-gray-300 text-gray-600 py-2.5 rounded-lg text-sm font-semibold cursor-pointer hover:bg-gray-50 font-[inherit]"
                    onClick={() => setOpen(false)}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    disabled={!reason || submitting}
                    className="flex-1 min-h-11 bg-red-500 text-white border-none py-2.5 rounded-lg text-sm font-bold cursor-pointer hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed font-[inherit]"
                    onClick={async () => {
                      if (!reason || submitting) return;
                      setSubmitting(true);
                      try {
                        await fbAddReport({
                          jobId: job.id,
                          jobTitle: job.title || '',
                          jobContact: job.contact || '',
                          reason,
                          note: note.trim(),
                          createdAt: new Date().toISOString(),
                        });
                        setDone(true);
                      } catch {
                        alert('신고 접수에 실패했습니다. 잠시 후 다시 시도해주세요.');
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                  >
                    {submitting ? '접수 중…' : '신고하기'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}