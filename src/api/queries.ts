// Ported from StakeSportsQueries.cs

// --- Fragments ---

const SportFixtureCompetitor = `fragment SportFixtureCompetitor on SportFixtureCompetitor {
  name
  extId
  countryCode
  abbreviation
  iconPath
}`;

const SportFixtureDataMatch = `fragment SportFixtureDataMatch on SportFixtureDataMatch {
  startTime
  competitors {
    ...SportFixtureCompetitor
  }
  teams {
    name
    qualifier
  }
  tvChannels {
    language
    name
    streamUrl
  }
  __typename
}
${SportFixtureCompetitor}`;

const SportFixtureDataOutright = `fragment SportFixtureDataOutright on SportFixtureDataOutright {
  name
  startTime
  endTime
  __typename
}`;

const CategoryTreeNested = `fragment CategoryTreeNested on SportCategory {
  id
  name
  slug
  sport {
    id
    name
    slug
  }
}`;

const TournamentTreeNested = `fragment TournamentTreeNested on SportTournament {
  id
  name
  slug
  category {
    ...CategoryTreeNested
    cashoutEnabled
  }
}
${CategoryTreeNested}`;

const SportFixtureLiveStreamExists = `fragment SportFixtureLiveStreamExists on SportFixture {
  id
  betradarStream { exists }
  imgArenaStream { exists }
  abiosStream { exists stream { startTime id } }
  geniussportsStream(deliveryType: hls) { exists }
  statsPerformStream(getData: false) { isAvailable geoBlocked }
}`;

const FixtureOptionsSameGameMultiButton_SportFixture = `fragment FixtureOptionsSameGameMultiButton_SportFixture on SportFixture {
  sgmAvailable: customBetAvailable
  swish: swishGame {
    sport: swishSport {
      sgmAvailable: customBetAvailable
      sgmLiveAvailable: liveCustomBetAvailable
    }
  }
}`;

const UfcFrontRowSeat = `fragment UfcFrontRowSeat on SportFixture {
  frontRowSeatFight {
    fightId
  }
  tournament {
    frontRowSeatEvent {
      identifier
    }
  }
}`;

const SportFixtureEventStatus = `fragment SportFixtureEventStatus on SportFixtureEventStatusData {
  __typename
  homeScore
  awayScore
  matchStatus
  clock {
    matchTime
    remainingTime
  }
  periodScores {
    homeScore
    awayScore
    matchStatus
  }
  currentTeamServing
  homeGameScore
  awayGameScore
  statistic {
    yellowCards { away home }
    redCards { away home }
    corners { home away }
  }
}`;

const EsportFixtureEventStatus = `fragment EsportFixtureEventStatus on EsportFixtureEventStatus {
  matchStatus
  homeScore
  awayScore
  scoreboard {
    homeGold
    awayGold
    homeGoals
    awayGoals
    homeKills
    awayKills
    gameTime
    homeDestroyedTowers
    awayDestroyedTurrets
    currentRound
    currentCtTeam
    currentDefTeam
    time
    awayWonRounds
    homeWonRounds
    remainingGameTime
  }
  periodScores {
    type
    number
    awayGoals
    awayKills
    awayScore
    homeGoals
    homeKills
    homeScore
    awayWonRounds
    homeWonRounds
    matchStatus
  }
  __typename
}`;

const SportGroup = `fragment SportGroup on SportGroup {
  name
  translation
  rank
}`;

const SportGroupTemplate = `fragment SportGroupTemplate on SportGroupTemplate {
  extId
  rank
  name
}`;

const SportMarketOutcome = `fragment SportMarketOutcome on SportMarketOutcome {
  __typename
  id
  active
  odds
  name
  customBetAvailable
}`;

const SportMarket = `fragment SportMarket on SportMarket {
  id
  name
  status
  extId
  specifiers
  customBetAvailable
  provider
}`;


const SportGroupWithMarkets = `fragment SportGroupWithMarkets on SportGroup {
  name
  translation
  rank
  id
  templates(limit: 50, includeEmpty: false) {
    extId
    rank
    name
    markets(limit: 50) {
      ...SportMarket
      outcomes {
        ...SportMarketOutcome
      }
    }
  }
}
${SportMarket}
${SportMarketOutcome}`;

const SportGroupTemplates = `fragment SportGroupTemplates on SportGroup {
  ...SportGroup
  templates(limit: 10, includeEmpty: true) {
    ...SportGroupTemplate
    markets(limit: 1) {
      ...SportMarket
      outcomes {
        ...SportMarketOutcome
      }
    }
  }
}
${SportGroup}
${SportGroupTemplate}
${SportMarket}
${SportMarketOutcome}`;

const FixturePreview = `fragment FixturePreview on SportFixture {
  id
  ...SportFixtureLiveStreamExists
  ...FixtureOptionsSameGameMultiButton_SportFixture
  status
  slug
  name
  provider
  marketCount(status: [active, suspended])
  extId
  liveWidgetUrl
  widgetUrl
  data {
    __typename
    ...SportFixtureDataMatch
    ...SportFixtureDataOutright
  }
  tournament {
    ...TournamentTreeNested
  }
  eventStatus {
    ...SportFixtureEventStatus
    ...EsportFixtureEventStatus
  }
}
${SportFixtureLiveStreamExists}
${FixtureOptionsSameGameMultiButton_SportFixture}
${SportFixtureDataMatch}
${SportFixtureDataOutright}
${TournamentTreeNested}
${SportFixtureEventStatus}
${EsportFixtureEventStatus}`;

const SportBetPreview_SportBet = `fragment SportBetPreview_SportBet on SportBet {
  __typename
  id
  active
  status
  customBet
  cashoutDisabled
  amount
  currency
  payout
  potentialMultiplier
  payoutMultiplier
  cashoutMultiplier
  createdAt
  id
  bet {
    iid
  }
  user {
    id
  }
  promotionBet {
    status
    payout
    currency
    promotion {
      name
    }
  }
  adjustments {
    payoutMultiplier
  }
  outcomes {
    fixture {
      id
      name
      status
      eventStatus {
        ...SportFixtureEventStatus
        ...EsportFixtureEventStatus
      }
      data {
        ...SportFixtureDataMatch
      }
      tournament {
        category {
          sport {
            cashoutConfiguration {
              cashoutEnabled
              baseLoad
              varianceSensitivity
            }
          }
        }
      }
    }
    id
    odds
    status
    outcome {
      id
      odds
      name
    }
    market {
      id
      name
      status
    }
  }
}
${SportFixtureEventStatus}
${EsportFixtureEventStatus}
${SportFixtureDataMatch}`;

// --- Queries ---

export const Queries = {
  AllPublicSportBets: `query BetsBoard_AllSportBets($limit: Int!) {
    allSportBets(limit: $limit) {
      id
      iid
      createdAt
      updatedAt
      potentialMultiplier
      amount
      currency
      user {
        username
        isHidden
      }
      outcomes {
        id
        odds
        fixture {
          abbreviation
          name
          id
          sport {
            slug
          }
        }
      }
    }
  }`,

  CurrencyConfiguration: `query CurrencyConversionRate {
    info {
      currencies {
        name
        usd: value(fiatCurrency: usd)
        eur: value(fiatCurrency: eur)
      }
    }
  }`,

  UserDetails: `query UserDetails { user { id name } }`,

  FetchBalances: `query UserBalances {
    user {
      id
      balances {
        available {
          amount
          currency
        }
        vault {
          amount
          currency
        }
      }
    }
  }`,

  SportListMenu: `query SportListMenu($type: SportSearchEnum!, $limit: Int = 100, $offset: Int = 0, $liveRank: Boolean = false, $sportType: SportTypeEnum) {
    sportList(
      type: $type
      limit: $limit
      offset: $offset
      liveRank: $liveRank
      sportType: $sportType
    ) {
      id
      name
      slug
      fixtureCount(type: $type)
      allGroups {
        name
        translation
        rank
        id
      }
    }
  }`,

  FixtureList: `query FixtureList($type: SportSearchEnum!, $groups: String!, $offset: Int!, $limit: Int!, $sportType: SportTypeEnum) {
    fixtureCount(type: $type)
    fixtureList(type: $type, limit: $limit, offset: $offset, sportType: $sportType) {
      ...FixturePreview
      groups(groups: [$groups], status: [active, suspended, deactivated]) {
        ...SportGroupTemplates
      }
    }
  }
  ${FixturePreview}
  ${SportGroupTemplates}`,

  FetchFixtureMarkets: `query FetchFixtureMarkets($fixture: String!, $groups: [String!]!) {
    slugFixture(fixture: $fixture) {
      id
      slug
      name
      groups(groups: $groups, status: [active, suspended, deactivated]) {
        ...SportGroupWithMarkets
      }
    }
  }
  ${SportGroupWithMarkets}`,

  SportIndex: `query SportIndex($sport: String!, $group: String!, $type: SportSearchEnum = popular, $limit: Int = 10) {
    slugSport(sport: $sport) {
      id
      name
      templates(group: $group) {
        id
        name
        extId
      }
      firstTournament: tournamentList(type: $type, limit: 1) {
        id
        name
        slug
        category {
          id
          slug
          name
          countryCode
        }
        fixtureCount(type: $type)
        fixtureList(type: $type, limit: $limit) {
          ...FixturePreview
          ...UfcFrontRowSeat
          groups(groups: [$group], status: [active, suspended, deactivated]) {
            ...SportGroupTemplates
          }
        }
      }
      tournamentList(type: $type, limit: 50) {
        id
        name
        slug
        fixtureCount(type: $type)
        category {
          id
          slug
          name
          countryCode
        }
        fixtureList(type: $type, limit: $limit) {
          ...FixturePreview
          ...UfcFrontRowSeat
          groups(groups: [$group], status: [active, suspended, deactivated]) {
            ...SportGroupTemplates
          }
        }
      }
      categoryList(type: $type, limit: 100) {
        id
        slug
        name
        countryCode
        fixtureCount(type: $type)
        tournamentList(type: $type, limit: 100) {
          id
          slug
          name
          fixtureCount(type: $type)
          category {
            id
            slug
            name
            countryCode
          }
        }
      }
    }
  }
  ${FixturePreview}
  ${UfcFrontRowSeat}
  ${SportGroupTemplates}`,

  FetchActiveSportBets: `query FetchActiveSportBets($limit: Int!, $offset: Int!, $name: String) {
    user(name: $name) {
      id
      activeSportBets(limit: $limit, offset: $offset, sort: placedTime) {
        ...SportBetPreview_SportBet
      }
    }
  }
  ${SportBetPreview_SportBet}`,

  PlaceSportBet: `mutation PlaceSportBet($amount: Float!, $currency: CurrencyEnum!, $outcomeIds: [String!]!, $betType: SportBetTypeEnum!, $oddsChange: SportOddsChangeEnum!, $identifier: String, $stakeShieldEnabled: Boolean, $stakeShieldProtectionLevel: Int, $stakeShieldOfferOdds: Float) {
    sportBet(
      amount: $amount
      currency: $currency
      outcomeIds: $outcomeIds
      betType: $betType
      oddsChange: $oddsChange
      identifier: $identifier
      stakeShieldEnabled: $stakeShieldEnabled
      stakeShieldProtectionLevel: $stakeShieldProtectionLevel
      stakeShieldOfferOdds: $stakeShieldOfferOdds
    ) {
      ...SportBetPreview_SportBet
    }
  }
  ${SportBetPreview_SportBet}`,

  PreviewCashout: `query PreviewCashout($betId: String!) {
    sportBet(id: $betId) {
      id
      cashoutMultiplier
      amount
      currency
    }
  }`,

  CashoutSportBet: `mutation CashoutSportBet($betId: String!, $multiplier: Float!) {
    cashoutSportBet(betId: $betId, multiplier: $multiplier) {
      id
      payout
      currency
    }
  }`,

  StakeShieldOffers: `query StakeShieldOffers($outcomes: [StakeShieldOffersOutcomesInput!]!) {
    stakeShieldOffers(outcomes: $outcomes) {
      offers {
        legsThatCanLose: L
        offerOdds
      }
    }
  }`
};
