"""Patch i18n files for Chantier 2 — PlaylistDetail / PlaylistInfoModal."""
import re, sys

FR = r'C:\Dev\Musonic\src\i18n\fr.ts'
EN = r'C:\Dev\Musonic\src\i18n\en.ts'

# ── pills patch ────────────────────────────────────────────────────────────────
FR_PILLS_OLD = """    pills: {
      add: '+ Ajouter',
      mix: 'Mixer',
      edit: 'Modifier',
    },"""
FR_PILLS_NEW = """    pills: {
      edit: 'Modifier',
      sort: 'Trier',
      info: 'Nom et informations',
    },
    comingSoon: 'Bientôt disponible',"""

EN_PILLS_OLD = """    pills: {
      add: '+ Add',
      mix: 'Mix',
      edit: 'Edit',
    },"""
EN_PILLS_NEW = """    pills: {
      edit: 'Edit',
      sort: 'Sort',
      info: 'Name & info',
    },
    comingSoon: 'Coming soon',"""

# ── playlistOptions new keys  ──────────────────────────────────────────────────
FR_OPTS_OLD = "    comingSoon: 'Bientôt disponible',\n  },"
FR_OPTS_NEW = """    comingSoon: 'Bientôt disponible',
    editPlaylist: 'Modifier la playlist',
    nameAndInfo: 'Nom et informations',
    editCover: 'Modifier la pochette',
    addAllToPlaylist: 'Ajouter à une autre playlist',
    addedAllToPlaylist: (n: number, name: string) => `${n} titre${n !== 1 ? 's' : ''} ajouté${n !== 1 ? 's' : ''} dans ${name}`,
    addToPlaylistError: "Erreur lors de l'ajout à la playlist",
  },"""

EN_OPTS_OLD = "    comingSoon: 'Coming soon',\n  },"
EN_OPTS_NEW = """    comingSoon: 'Coming soon',
    editPlaylist: 'Edit playlist',
    nameAndInfo: 'Name & info',
    editCover: 'Edit cover',
    addAllToPlaylist: 'Add to another playlist',
    addedAllToPlaylist: (n: number, name: string) => `${n} song${n !== 1 ? 's' : ''} added to ${name}`,
    addToPlaylistError: 'Error adding to playlist',
  },"""

# ── playlistInfo new section (insert after renameModal) ────────────────────────
FR_RENAME = "  // ─── Add to Playlist Sheet"
FR_PLAYLIST_INFO = """  // ─── Playlist Info Modal ──────────────────────────────────────────────────
  playlistInfo: {
    title: 'Nom et informations',
    cancel: 'Annuler',
    save: 'Sauvegarder',
    namePlaceholder: 'Nom de la playlist',
    descriptionPlaceholder: 'Description (optionnelle)',
    deletePlaylist: 'Supprimer la playlist',
    deleteTitle: 'Supprimer la playlist ?',
    deleteMessage: (name: string) => `Voulez-vous vraiment supprimer "${name}" ?`,
    deleteConfirm: 'Supprimer',
    deleteCancel: 'Annuler',
    saved: 'Informations sauvegardées',
    saveError: 'Erreur lors de la sauvegarde',
    coverTitle: 'Pochette',
    resetCover: 'Remettre par défaut',
    editCover: 'Modifier la pochette',
    coverChanged: 'Pochette modifiée',
    coverReset: 'Pochette réinitialisée',
  },

  // ─── Add to Playlist Sheet"""

EN_RENAME = "  // ─── Add to Playlist Sheet"
EN_PLAYLIST_INFO = """  // ─── Playlist Info Modal ──────────────────────────────────────────────────
  playlistInfo: {
    title: 'Name & info',
    cancel: 'Cancel',
    save: 'Save',
    namePlaceholder: 'Playlist name',
    descriptionPlaceholder: 'Description (optional)',
    deletePlaylist: 'Delete playlist',
    deleteTitle: 'Delete playlist?',
    deleteMessage: (name: string) => `Delete "${name}" permanently?`,
    deleteConfirm: 'Delete',
    deleteCancel: 'Cancel',
    saved: 'Info saved',
    saveError: 'Error saving info',
    coverTitle: 'Cover',
    resetCover: 'Reset to default',
    editCover: 'Edit cover',
    coverChanged: 'Cover updated',
    coverReset: 'Cover reset',
  },

  // ─── Add to Playlist Sheet"""


def patch(path, replacements):
    with open(path, encoding='utf-8') as f:
        src = f.read()
    for old, new in replacements:
        if old not in src:
            print(f'WARN: pattern not found in {path}:\n  {old[:60]}')
            continue
        src = src.replace(old, new, 1)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(src)
    print(f'Patched {path}')


patch(FR, [
    (FR_PILLS_OLD, FR_PILLS_NEW),
    (FR_OPTS_OLD, FR_OPTS_NEW),
    (FR_RENAME, FR_PLAYLIST_INFO),
])

patch(EN, [
    (EN_PILLS_OLD, EN_PILLS_NEW),
    (EN_OPTS_OLD, EN_OPTS_NEW),
    (EN_RENAME, EN_PLAYLIST_INFO),
])
print('Done.')
