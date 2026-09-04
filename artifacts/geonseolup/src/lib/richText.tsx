// 꿀팁·현장소식 본문 공통 서식 렌더러.
// 네이버 블로그처럼 간단한 기호로 꾸밀 수 있게 한다:
//   **굵게**            → 굵은 글씨
//   {빨강:텍스트}        → 글자색 (빨강·파랑·초록·주황·회색)
//   > 인용문             → 왼쪽 세로선이 있는 인용 상자 (연속 줄은 하나로 묶임)
//   ---                 → 짧은 구분선 (가운데 정렬)
//   ===                 → 긴 구분선 (전체 폭)
// 기호가 없으면 지금까지처럼 그대로 보인다 (기존 글 100% 호환).

import type { ReactNode } from 'react';

const COLOR_MAP: Record<string, string> = {
  빨강: '#dc2626',
  빨간: '#dc2626',
  파랑: '#2563eb',
  파란: '#2563eb',
  초록: '#16a34a',
  주황: '#ea580c',
  회색: '#6b7280',
};

// 한 줄 안의 **굵게**, {색:텍스트}, [링크텍스트](URL) 처리
export function renderInline(text: string, keyPrefix = ''): ReactNode[] {
  const out: ReactNode[] = [];
  // **굵게** 또는 {색이름:내용} 또는 [텍스트](URL) 을 찾는다
  // 줄바꿈은 넘지 않게([^*\n], [^}\n], [^\]\n]/[^)\n]) — 안 닫힌 기호가 여러 줄을 통째로 꾸미는 사고 방지
  const re = /\*\*([^*\n]+)\*\*|\{(빨강|빨간|파랑|파란|초록|주황|회색):([^}\n]+)\}|\[([^\]\n]+)\]\(([^)\n]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(<strong key={`${keyPrefix}b${k++}`} className="font-bold text-gray-900">{m[1]}</strong>);
    } else if (m[2] !== undefined) {
      out.push(
        <span key={`${keyPrefix}c${k++}`} style={{ color: COLOR_MAP[m[2]!] }} className="font-semibold">
          {m[3]}
        </span>
      );
    } else {
      out.push(
        <a
          key={`${keyPrefix}l${k++}`}
          href={m[5]}
          className="font-semibold text-[#ea580c] underline underline-offset-2 hover:text-[#c2410c]"
        >
          {m[4]}
        </a>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** 본문 텍스트 한 덩어리를 서식이 적용된 요소들로 변환 */
export function renderRichText(text: string): ReactNode {
  const lines = text.split('\n');
  const parts: ReactNode[] = [];
  let buf: string[] = []; // 일반 줄 모음
  let quote: string[] = []; // 인용 줄 모음
  let key = 0;

  const flushBuf = () => {
    if (buf.length === 0) return;
    parts.push(
      <p key={`p${key++}`} className="whitespace-pre-line">
        {renderInline(buf.join('\n'), `p${key}`)}
      </p>
    );
    buf = [];
  };
  const flushQuote = () => {
    if (quote.length === 0) return;
    parts.push(
      <blockquote
        key={`q${key++}`}
        className="border-l-4 border-[#f97316] bg-orange-50/60 rounded-r-lg px-4 py-3 my-3 text-gray-700 whitespace-pre-line"
      >
        {renderInline(quote.join('\n'), `q${key}`)}
      </blockquote>
    );
    quote = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const t = line.trim();
    if (/^>\s?/.test(t)) {
      flushBuf();
      quote.push(t.replace(/^>\s?/, ''));
      continue;
    }
    flushQuote();
    if (/^-{3,}$/.test(t)) {
      // 짧은 구분선
      flushBuf();
      parts.push(<hr key={`hs${key++}`} className="w-16 mx-auto my-5 border-0 border-t-2 border-gray-300" />);
      continue;
    }
    if (/^={3,}$/.test(t)) {
      // 긴 구분선
      flushBuf();
      parts.push(<hr key={`hl${key++}`} className="w-full my-5 border-0 border-t border-gray-200" />);
      continue;
    }
    buf.push(line);
  }
  flushBuf();
  flushQuote();
  return <>{parts}</>;
}

/** 미리보기·설명용: 서식 기호를 제거한 순수 텍스트 */
export function stripRichMarks(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\{(?:빨강|빨간|파랑|파란|초록|주황|회색):([^}]+)\}/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-=]{3,}\s*$/gm, '');
}
