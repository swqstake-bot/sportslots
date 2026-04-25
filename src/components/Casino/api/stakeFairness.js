import { StakeApi } from '../../../api/client'

const ROTATE_SEED_PAIR_MUTATION = `mutation RotateSeedPair($seed: String!) {
  rotateSeedPair(seed: $seed) {
    clientSeed {
      user {
        id
        activeClientSeed { id seed __typename }
        activeServerSeed { id nonce seedHash nextSeedHash __typename }
        __typename
      }
      __typename
    }
    __typename
  }
}`

function randomClientSeed() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

export async function rotateStakeSeedPair(seed) {
  const variables = { seed: seed || randomClientSeed() }
  const res = await StakeApi.mutate(ROTATE_SEED_PAIR_MUTATION, variables)
  return {
    ok: !!res?.data?.rotateSeedPair,
    seed: variables.seed,
    result: res?.data?.rotateSeedPair ?? null,
  }
}
