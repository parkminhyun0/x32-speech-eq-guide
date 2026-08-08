import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import LiveMonitorShortcut from './LiveMonitorShortcut'
import SectionAnchorInstaller from './SectionAnchorInstaller'
import WorshipWorkflowHub from './WorshipWorkflowHub'
import X32Connect from './X32Connect'
import './styles.css'
import './workflow-layout.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SectionAnchorInstaller />
    <WorshipWorkflowHub />
    <LiveMonitorShortcut />
    <div className="x32-connect-root"><X32Connect /></div>
    <App />
  </React.StrictMode>,
)
