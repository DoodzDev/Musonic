/**
 * @file HeaderTest.tsx
 * @description Debug-only demo of the large-title header: a library-like
 *   screen whose large title gives way to a compact glass bar on scroll.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import Animated from 'react-native-reanimated';
import {
  LargeTitle,
  LargeTitleHeader,
  useLargeTitleInset,
  useLargeTitleScroll,
} from '../../components/ui/LargeTitleHeader';
import Button from '../../components/ui/Button';
import Chip from '../../components/ui/Chip';
import CollectionRow from '../../components/ui/CollectionRow';
import BackArrowIcon from '../../components/icons/BackArrowIcon';
import PlusCircleIcon from '../../components/icons/PlusCircleIcon';
import {usePlaylistCacheStore} from '../../store/playlistCacheStore';
import {colors, spacing} from '../../theme';

const TABS = ['Playlists', 'Albums', 'Artistes', 'Téléchargés'];

export default function HeaderTest() {
  const navigation = useNavigation();
  const playlists = usePlaylistCacheStore(s => s.cachedPlaylists);
  const {scrollY, onScroll} = useLargeTitleScroll();
  const top = useLargeTitleInset();
  const [tab, setTab] = useState(TABS[0]);
  // Repeat the list so there is enough to scroll even with few playlists.
  const rows = [...playlists, ...playlists, ...playlists];

  return (
    <View style={styles.root}>
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{paddingTop: top}}>
        <LargeTitle title="Bibliothèque" scrollY={scrollY} />
        <View style={styles.chips}>
          {TABS.map(t => (
            <Chip key={t} label={t} selected={tab === t} onPress={() => setTab(t)} />
          ))}
        </View>
        {rows.map((p, i) => (
          <CollectionRow
            key={`${p.id}-${i}`}
            kind="playlist"
            name={p.name}
            subtitle={`Playlist · ${p.songCount} titres`}
            coverId={p.coverArt}
            playlistId={p.id}
          />
        ))}
      </Animated.ScrollView>
      <LargeTitleHeader
        title="Bibliothèque"
        scrollY={scrollY}
        left={
          <Button
            variant="icon"
            accessibilityLabel="Retour"
            onPress={() => navigation.goBack()}
            icon={<BackArrowIcon size={22} color={colors.textPrimary} />}
            style={styles.transparent}
          />
        }
        right={
          <Button
            variant="icon"
            size={36}
            accessibilityLabel="Nouvelle playlist"
            icon={<PlusCircleIcon size={20} color={colors.accent} />}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.background},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s, paddingHorizontal: spacing.gutter, paddingBottom: spacing.m},
  transparent: {backgroundColor: 'transparent'},
});
