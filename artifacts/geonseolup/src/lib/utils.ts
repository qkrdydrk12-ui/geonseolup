import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return '방금 전';
  if (diff < 60) return diff + '분 전';
  if (diff < 1440) return Math.floor(diff / 60) + '시간 전';
  if (diff < 10080) return Math.floor(diff / 1440) + '일 전';
  return new Date(iso).toLocaleDateString('ko-KR');
}

export function timeClass(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (diff < 1) return 'time-fresh';
  if (diff < 12) return 'time-recent';
  return '';
}

export function parseSalaryNum(text: string): number {
  if (!text) return 0;
  // 월급/월 표기 (예: "월 3,660,000", "월급 3,660,000원")
  const mMonth = text.match(/월\s*급?\s*([\d,]+)/);
  if (mMonth) {
    const n = parseInt(mMonth[1].replace(/,/g, ''));
    if (n >= 1_000_000) return n;
  }
  // N만M천 (예: 18만5천, 18만 5천)
  const mMC = text.match(/(\d+)\s*만\s*(\d+)\s*천/);
  if (mMC) return parseInt(mMC[1]) * 10000 + parseInt(mMC[2]) * 1000;
  // N.M만 소수점 (예: 16.5만)
  const mDec = text.match(/([\d.]+)\s*만/);
  if (mDec) return Math.round(parseFloat(mDec[1]) * 10000);
  // 원 단위 숫자 (예: 185,000원)
  const mWon = text.match(/(\d[\d,]+)\s*원/);
  if (mWon) return parseInt(mWon[1].replace(/,/g, ''));
  // 순수 숫자 (예: 185000)
  const mRaw = text.match(/^(\d{5,7})$/);
  if (mRaw) return parseInt(mRaw[1]);
  return 0;
}

export const JOB_ICONS: Record<string, string> = {
  전체: '🏗️',
  조공: '🔨',
  배관: '🔧',
  용접: '🔩',
  TIG: '🔩',
  아크: '🔩',
  CO2: '🔩',
  PVC: '🔩',
  자동: '🤖',
  형틀: '📐',
  철근: '⛓️',
  미장: '🪣',
  도장: '🖌️',
  토공: '⛏️',
  전기: '💡',
  설비: '🛠️',
  화기감시자: '🧯',
  유도원: '🚦',
  양중: '🏗️',
  덕트: '💨',
  비계: '🪜',
  안전담당자: '🦺',
  안전시설반: '🚧',
  품질담당자: '📋',
  공사담당자: '🏢',
  기타: '📌',
};

export const WELD_SUBS = ['TIG', '아크', 'CO2', 'PVC', '자동'];

export function isWeld(job: string): boolean {
  return job === '용접' || WELD_SUBS.includes(job);
}

export function getJobIcon(job: string): string {
  return JOB_ICONS[job] || '📋';
}

export const JOB_ICON_BG: Record<string, string> = {
  배관: '#dbeafe',
  조공: '#dcfce7',
  용접: '#fce7f3',
  TIG: '#ede9fe',
  아크: '#fef3c7',
  CO2: '#fee2e2',
  PVC: '#ecfdf5',
  자동: '#dbeafe',
  형틀: '#fff7ed',
  철근: '#f1f5f9',
  미장: '#fdf4ff',
  도장: '#fffbeb',
  토공: '#f0fdf4',
  전기: '#fef9c3',
  설비: '#e0f2fe',
  화기감시자: '#fee2e2',
  유도원: '#fef3c7',
  양중: '#e0e7ff',
  덕트: '#f0fdf4',
  비계: '#f0f9ff',
  안전담당자: '#ecfdf5',
  안전시설반: '#fef9c3',
  품질담당자: '#eff6ff',
  공사담당자: '#f5f3ff',
  기타: '#f3f4f6',
};

export const JOB_BADGE_COLOR: Record<string, { bg: string; text: string }> = {
  배관: { bg: '#dbeafe', text: '#1d4ed8' },
  조공: { bg: '#dcfce7', text: '#166534' },
  용접: { bg: '#fce7f3', text: '#9d174d' },
  TIG: { bg: '#ede9fe', text: '#6d28d9' },
  아크: { bg: '#fef3c7', text: '#92400e' },
  CO2: { bg: '#fee2e2', text: '#991b1b' },
  PVC: { bg: '#d1fae5', text: '#065f46' },
  자동: { bg: '#dbeafe', text: '#1e40af' },
  형틀: { bg: '#fff7ed', text: '#9a3412' },
  철근: { bg: '#f1f5f9', text: '#334155' },
  미장: { bg: '#fdf4ff', text: '#7e22ce' },
  도장: { bg: '#fffbeb', text: '#78350f' },
  토공: { bg: '#f0fdf4', text: '#14532d' },
  전기: { bg: '#fef9c3', text: '#713f12' },
  설비: { bg: '#e0f2fe', text: '#075985' },
  화기감시자: { bg: '#fee2e2', text: '#991b1b' },
  유도원: { bg: '#fef3c7', text: '#92400e' },
  양중: { bg: '#e0e7ff', text: '#3730a3' },
  덕트: { bg: '#dcfce7', text: '#166534' },
  비계: { bg: '#e0f2fe', text: '#0369a1' },
  안전담당자: { bg: '#ecfdf5', text: '#065f46' },
  안전시설반: { bg: '#fef9c3', text: '#78350f' },
  품질담당자: { bg: '#eff6ff', text: '#1e40af' },
  공사담당자: { bg: '#f5f3ff', text: '#5b21b6' },
  기타: { bg: '#f3f4f6', text: '#374151' },
};

export const NEW_HOURS = 48;
export const HOT_HOURS = 24;

export function isNew(date: string): boolean {
  return (Date.now() - new Date(date).getTime()) / 3600000 < NEW_HOURS;
}

export function isHot(date: string): boolean {
  return (Date.now() - new Date(date).getTime()) / 3600000 < HOT_HOURS;
}

export function isAutoHidden(date: string, autoHideHours: number): boolean {
  if (!autoHideHours) return false;
  return (Date.now() - new Date(date).getTime()) / 3600000 >= autoHideHours;
}

export function getViewed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem('cj_viewed_jobs') || '[]'));
  } catch {
    return new Set();
  }
}

export function markViewed(id: string): void {
  const set = getViewed();
  set.add(id);
  const arr = [...set];
  const trimmed = arr.length > 500 ? arr.slice(arr.length - 500) : arr;
  localStorage.setItem('cj_viewed_jobs', JSON.stringify(trimmed));
}

export function getContactDailyLimit(): number {
  return Math.max(1, parseInt(localStorage.getItem('cj_contact_daily_limit') || '20') || 20);
}

export function getTodayContactCount(): number {
  try {
    const log = JSON.parse(localStorage.getItem('cj_contact_log') || '[]') as number[];
    const today = new Date().toDateString();
    return log.filter((ts) => new Date(ts).toDateString() === today).length;
  } catch { return 0; }
}

export function recordContactReveal(): void {
  try {
    const log = JSON.parse(localStorage.getItem('cj_contact_log') || '[]') as number[];
    log.push(Date.now());
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
    localStorage.setItem('cj_contact_log', JSON.stringify(log.filter((ts) => ts > cutoff)));
  } catch {}
}

export function isContactBlocked(): boolean {
  return getTodayContactCount() >= getContactDailyLimit();
}

