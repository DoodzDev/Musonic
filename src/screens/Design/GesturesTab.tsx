/**
 * @file GesturesTab.tsx
 * @description "Gestures" tab of the Design screen: try the shared swipe
 *   gestures (mini-player surface, swipeable rows) and the overlays built on
 *   them (sheets, toasts) by hand.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {FlatList} from 'react-native-gesture-handler';
import {useNavigation} from '@react-navigation/native';
import Section from './DesignSection';
import Text from '../../components/ui/Text';
import Button from '../../components/ui/Button';
import GlassSurface from '../../components/ui/GlassSurface';
import Cover from '../../components/ui/Cover';
import TrackRow from '../../components/ui/TrackRow';
import Sheet from '../../components/ui/Sheet';
import {ListGroup, ListItem} from '../../components/ui/ListGroup';
import {SwipeSurface, SwipeableRow} from '../../components/ui/gestures';
import {toast} from '../../components/ui/Toast';
import PauseIcon from '../../components/icons/PauseIcon';
import QueueAddIcon from '../../components/icons/QueueAddIcon';
import CloseIcon from '../../components/icons/CloseIcon';
import {usePlaylistCacheStore} from '../../store/playlistCacheStore';
import {colors, spacing} from '../../theme';

const GESTURE_LABEL = {
  up: '↑ Ouvrir le lecteur',
  left: '← Titre suivant',
  right: '→ Titre précédent',
  tap: 'Toucher : ouvrir le lecteur',
} as const;

function MiniPlayerDemo() {
  const songs = usePlaylistCacheStore(s => s.cachedPlaylistSongs);
  const song = Object.values(songs).flat()[0];
  const [last, setLast] = useState<keyof typeof GESTURE_LABEL | null>(null);
  return (
    <>
      <View style={styles.stage}>
        <SwipeSurface
          onSwipeUp={() => setLast('up')}
          onSwipeLeft={() => setLast('left')}
          onSwipeRight={() => setLast('right')}
          onPress={() => setLast('tap')}>
          <GlassSurface style={styles.mini}>
            <Cover id={song?.coverArt} size="row" round style={styles.miniCover} />
            <View style={styles.flex}>
              <Text variant="subhead" numberOfLines={1} style={styles.bold}>
                {song?.title ?? 'Titre'}
              </Text>
              <Text variant="footnote" color="textSecondary" numberOfLines={1}>
                {song?.artist ?? 'Artiste'}
              </Text>
            </View>
            <PauseIcon size={22} color={colors.textPrimary} />
          </GlassSurface>
        </SwipeSurface>
      </View>
      <Text variant="headline" color={last ? 'accent' : 'textSecondary'} style={styles.center}>
        {last ? GESTURE_LABEL[last] : 'Glisse vers le haut, la gauche ou la droite'}
      </Text>
    </>
  );
}

function SwipeRowsDemo() {
  const songs = usePlaylistCacheStore(s => s.cachedPlaylistSongs);
  const list = Object.values(songs).flat().slice(0, 3);
  return (
    <View style={styles.bleed}>
      {list.map((s, i) => (
        <SwipeableRow
          key={s.id + i}
          actionLabel={i === 2 ? 'Retirer' : 'À la file'}
          actionIcon={
            i === 2 ? <CloseIcon size={18} color={colors.onAccent} /> : <QueueAddIcon size={20} color={colors.onAccent} />
          }
          destructive={i === 2}
          background={colors.surface1}
          onAction={() =>
            i === 2
              ? toast.show(`« ${s.title} » retiré`, {action: {label: 'Annuler', onPress: () => toast.success('Annulé')}})
              : toast.success(`« ${s.title} » ajouté à la file`)
          }>
          <TrackRow title={s.title} subtitle={s.artist} coverId={s.coverArt} hideActions />
        </SwipeableRow>
      ))}
    </View>
  );
}

function SheetsDemo() {
  const [short, setShort] = useState(false);
  const [long, setLong] = useState(false);
  const songs = usePlaylistCacheStore(s => s.cachedPlaylistSongs);
  const list = Object.values(songs).flat().slice(0, 30);
  return (
    <>
      <View style={styles.row}>
        <Button variant="tinted" label="Feuille courte" onPress={() => setShort(true)} style={styles.flex} />
        <Button variant="tinted" label="Feuille longue" onPress={() => setLong(true)} style={styles.flex} />
      </View>

      <Sheet visible={short} onClose={() => setShort(false)} title="Options du titre">
        <View style={styles.sheetBody}>
          <ListGroup raised>
            <ListItem label="Ajouter à la file" onPress={() => toast.success('Ajouté à la file')} />
            <ListItem label="Ajouter à une playlist" accessory="chevron" onPress={() => {}} />
            <ListItem label="Voir l'album" accessory="chevron" onPress={() => {}} />
          </ListGroup>
          <ListGroup raised>
            <ListItem label="Retirer de la playlist" destructive onPress={() => toast.error('Titre retiré')} />
          </ListGroup>
        </View>
      </Sheet>

      <Sheet visible={long} onClose={() => setLong(false)} title="Ajouter à une playlist" scrollable>
        <FlatList
          data={list}
          keyExtractor={(s, i) => s.id + i}
          initialNumToRender={8}
          renderItem={({item}) => (
            <TrackRow title={item.title} subtitle={item.artist} coverId={item.coverArt} hideActions />
          )}
        />
      </Sheet>
    </>
  );
}

function ToastsDemo() {
  return (
    <View style={styles.wrap}>
      <Button variant="tinted" label="Info" onPress={() => toast.show('Lecture sur ce téléphone')} />
      <Button variant="tinted" label="Succès" onPress={() => toast.success('Ajouté aux titres likés')} />
      <Button variant="tinted" label="Erreur" onPress={() => toast.error('Serveur injoignable')} />
      <Button
        variant="tinted"
        label="Avec action"
        onPress={() =>
          toast.show('Playlist supprimée', {action: {label: 'Annuler', onPress: () => toast.success('Restaurée')}})
        }
      />
    </View>
  );
}

export default function GesturesTab() {
  const navigation = useNavigation();
  return (
    <>
      <Section title="Mini-lecteur">
        <MiniPlayerDemo />
      </Section>

      <Section title="Glisser une ligne">
        <Text variant="footnote" color="textSecondary">
          Glisse vers la gauche : action à la fin du geste, avec une vibration au seuil.
        </Text>
        <SwipeRowsDemo />
      </Section>

      <Section title="Feuilles">
        <Text variant="footnote" color="textSecondary">
          Ferme en glissant vers le bas, en touchant le fond ou avec Retour.
        </Text>
        <SheetsDemo />
      </Section>

      <Section title="Messages">
        <ToastsDemo />
      </Section>

      <Section title="Grand titre">
        <Button
          variant="tinted"
          label="Ouvrir la démo"
          onPress={() => navigation.navigate('DesignHeaderTest' as never)}
        />
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  bold: {fontWeight: '600'},
  center: {textAlign: 'center'},
  row: {flexDirection: 'row', gap: spacing.s},
  wrap: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s},
  bleed: {marginHorizontal: -spacing.m},
  stage: {paddingVertical: spacing.l},
  mini: {
    height: 64,
    paddingHorizontal: spacing.s,
    paddingRight: spacing.m,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m - 4,
  },
  miniCover: {marginLeft: 2},
  sheetBody: {paddingHorizontal: spacing.m, gap: spacing.l},
});
