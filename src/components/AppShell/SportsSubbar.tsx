interface SportMenuItem {
  id: string
  name: string
  slug: string
}

interface SportsSubbarProps {
  sportFilterType: 'live' | 'upcoming'
  onChangeFilter: (type: 'live' | 'upcoming') => void
  selectedSportSlug: string
  onChangeSportSlug: (slug: string) => void
  fixtureSearchQuery: string
  onChangeSearch: (q: string) => void
  sportsMenu: SportMenuItem[]
}

export function SportsSubbar({
  sportFilterType,
  onChangeFilter,
  selectedSportSlug,
  onChangeSportSlug,
  fixtureSearchQuery,
  onChangeSearch,
  sportsMenu,
}: SportsSubbarProps) {
  return (
    <div className="sports-subbar">
      <div className="sports-filter-toggle">
        <button
          type="button"
          className={sportFilterType === 'live' ? 'is-active' : ''}
          onClick={() => onChangeFilter('live')}
        >
          Live
        </button>
        <button
          type="button"
          className={sportFilterType === 'upcoming' ? 'is-active' : ''}
          onClick={() => onChangeFilter('upcoming')}
        >
          Upcoming
        </button>
      </div>
      <select
        value={selectedSportSlug}
        onChange={(e) => onChangeSportSlug(e.target.value)}
        className="sports-subbar-select"
      >
        {(sportsMenu || []).map((sport) => (
          <option key={sport.id} value={sport.slug}>
            {sport.name}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Search fixtures..."
        value={fixtureSearchQuery}
        onChange={(e) => onChangeSearch(e.target.value)}
        className="sports-subbar-search"
      />
    </div>
  )
}
