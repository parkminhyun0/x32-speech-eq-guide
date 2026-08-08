import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ArchiveEqSuggestionOverlay from './ArchiveEqSuggestionOverlay'
import LiveMonitorShortcut from './LiveMonitorShortcut'
import LocalSecureContextNotice from './LocalSecureContextNotice'
import LocationMeasurementWorkspace from './LocationMeasurementWorkspace'
import SectionAnchorInstaller from './SectionAnchorInstaller'
import WorshipWorkflowHub from './WorshipWorkflowHub'
import X32Connect from './X32Connect'
import X32ConnectMenuShortcut from './X32ConnectMenuShortcut'
import './styles.css'
import './workflow-layout.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SectionAnchorInstaller />
    <WorshipWorkflowHub />
    <X32ConnectMenuShortcut />
    <LiveMonitorShortcut />
    <LocalSecureContextNotice />
    <div className="x32-connect-root"><X32Connect /></div>
    <LocationMeasurementWorkspace />
    <App />
    <ArchiveEqSuggestionOverlay />
  </React.StrictMode>,
)
