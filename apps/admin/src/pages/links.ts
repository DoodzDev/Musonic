/**
 * @file links.ts
 * @description State of a public link (invitation, password reset) and the password rule of
 *   its form.
 * @author DoodzProg
 * @version 0.1.0
 * @license CC-BY-NC-4.0
 */

import { useEffect, useState } from 'react';
import type { LinkInfo } from '@musonic/core';
import { api } from '../api.ts';

/** Why a link cannot be used, as the page says it. */
export const LINK_STATES: Record<string, string> = {
  used: 'Ce lien a déjà été utilisé.',
  expired: 'Ce lien a expiré. Demandez-en un nouveau à l’administrateur.',
  revoked: 'Ce lien a été annulé par l’administrateur.',
  unknown: 'Ce lien n’existe pas. Vérifiez qu’il est complet.',
};

/** Loads the link's state: its information, or why it cannot be used (`blocked`). */
export function useLink(path: string): { info: LinkInfo | null; blocked: string | null } {
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api<LinkInfo>(path, { auth: false }).then(setInfo).catch(() => setFailed(true));
  }, [path]);
  if (failed) return { info: null, blocked: 'Le serveur ne répond pas. Réessayez dans un instant.' };
  if (info && info.state !== 'valid') return { info, blocked: LINK_STATES[info.state] };
  return { info, blocked: null };
}

/** Why the form cannot be sent yet, if anything. */
export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < 8) return 'Le mot de passe doit faire au moins 8 caractères.';
  if (password !== confirm) return 'Les deux mots de passe ne sont pas identiques.';
  return null;
}
