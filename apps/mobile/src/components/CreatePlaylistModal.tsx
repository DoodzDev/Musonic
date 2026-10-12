/**
 * @file CreatePlaylistModal.tsx
 * @description Modal for creating a new playlist. Accepts a name input and calls
 *   the Subsonic createPlaylist endpoint on confirm.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useState} from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {useT} from '../i18n';

type Props = {
  visible: boolean;
  onCancel: () => void;
  onCreate: (name: string) => void;
};

export default function CreatePlaylistModal({visible, onCancel, onCreate}: Props) {
  const t = useT();
  const [name, setName] = useState('');

  const handleCreate = () => {
    if (!name.trim()) return;
    const trimmed = name.trim();
    setName('');
    onCreate(trimmed);
  };

  const handleCancel = () => {
    setName('');
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleCancel}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <Text style={styles.title}>{t.createPlaylist.title}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t.createPlaylist.placeholder}
            placeholderTextColor="#727272"
            autoFocus
            autoCorrect={false}
            selectionColor="#1ED760"
            onSubmitEditing={handleCreate}
            returnKeyType="done"
          />
          <View style={styles.buttons}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} activeOpacity={0.8}>
              <Text style={styles.cancelText}>{t.createPlaylist.cancelButton}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.createBtn, !name.trim() && styles.createBtnDisabled]}
              onPress={handleCreate}
              activeOpacity={0.8}
              disabled={!name.trim()}>
              <Text style={styles.createText}>{t.createPlaylist.createButton}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#282828',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 40,
  },
  input: {
    width: '80%',
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#727272',
    paddingBottom: 5,
  },
  buttons: {
    flexDirection: 'row',
    marginTop: 40,
    gap: 20,
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: '#727272',
    borderRadius: 30,
    paddingVertical: 12,
    paddingHorizontal: 30,
  },
  cancelText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  createBtn: {
    backgroundColor: '#1ED760',
    borderRadius: 30,
    paddingVertical: 12,
    paddingHorizontal: 30,
  },
  createBtnDisabled: {
    opacity: 0.45,
  },
  createText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
