/**
 * @file ErrorBoundary.tsx
 * @description Last-resort screen instead of a blank page when rendering fails.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { Component, type ReactNode } from 'react';
import { fr } from '../i18n/fr.ts';
import { AlertIcon } from './icons/AlertIcon.tsx';

interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash" role="alert">
        <AlertIcon size={28} triangle />
        <p>{fr.crash.message}</p>
        <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
          {fr.crash.reload}
        </button>
      </div>
    );
  }
}
