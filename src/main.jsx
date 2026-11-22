import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ParticipantApp from './participant/ParticipantApp';
import './styles.css';

// Participants: the main link (or ?mode=participant / ?p=<link>) -> mobile page.
// Staff: ?mode=admin -> production console.
const mode = new URLSearchParams(window.location.search).get('mode');

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {mode === 'admin' ? <App /> : <ParticipantApp />}
  </React.StrictMode>,
);
