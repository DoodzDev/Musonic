/**
 * @file PlaylistInfoModal.tsx
 * @description Modal for viewing and editing playlist metadata (name, description,
 *   cover art). Also provides the delete playlist action.
 * @author DoodzProg
 * @version 1.0.1
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useEffect, useState} from 'react';
import {
  Alert,
  useWindowDimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {launchImageLibrary} from 'react-native-image-picker';
import {SafeAreaView} from 'react-native-safe-area-context';
import CoverArt from './CoverArt';
import {updatePlaylist, deletePlaylist} from '../api/endpoints/playlists';
import {storage} from '../store/storage';
import {getT} from '../i18n';

const ACCENT = '#FF6B35';

function coverKey(playlistId: string) {
  return `coverart_pl_${playlistId}`;
}

export function getLocalCoverUri(playlistId: string): string | null {
  return storage.getString(coverKey(playlistId)) ?? null;
}

function setLocalCoverUri(playlistId: string, uri: string | null) {
  if (uri) storage.set(coverKey(playlistId), uri);
  else storage.delete(coverKey(playlistId));
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function TrashIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M3 6 H21 M8 6 V4 C8 3.4 8.4 3 9 3 H15 C15.6 3 16 3.4 16 4 V6 M19 6 L18 20 C18 20.6 17.6 21 17 21 H7 C6.4 21 6 20.6 6 20 L5 6"
        stroke="#888"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M10 11 V17 M14 11 V17" stroke="#888" strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

function PencilBadgeIcon() {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24">
      <Path
        d="M11 5 H5 C4.4 5 4 5.4 4 6 V19 C4 19.6 4.4 20 5 20 H18 C18.6 20 19 19.6 19 19 V13 M17.5 2.5 C18.3 1.7 19.7 1.7 20.5 2.5 C21.3 3.3 21.3 4.7 20.5 5.5 L12 14 L8 15 L9 11 Z"
        stroke="#fff"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  visible: boolean;
  onClose: () => void;
  playlistId: string;
  initialName: string;
  initialDescription: string;
  coverArtId?: string;
  onSaved: (name: string, description: string) => void;
  onDeleted: () => void;
  initialView?: 'info' | 'cover';
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PlaylistInfoModal({
  visible,
  onClose,
  playlistId,
  initialName,
  initialDescription,
  coverArtId,
  onSaved,
  onDeleted,
  initialView,
}: Props) {
  const t = getT();
  const {height: winH} = useWindowDimensions();
  const [view, setView] = useState<'info' | 'cover'>(initialView ?? 'info');
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [localCoverUri, setLocalCoverState] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setView(initialView ?? 'info');
      setName(initialName);
      setDescription(initialDescription);
      setLocalCoverState(getLocalCoverUri(playlistId));
    }
  }, [visible, initialName, initialDescription, playlistId, initialView]);

  const handleSave = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await updatePlaylist(playlistId, trimmed, undefined, undefined, description.trim());
      onSaved(trimmed, description.trim());
      onClose();
    } catch {
      Alert.alert(t.playlistInfo.saveError);
    } finally {
      setSaving(false);
    }
  }, [playlistId, name, description, onSaved, onClose, t]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      t.playlistInfo.deleteTitle,
      t.playlistInfo.deleteMessage(name),
      [
        {text: t.playlistInfo.deleteCancel, style: 'cancel'},
        {
          text: t.playlistInfo.deleteConfirm,
          style: 'default',
          onPress: async () => {
            try {
              await deletePlaylist(playlistId);
              setLocalCoverUri(playlistId, null);
              onDeleted();
              onClose();
            } catch {
              Alert.alert(t.playlistInfo.saveError);
            }
          },
        },
      ],
    );
  }, [playlistId, name, onDeleted, onClose, t]);

  const handlePickImage = useCallback(async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.9,
      selectionLimit: 1,
    });
    if (result.assets?.[0]?.uri) {
      const uri = result.assets[0].uri;
      setLocalCoverUri(playlistId, uri);
      setLocalCoverState(uri);
      setView('info');
    }
  }, [playlistId]);

  const handleResetCover = useCallback(() => {
    setLocalCoverUri(playlistId, null);
    setLocalCoverState(null);
    setView('info');
  }, [playlistId]);

  // ── Cover view (full screen) ─────────────────────────────────────────────────
  if (view === 'cover') {
    return (
      <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={() => setView('info')}>
        <View style={styles.coverScreen}>
          <TouchableOpacity style={styles.coverClose} onPress={() => setView('info')}>
            <Text style={styles.coverCloseText}>✕</Text>
          </TouchableOpacity>

          <View style={styles.coverImageWrap}>
            {localCoverUri ? (
              <Image source={{uri: localCoverUri}} style={styles.coverBig} />
            ) : (
              <CoverArt id={coverArtId} size={280} borderRadius={8} />
            )}
          </View>

          <TouchableOpacity style={styles.resetBtn} onPress={handleResetCover} activeOpacity={0.85}>
            <Text style={styles.resetBtnText}>{t.playlistInfo.resetCover}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handlePickImage} activeOpacity={0.7}>
            <Text style={styles.editCoverText}>{t.playlistInfo.editCover}</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  // ── Info view (bottom sheet) ─────────────────────────────────────────────────
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      {/* Dim overlay — tap to close */}
      <TouchableOpacity
        style={[StyleSheet.absoluteFill, styles.dimOverlay]}
        onPress={onClose}
        activeOpacity={1}
      />

      <KeyboardAvoidingView
        style={[styles.sheetWrap, {maxHeight: winH * 0.88}]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <SafeAreaView style={styles.sheet} edges={['bottom']}>
          {/* Drag handle */}
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          {/* Top bar */}
          <View style={styles.topBar}>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.cancelText}>{t.playlistInfo.cancel}</Text>
            </TouchableOpacity>
            <Text style={styles.topBarTitle}>{t.playlistInfo.title}</Text>
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving || !name.trim()}
              activeOpacity={0.7}>
              <Text style={[styles.saveText, (!name.trim() || saving) && styles.saveDisabled]}>
                {t.playlistInfo.save}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.body}>
            {/* Cover + name row */}
            <View style={styles.infoRow}>
              <TouchableOpacity onPress={() => setView('cover')} activeOpacity={0.8} style={styles.coverWrap}>
                {localCoverUri ? (
                  <Image source={{uri: localCoverUri}} style={styles.thumbImage} />
                ) : (
                  <CoverArt id={coverArtId} size={90} borderRadius={6} />
                )}
                <View style={styles.coverEditBadge}>
                  <PencilBadgeIcon />
                </View>
              </TouchableOpacity>

              <View style={styles.nameSection}>
                <Text style={styles.fieldLabel}>{t.playlistInfo.nameLabel}</Text>
                <TextInput
                  style={styles.nameInput}
                  value={name}
                  onChangeText={setName}
                  placeholder={t.playlistInfo.namePlaceholder}
                  placeholderTextColor="#555"
                  maxLength={100}
                  returnKeyType="done"
                />
              </View>
            </View>

            {/* Description */}
            <TextInput
              style={styles.descInput}
              value={description}
              onChangeText={setDescription}
              placeholder={t.playlistInfo.descriptionPlaceholder}
              placeholderTextColor="#555"
              multiline
              maxLength={300}
              textAlignVertical="top"
            />

            {/* Delete */}
            <TouchableOpacity style={styles.deleteRow} onPress={handleDelete} activeOpacity={0.7}>
              <TrashIcon />
              <Text style={styles.deleteText}>{t.playlistInfo.deletePlaylist}</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Bottom sheet
  dimOverlay: {
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheetWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#535353',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
  },
  topBarTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  cancelText: {
    fontSize: 15,
    color: '#fff',
    minWidth: 70,
  },
  saveText: {
    fontSize: 15,
    fontWeight: '700',
    color: ACCENT,
    minWidth: 90,
    textAlign: 'right',
  },
  saveDisabled: {
    opacity: 0.4,
  },
  body: {
    padding: 16,
    paddingBottom: 8,
    gap: 14,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  coverWrap: {
    position: 'relative',
  },
  thumbImage: {
    width: 90,
    height: 90,
    borderRadius: 6,
  },
  coverEditBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 10,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameSection: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  nameInput: {
    backgroundColor: '#282828',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#fff',
  },
  descInput: {
    backgroundColor: '#282828',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#fff',
    minHeight: 76,
    maxHeight: 140,
  },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a2a2a',
    marginTop: 4,
  },
  deleteText: {
    fontSize: 16,
    color: '#fff',
  },
  // Cover screen (full-screen)
  coverScreen: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  coverClose: {
    position: 'absolute',
    top: 56,
    right: 20,
    padding: 8,
  },
  coverCloseText: {
    fontSize: 20,
    color: '#fff',
  },
  coverImageWrap: {
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 12,
  },
  coverBig: {
    width: 280,
    height: 280,
    borderRadius: 8,
  },
  resetBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 50,
  },
  resetBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },
  editCoverText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
});
