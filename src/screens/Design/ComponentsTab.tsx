/**
 * @file ComponentsTab.tsx
 * @description "Components" tab of the Design screen: every Design v2
 *   component in its states, live and touchable.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
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

export default function ComponentsTab() {
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
  toggleRow: {
    minHeight: sizes.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
  },
});
