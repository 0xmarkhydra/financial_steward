import React from 'react';
import { createRoot } from 'react-dom/client';
import SessionRoot from './SessionRoot';
import './styles.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><SessionRoot /></React.StrictMode>);
