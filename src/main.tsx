import React from 'react';
import { createRoot } from 'react-dom/client';
import SessionRoot from './SessionRoot';
import PWAExperience from './PWAExperience';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SessionRoot />
    <PWAExperience />
  </React.StrictMode>
);
