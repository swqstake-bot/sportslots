interface MatchTrackerFixture {
  name?: string;
  eventStatus?: {
    homeScore?: number;
    awayScore?: number;
    matchStatus?: string;
    clock?: { matchTime?: string };
    periodScores?: Array<{ homeScore?: number; awayScore?: number; matchStatus?: string }>;
    homeGameScore?: string;
    awayGameScore?: string;
    statistic?: {
      yellowCards?: { away: number; home: number };
      redCards?: { away: number; home: number };
      corners?: { home: number; away: number };
    };
  };
  data?: {
    competitors?: Array<{ name?: string }>;
  };
}

export function MatchTracker({ fixture }: { fixture: MatchTrackerFixture }) {
  const eventStatus = fixture?.eventStatus;
  const matchData = fixture?.data;
  const competitors = matchData?.competitors || [];

  if (!eventStatus) return null;

  const getMatchProgress = (clock: { matchTime?: string } | undefined) => {
    if (!clock?.matchTime) return 0;
    const timeStr = String(clock.matchTime).split('+')[0];
    const time = parseInt(timeStr, 10) || 0;
    return Math.min(100, (time / 90) * 100);
  };

  const homeScore = eventStatus?.homeScore ?? '-';
  const awayScore = eventStatus?.awayScore ?? '-';
  const displayTime = eventStatus?.clock?.matchTime ?? eventStatus?.matchStatus ?? 'Upcoming';

  return (
    <div className="mb-2 bg-[#0f212e] rounded p-2 border border-[#2f4553] relative overflow-hidden shadow-inner">
      {eventStatus.clock && (
        <div
          className="absolute top-0 left-0 h-full bg-[#1475e1] opacity-5 transition-all duration-1000"
          style={{ width: `${getMatchProgress(eventStatus.clock)}%` }}
        />
      )}
      <div className="relative z-10 flex justify-between items-center text-xs">
        <div className="flex-1 text-left truncate font-bold text-white pr-2">
          {competitors[0]?.name ?? fixture?.name?.split(' vs ')[0] ?? 'Home'}
        </div>
        <div className="flex flex-col items-center">
          <div className="px-2 font-mono font-bold text-white bg-[#1a2c38] rounded mx-1 min-w-[3rem] text-center border border-[#2f4553] shadow-sm flex items-center justify-center gap-1">
            <span>{homeScore}</span>
            <span className="text-[#b1bad3] text-[10px]">-</span>
            <span>{awayScore}</span>
          </div>
          {(eventStatus.homeGameScore ?? eventStatus.awayGameScore) && (
            <div className="text-[9px] text-[#ffd700] font-mono mt-0.5">
              {eventStatus.homeGameScore}-{eventStatus.awayGameScore}
            </div>
          )}
        </div>
        <div className="flex-1 text-right truncate font-bold text-white pl-2">
          {competitors[1]?.name ?? fixture?.name?.split(' vs ')[1] ?? 'Away'}
        </div>
      </div>
      <div className="relative z-10 flex justify-center items-center space-x-3 mt-1.5 text-[9px] text-[#55657e]">
        {eventStatus.periodScores && eventStatus.periodScores.length > 0 && (
          <div className="flex space-x-1 font-mono">
            {eventStatus.periodScores.map((p: { matchStatus?: string; homeScore?: number; awayScore?: number }, idx: number) => (
              <span key={idx} className={p.matchStatus === 'current' ? 'text-white font-bold' : ''}>
                {p.homeScore}-{p.awayScore}
              </span>
            ))}
          </div>
        )}
        {eventStatus.statistic && (
          <div className="flex space-x-2 border-l border-[#2f4553] pl-2 items-center">
            {((eventStatus.statistic.yellowCards?.home ?? 0) > 0 || (eventStatus.statistic.yellowCards?.away ?? 0) > 0) && (
              <span className="text-[#ffd700] flex items-center gap-0.5" title="Yellow Cards">
                <span className="w-1.5 h-2 bg-[#ffd700] rounded-[1px]" />
                <span>{eventStatus.statistic.yellowCards?.home ?? 0}-{eventStatus.statistic.yellowCards?.away ?? 0}</span>
              </span>
            )}
            {((eventStatus.statistic.redCards?.home ?? 0) > 0 || (eventStatus.statistic.redCards?.away ?? 0) > 0) && (
              <span className="text-[#ff4d4d] flex items-center gap-0.5" title="Red Cards">
                <span className="w-1.5 h-2 bg-[#ff4d4d] rounded-[1px]" />
                <span>{eventStatus.statistic.redCards?.home ?? 0}-{eventStatus.statistic.redCards?.away ?? 0}</span>
              </span>
            )}
            {((eventStatus.statistic.corners?.home ?? 0) > 0 || (eventStatus.statistic.corners?.away ?? 0) > 0) && (
              <span className="text-[#b1bad3] flex items-center gap-0.5" title="Corners">
                <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 24 24"><path d="M4 2v18h2v-8h10l-4-5 4-5H6V2H4z" /></svg>
                <span>{eventStatus.statistic.corners?.home ?? 0}-{eventStatus.statistic.corners?.away ?? 0}</span>
              </span>
            )}
          </div>
        )}
      </div>
      <div className="relative z-10 text-center text-[9px] text-[#55657e] mt-1 font-mono uppercase tracking-wider font-bold">
        {eventStatus.matchStatus === 'live' || eventStatus.clock ? (
          <span className="text-[#00e701] animate-pulse flex items-center justify-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00e701]" />
            {displayTime}'
          </span>
        ) : (
          <span>{displayTime}</span>
        )}
      </div>
    </div>
  );
}
