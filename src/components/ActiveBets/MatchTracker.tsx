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
    <div
      className="mb-2 rounded p-2 border relative overflow-hidden shadow-inner"
      style={{
        background: 'color-mix(in srgb, var(--app-bg-deep) 88%, rgba(var(--app-accent-rgb), 0.05))',
        borderColor: 'color-mix(in srgb, var(--app-border) 78%, transparent)',
      }}
    >
      {eventStatus.clock && (
        <div
          className="absolute top-0 left-0 h-full transition-all duration-1000"
          style={{
            background: 'rgba(var(--app-accent-rgb), 0.08)',
            width: `${getMatchProgress(eventStatus.clock)}%`,
          }}
        />
      )}
      <div className="relative z-10 flex justify-between items-center text-xs">
        <div className="flex-1 text-left truncate font-bold pr-2" style={{ color: 'var(--app-text)' }}>
          {competitors[0]?.name ?? fixture?.name?.split(' vs ')[0] ?? 'Home'}
        </div>
        <div className="flex flex-col items-center">
          <div
            className="px-2 font-mono font-bold rounded mx-1 min-w-[3rem] text-center border shadow-sm flex items-center justify-center gap-1"
            style={{
              color: 'var(--app-text)',
              background: 'color-mix(in srgb, var(--app-bg-card) 86%, transparent)',
              borderColor: 'color-mix(in srgb, var(--app-border) 76%, transparent)',
            }}
          >
            <span>{homeScore}</span>
            <span className="text-[10px]" style={{ color: 'var(--app-text-muted)' }}>-</span>
            <span>{awayScore}</span>
          </div>
          {(eventStatus.homeGameScore ?? eventStatus.awayGameScore) && (
            <div className="text-[9px] font-mono mt-0.5" style={{ color: '#fbbf24' }}>
              {eventStatus.homeGameScore}-{eventStatus.awayGameScore}
            </div>
          )}
        </div>
        <div className="flex-1 text-right truncate font-bold pl-2" style={{ color: 'var(--app-text)' }}>
          {competitors[1]?.name ?? fixture?.name?.split(' vs ')[1] ?? 'Away'}
        </div>
      </div>
      <div className="relative z-10 flex justify-center items-center space-x-3 mt-1.5 text-[9px]" style={{ color: 'var(--app-text-muted)' }}>
        {eventStatus.periodScores && eventStatus.periodScores.length > 0 && (
          <div className="flex space-x-1 font-mono">
            {eventStatus.periodScores.map((p: { matchStatus?: string; homeScore?: number; awayScore?: number }, idx: number) => (
              <span key={idx} className={p.matchStatus === 'current' ? 'font-bold' : ''} style={p.matchStatus === 'current' ? { color: 'var(--app-text)' } : undefined}>
                {p.homeScore}-{p.awayScore}
              </span>
            ))}
          </div>
        )}
        {eventStatus.statistic && (
          <div className="flex space-x-2 border-l pl-2 items-center" style={{ borderColor: 'color-mix(in srgb, var(--app-border) 70%, transparent)' }}>
            {((eventStatus.statistic.yellowCards?.home ?? 0) > 0 || (eventStatus.statistic.yellowCards?.away ?? 0) > 0) && (
              <span className="flex items-center gap-0.5" style={{ color: '#fbbf24' }} title="Yellow Cards">
                <span className="w-1.5 h-2 rounded-[1px]" style={{ background: '#fbbf24' }} />
                <span>{eventStatus.statistic.yellowCards?.home ?? 0}-{eventStatus.statistic.yellowCards?.away ?? 0}</span>
              </span>
            )}
            {((eventStatus.statistic.redCards?.home ?? 0) > 0 || (eventStatus.statistic.redCards?.away ?? 0) > 0) && (
              <span className="flex items-center gap-0.5" style={{ color: 'var(--app-error)' }} title="Red Cards">
                <span className="w-1.5 h-2 rounded-[1px]" style={{ background: 'var(--app-error)' }} />
                <span>{eventStatus.statistic.redCards?.home ?? 0}-{eventStatus.statistic.redCards?.away ?? 0}</span>
              </span>
            )}
            {((eventStatus.statistic.corners?.home ?? 0) > 0 || (eventStatus.statistic.corners?.away ?? 0) > 0) && (
              <span className="flex items-center gap-0.5" style={{ color: 'var(--app-text-muted)' }} title="Corners">
                <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 24 24"><path d="M4 2v18h2v-8h10l-4-5 4-5H6V2H4z" /></svg>
                <span>{eventStatus.statistic.corners?.home ?? 0}-{eventStatus.statistic.corners?.away ?? 0}</span>
              </span>
            )}
          </div>
        )}
      </div>
      <div className="relative z-10 text-center text-[9px] mt-1 font-mono uppercase tracking-wider font-bold" style={{ color: 'var(--app-text-muted)' }}>
        {eventStatus.matchStatus === 'live' || eventStatus.clock ? (
          <span className="animate-pulse flex items-center justify-center gap-1" style={{ color: 'var(--app-accent)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--app-accent)' }} />
            {displayTime}
          </span>
        ) : (
          <span>{displayTime}</span>
        )}
      </div>
    </div>
  );
}
