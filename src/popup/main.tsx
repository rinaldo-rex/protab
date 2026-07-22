import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QuickCapture } from './QuickCapture'
import './popup.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QuickCapture />
  </StrictMode>,
)
