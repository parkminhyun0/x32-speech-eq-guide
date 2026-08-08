import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import SectionAnchorInstaller from './SectionAnchorInstaller'
import WorshipWorkflowHub from './WorshipWorkflowHub'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SectionAnchorInstaller />
    <WorshipWorkflowHub />
    <App />
  </React.StrictMode>,
)
