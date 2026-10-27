/**
 * @file main.tsx
 * @description Entry point of the Musonic web client. Routes live under the
 *   path the build is served from (`/` or `/app/` on GitHub Pages).
 * @author DoodzProg
 * @version 0.4.0
 * @license CC-BY-NC-4.0
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
