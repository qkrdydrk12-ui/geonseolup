import { useEffect, useState } from "react";
import { fetchAuthUser } from "@/lib/authUser";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import GongsuInput from "@/components/GongsuInput";
import GongsuMonthSummary from "@/components/GongsuMonthSummary";
import GongsuCalendar from "@/components/GongsuCalendar";
import GongsuWageSummary from "@/components/GongsuWageSummary";
import GongsuRetirementFund from "@/components/GongsuRetirementFund";
import GongsuReminderSettings from "@/components/GongsuReminderSettings";

interface MeUser {
  id: number;
  nickname: string;
}

export default function MyPage({ tab }: { tab?: string }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MeUser | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetchAuthUser()
      .then(setUser)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "#f1f5f9" }}
    >
      <Header />
      <main className="flex-1 max-w-[860px] mx-auto w-full px-4 py-10">
        {loading ? (
          <div className="text-center text-gray-400 py-20">불러오는 중...</div>
        ) : user ? (
          <>
            <h1 className="text-2xl font-bold text-[#1e3a5f] mb-2">
              마이페이지
            </h1>
            <p className="text-sm text-gray-500 mb-6">
              <b className="text-[#1e3a5f]">{user.nickname}</b>님, 환영합니다.
            </p>
            {tab === "checkin" ? (
              <>
                <GongsuInput onSaved={() => setRefreshKey((k) => k + 1)} />
                <GongsuMonthSummary refreshKey={refreshKey} />
                <GongsuRetirementFund refreshKey={refreshKey} />
                <GongsuCalendar
                  refreshKey={refreshKey}
                  onChanged={() => setRefreshKey((k) => k + 1)}
                />
                <GongsuWageSummary
                  refreshKey={refreshKey}
                  onChanged={() => setRefreshKey((k) => k + 1)}
                />
                <GongsuReminderSettings />
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <a
                  href="/"
                  className="flex items-center justify-between bg-white rounded-2xl shadow-sm border border-gray-200 p-5 no-underline hover:border-[#f97316] transition-colors"
                >
                  <div>
                    <div className="font-bold text-[#1e3a5f] mb-1">
                      일자리 찾기
                    </div>
                    <div className="text-sm text-gray-500">
                      지역·직종별로 확인
                    </div>
                  </div>
                  <span className="text-gray-300 text-xl">›</span>
                </a>
                <a
                  href="/mypage/checkin"
                  className="flex items-center justify-between bg-white rounded-2xl shadow-sm border border-gray-200 p-5 no-underline hover:border-[#f97316] transition-colors"
                >
                  <div>
                    <div className="font-bold text-[#1e3a5f] mb-1">
                      오늘 출근 기록
                    </div>
                    <div className="text-sm text-gray-500">
                      일당과 공수를 함께
                    </div>
                  </div>
                  <span className="text-gray-300 text-xl">›</span>
                </a>
                <a
                  href="/alerts"
                  className="flex items-center justify-between bg-white rounded-2xl shadow-sm border border-gray-200 p-5 no-underline hover:border-[#f97316] transition-colors"
                >
                  <div>
                    <div className="font-bold text-[#1e3a5f] mb-1">
                      아침 알림
                    </div>
                    <div className="text-sm text-gray-500">
                      기록할 시간을 챙기기
                    </div>
                  </div>
                  <span className="text-gray-300 text-xl">›</span>
                </a>
              </div>
            )}
          </>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
            <p className="text-gray-700 mb-6">로그인이 필요한 페이지입니다.</p>
            <a
              href="/api/auth/kakao/login"
              className="inline-block text-sm font-semibold px-5 py-2.5 rounded-lg no-underline"
              style={{ background: "#FEE500", color: "#181600" }}
            >
              카카오로 시작하기
            </a>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
