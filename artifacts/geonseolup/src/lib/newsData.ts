// 건설업 현장 소식 — 대형 현장·투자·착공 뉴스를 현장 근로자 시각에서 풀어주는 섹션.
// 정보/꿀팁(infoData)과 달리 시의성 있는 소식 위주. 헤더 이미지는 /images/news/{slug}.webp.

export interface NewsArticle {
  slug: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD (표기용)
  body: { subtitle?: string; text: string; image?: string }[];
}

export const NEWS_ARTICLES: NewsArticle[] = [
  {
    slug: 'sk-hynix-54trillion',
    title: 'SK하이닉스, 54조 3천억 베팅 — 용인·청주가 움직이기 시작했다',
    description:
      '용인 Y2 35.2조, 청주 M17 19.1조. 내년 착공 확정. 이 숫자가 건설 현장 인력에게 어떤 의미인지 정리했습니다.',
    date: '2026-08-07',
    body: [
      {
        text: '54조 3천억 원.\n한 회사가 공장 두 개에 쏟아붓는 돈입니다.\n국가 1년 예산의 10분의 1 수준. 이런 투자는 10년에 한 번 나올까 말까 합니다.\n그리고 그 돈이 향하는 곳은 용인과 청주, 우리가 일하는 현장입니다.',
      },
      {
        subtitle: '무슨 일이 벌어진 건가',
        text: 'SK하이닉스가 용인과 청주에 신규 반도체 팹(공장) 착공을 확정했습니다.\nAI 열풍으로 메모리 반도체가 없어서 못 파는 상황이 되자, 생산기지를 전면 확충하기로 한 겁니다.\n한마디로 — "지금 짓지 않으면 늦는다"는 판단입니다.',
      },
      {
        subtitle: '용인 Y2 — 35조 2천억, 내년 7월 착공',
        text: '차세대 D램 생산기지입니다.\n용인 반도체 클러스터에 들어서는 두 번째 팹으로, 단일 공장 투자로는 역대급 규모입니다.\n이미 클러스터 부지 조성과 인프라 공사가 진행 중이라, 착공이 시작되면 골조·배관·전기·소방·클린룸까지 공정이 줄줄이 이어집니다.',
      },
      {
        subtitle: '청주 M17 — 19조 1천억, 내년 2월 착공',
        text: '낸드플래시 생산기지입니다.\n착공 시점이 용인보다 다섯 달 빠릅니다. 즉, 먼저 움직이는 건 청주입니다.\n청주는 기존 M15·M15X 현장 경험자가 많은 지역이라, 경력이 있다면 우선순위가 높아질 수 있습니다.',
      },
      {
        subtitle: '이게 왜 우리한테 중요한가',
        text: '반도체 팹은 클린룸 완공까지 보통 2~3년이 걸리는 대형 공사입니다.\n한 번 착공하면 조공·형틀·철근·비계·배관·용접·화기감시·안전시설까지, 전 직종의 인력 수요가 수년간 꾸준히 이어집니다.\n평택 삼성 현장에서 이미 경험한 그 흐름이, 이번엔 용인과 청주에서 반복됩니다.',
      },
      {
        subtitle: '지금 준비하면 좋은 것',
        text: '반도체 클린룸 현장은 일반 건축 현장과 요구하는 자격이나 공정이 조금 다릅니다.\n건설기초안전이수증은 기본이고, 현장에 따라 화기감시자 교육, 장비 자격 등이 우대되는 경우가 많습니다.\n착공 전에 미리 알아보고 준비해두면, 시작하자마자 들어갈 수 있습니다.',
      },
      {
        text: '용인 Y2는 내년 7월, 청주 M17은 내년 2월.\n달력에 표시해두세요.\n이런 대형 현장 소식과 실시간 구인 정보는 건설UP에서 계속 확인할 수 있습니다.',
      },
    ],
  },
];

export const NEWS_NEWEST_FIRST: NewsArticle[] = [...NEWS_ARTICLES].reverse();

export function getNewsArticle(slug: string): NewsArticle | undefined {
  return NEWS_ARTICLES.find((a) => a.slug === slug);
}

export function getNewsImage(slug: string): string {
  return `/images/news/${slug}.webp`;
}
