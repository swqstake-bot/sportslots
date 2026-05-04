import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import MainApp from './MainApp'
import { initSlotbotBridge } from './components/Casino/bridge/slotbotBridge'
import { initPerfInstrumentation } from './utils/perfInstrumentation'

initPerfInstrumentation()

// Initialize the bridge for Thunderkick and other webview providers
initSlotbotBridge()

console.log('Rendering MainApp')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MainApp />
  </StrictMode>,
)
