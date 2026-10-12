/**
 * @file ComponentsTab.tsx
 * @description "Components" tab of the Design screen: every Design v2
 *   component in its states, live and touchable.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React, {useMemo, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import Section from './DesignSection';
import Text from '../../components/ui/Text';
import Button from '../../components/ui/Button';
import Chip from '../../components/ui/Chip';
import SegmentedControl from '../../components/ui/SegmentedControl';
import SearchField from '../../components/ui/SearchField';
import Toggle from '../../components/ui/Toggle';
import Badge from '../../components/ui/Badge';
import SectionHeader from '../../components/ui/SectionHeader';
import PlayIcon from '../../components/icons/PlayIcon';
import HeartIcon from '../../components/icons/HeartIcon';
import PlusCircleIcon from '../../components/icons/PlusCircleIcon';
import DotsHorizontalIcon from '../../components/icons/DotsHorizontalIcon';
import SearchIcon from '../../components/icons/SearchIcon';
import CloudIcon from '../../components/icons/CloudIcon';
import Cover from '../../components/ui/Cover';
import ArtistAvatar from '../../components/ui/ArtistAvatar';
import TrackRow, {type RowPlayback} from '../../components/ui/TrackRow';
import CollectionRow from '../../components/ui/CollectionRow';
import CollectionCard from '../../components/ui/CollectionCard';
import {ListGroup, ListItem} from '../../components/ui/ListGroup';
import EmptyState from '../../components/ui/EmptyState';
import {SkeletonCard, SkeletonTrackRow} from '../../components/ui/Skeleton';
import {usePlaylistCacheStore} from '../../store/playlistCacheStore';
import {colors, sizes, spacing} from '../../theme';

const FILTERS = ['Tout', 'Playlists', 'Albums', 'Artistes'];

function ButtonsDemo() {
  const [liked, setLiked] = useState(false);
  return (
    <>
      <View style={styles.row}>
        <Button
          variant="tinted"
          label="Lecture"
          icon={<PlayIcon size={16} color={colors.accent} />}
          haptic="light"
          style={styles.flex}
        />
        <Button variant="filled" label="Se connecter" style={styles.flex} />
      </View>
      <View style={styles.rowCenter}>
        <Button variant="plain" label="Annuler" />
        <Button variant="tinted" label="Désactivé" disabled />
      </View>
      <View style={styles.rowCenter}>
        <Button
          variant="icon"
          size={36}
          accessibilityLabel={liked ? 'Retirer des titres likés' : 'Ajouter aux titres likés'}
          haptic="success"
          onPress={() => setLiked(l => !l)}
          icon={<HeartIcon size={18} color={liked ? colors.accent : colors.textPrimary} filled={liked} />}
        />
        <Button
          variant="icon"
          size={40}
          accessibilityLabel="Ajouter à une playlist"
          icon={<PlusCircleIcon size={20} color={colors.textPrimary} />}
        />
        <Button
          variant="icon"
          accessibilityLabel="Plus d'options"
          icon={<DotsHorizontalIcon size={20} color={colors.textPrimary} />}
        />
        <Text variant="footnote" color="textSecondary">
          36 · 40 · 44
        </Text>
      </View>
    </>
  );
}

function SelectionDemo() {
  const [filter, setFilter] = useState(FILTERS[0]);
  const [source, setSource] = useState<'all' | 'library'>('all');
  const [shuffle, setShuffle] = useState<'off' | 'on' | 'magic'>('off');
  return (
    <>
      <View style={styles.chips}>
        {FILTERS.map(f => (
          <Chip key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>
      <SegmentedControl
        options={[
          {value: 'all', label: 'Tout'},
          {value: 'library', label: 'Ma bibliothèque'},
        ]}
        value={source}
        onChange={setSource}
      />
      <SegmentedControl
        options={[
          {value: 'off', label: 'Désactivé'},
          {value: 'on', label: 'Aléatoire'},
          {value: 'magic', label: 'Magique'},
        ]}
        value={shuffle}
        onChange={setShuffle}
      />
    </>
  );
}

function SearchDemo() {
  const [query, setQuery] = useState('');
  return (
    <SearchField value={query} onChangeText={setQuery} placeholder="Artistes, titres, albums" />
  );
}

function TogglesDemo() {
  const [autoplay, setAutoplay] = useState(true);
  const [offline, setOffline] = useState(false);
  return (
    <>
      <View style={styles.toggleRow}>
        <Text variant="body" style={styles.flex}>
          Lecture automatique
        </Text>
        <Toggle
          value={autoplay}
          onValueChange={setAutoplay}
          accessibilityLabel="Lecture automatique"
        />
      </View>
      <View style={styles.toggleRow}>
        <Text variant="body" style={styles.flex}>
          Mode hors ligne
        </Text>
        <Toggle value={offline} onValueChange={setOffline} accessibilityLabel="Mode hors ligne" />
      </View>
      <View style={styles.toggleRow}>
        <Text variant="body" color="textSecondary" style={styles.flex}>
          Désactivé
        </Text>
        <Toggle value onValueChange={() => {}} disabled accessibilityLabel="Désactivé" />
      </View>
    </>
  );
}

/** Real songs and playlists already cached on the device, for lifelike demos. */
function useSamples() {
  const playlists = usePlaylistCacheStore(s => s.cachedPlaylists);
  const songsByPlaylist = usePlaylistCacheStore(s => s.cachedPlaylistSongs);
  return useMemo(() => {
    const songs = Object.values(songsByPlaylist).flat();
    return {playlists: playlists.slice(0, 6), songs: songs.slice(0, 6)};
  }, [playlists, songsByPlaylist]);
}

function CoversDemo() {
  const {songs} = useSamples();
  const id = songs[0]?.coverArt;
  return (
    <>
      <View style={styles.coverRow}>
        <Cover id={id} size="row" />
        <Cover id={id} size="tile" />
        <Cover id={songs[1]?.coverArt} size="card" />
      </View>
      <View style={styles.heroBox}>
        <Cover id={songs[2]?.coverArt ?? id} size="hero" tint={colors.accent} />
      </View>
      <View style={styles.coverRow}>
        <ArtistAvatar name={songs[0]?.artist ?? 'Nova Arden'} id={songs[0]?.artistId ? `ar-${songs[0].artistId}` : undefined} />
        <ArtistAvatar name="Les Saisons" size={64} />
      </View>
    </>
  );
}

function TrackRowsDemo() {
  const {songs} = useSamples();
  const [liked, setLiked] = useState(false);
  const [playback, setPlayback] = useState<RowPlayback>('playing');
  const s = (i: number) => songs[i] ?? songs[0];
  const title = (i: number) => s(i)?.title ?? 'Titre de démonstration';
  const artist = (i: number) => s(i)?.artist ?? 'Artiste';
  return (
    <View style={styles.bleed}>
      <TrackRow
        title={title(0)}
        subtitle={artist(0)}
        coverId={s(0)?.coverArt}
        playback={playback}
        liked={liked}
        download="done"
        onPress={() => setPlayback(p => (p === 'playing' ? 'current' : 'playing'))}
        onToggleLike={() => setLiked(l => !l)}
      />
      <TrackRow title={title(1)} subtitle={artist(1)} coverId={s(1)?.coverArt} badges={['online']} />
      <TrackRow title={title(2)} subtitle={artist(2)} coverId={s(2)?.coverArt} badges={['magic']} download="downloading" />
      <TrackRow title={title(3)} subtitle={artist(3)} coverId={s(3)?.coverArt} unavailable />
      <TrackRow number={1} title={title(4)} subtitle="3:58" liked />
      <TrackRow number={2} title={title(5)} subtitle="4:12" playback="current" />
    </View>
  );
}

function CollectionsDemo() {
  const {playlists} = useSamples();
  return (
    <>
      <View style={styles.bleed}>
        {playlists.slice(0, 2).map(p => (
          <CollectionRow
            key={p.id}
            kind="playlist"
            name={p.name}
            subtitle={`Playlist · ${p.songCount} titres`}
            coverId={p.coverArt}
            playlistId={p.id}
            badges={['downloaded']}
          />
        ))}
        <CollectionRow kind="artist" name="Nova Arden" subtitle="Artiste · 3 albums" />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
        {playlists.map(p => (
          <CollectionCard
            key={p.id}
            kind="playlist"
            name={p.name}
            subtitle={`${p.songCount} titres`}
            coverId={p.coverArt}
            playlistId={p.id}
          />
        ))}
        <CollectionCard kind="artist" name="Les Saisons" subtitle="Artiste" />
      </ScrollView>
    </>
  );
}

function ListGroupDemo() {
  const [autoplay, setAutoplay] = useState(true);
  return (
    <>
      <ListGroup caption="Lecture" note="La lecture automatique ajoute des titres similaires à la fin de la file.">
        <ListItem label="Lecture automatique" toggle={{value: autoplay, onValueChange: setAutoplay}} />
        <ListItem label="Fondu enchaîné" value="4 s" accessory="chevron" onPress={() => {}} />
        <ListItem label="Langue" value="Français" accessory="chevron" onPress={() => {}} />
      </ListGroup>
      <ListGroup>
        <ListItem label="Se déconnecter" destructive onPress={() => {}} />
      </ListGroup>
    </>
  );
}

export default function ComponentsTab() {
  const navigation = useNavigation();
  return (
    <>
      <Section title="Boutons">
        <ButtonsDemo />
      </Section>

      <Section title="Filtres et sélecteurs">
        <SelectionDemo />
      </Section>

      <Section title="Recherche">
        <SearchDemo />
      </Section>

      <Section title="Interrupteurs">
        <TogglesDemo />
      </Section>

      <Section title="Badges">
        <View style={styles.chips}>
          <Badge kind="online" />
          <Badge kind="magic" />
          <Badge kind="downloaded" />
          <Badge kind="lossless" />
        </View>
        <View style={styles.chips}>
          <Badge kind="online" size="small" />
          <Badge kind="magic" size="small" />
          <Badge kind="downloaded" size="small" />
          <Badge kind="lossless" size="small" />
        </View>
      </Section>

      <Section title="Pochettes et artistes">
        <CoversDemo />
      </Section>

      <Section title="Lignes de titre">
        <Text variant="footnote" color="textSecondary">
          Touche la 1re ligne : lecture / pause. Le cœur se like.
        </Text>
        <TrackRowsDemo />
        <Button
          variant="tinted"
          label="Test de fluidité : 500 lignes"
          onPress={() => navigation.navigate('DesignTrackList' as never)}
        />
      </Section>

      <Section title="Collections">
        <CollectionsDemo />
      </Section>

      <Section title="Listes groupées">
        <ListGroupDemo />
      </Section>

      <Section title="État vide">
        <EmptyState
          icon={<SearchIcon size={40} color={colors.textSecondary} />}
          title="Aucun résultat"
          message="Essaie un autre mot, ou cherche dans tout le catalogue en ligne."
          action={{label: 'Chercher partout', onPress: () => {}}}
        />
        <EmptyState
          icon={<CloudIcon size={40} color={colors.textSecondary} />}
          title="Hors ligne"
          message="Seuls tes titres téléchargés sont disponibles."
        />
      </Section>

      <Section title="Chargement">
        <View style={styles.bleed}>
          <SkeletonTrackRow />
          <SkeletonTrackRow />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </ScrollView>
      </Section>

      <Section title="En-têtes de section">
        <SectionHeader title="Écoutés récemment" onSeeAll={() => {}} />
        <SectionHeader title="Pour vous" subtitle="D'après Nova Arden et Les Saisons" />
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  row: {flexDirection: 'row', gap: spacing.s},
  rowCenter: {flexDirection: 'row', alignItems: 'center', gap: spacing.m},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s},
  coverRow: {flexDirection: 'row', alignItems: 'flex-end', gap: spacing.m},
  heroBox: {alignItems: 'center', paddingVertical: spacing.l},
  /** Rows carry their own 20 pt gutter: cancel the card padding. */
  bleed: {marginHorizontal: -spacing.m},
  carousel: {gap: spacing.m - 2},
  toggleRow: {
    minHeight: sizes.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
  },
});
