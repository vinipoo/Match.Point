import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ParticipantApp from './participant/ParticipantApp';
import './styles.css';

// ?p=<token> -> participant page; otherwise the staff console
const token = new URLSearchParams(window.location.search).get('p');

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {token ? <ParticipantApp token={token} /> : <App />}
  </React.StrictMode>,
);
