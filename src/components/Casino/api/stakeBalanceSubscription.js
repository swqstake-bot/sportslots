import { StakeApi } from '../../../api/client'
import { fetchUserBalances } from './stakeWallet'

/**
 * Subscribes to bet updates (Stub for Electron)
 * In the web version, this used a WebSocket.
 * In Electron, we might poll or rely on local state updates.
 * 
 * @param {string} accessToken 
 * @param {function} onUpdate - callback(bet)
 */
export function subscribeToBetUpdates(accessToken, onUpdate) {
  // console.log("WS Subscription (subscribeToBetUpdates) disabled in Electron for now");
  
  // Potential improvement: Poll recent bets via GraphQL if needed
  // const interval = setInterval(async () => { ... }, 5000);

  return {
    disconnect() {
      // clearInterval(interval);
    }
  }
}

/**
 * Fetch user balance (Polling helper)
 * Can be used by components to keep balance in sync
 * Polls every 5 seconds.
 */
export function subscribeToBalanceUpdates(accessToken, onUpdate) {
   if (!accessToken) return { disconnect() {} }

   let active = true
   let intervalId = null

   const poll = async () => {
     if (!active) return
     try {
       const { available } = await fetchUserBalances(accessToken)
       if (!active) return
       
       // Emit updates for each currency found
       for (const bal of available) {
         onUpdate({
           currency: bal.currency,
           amount: bal.amount
         })
       }
     } catch (err) {
       // Silent fail on poll error
       // console.error("Balance poll error", err)
     }
   }

   // Initial poll
   poll()

   // Set interval
   intervalId = setInterval(poll, 5000)

   return { 
     disconnect() {
       active = false
       if (intervalId) clearInterval(intervalId)
     } 
   }
}
