/**
 * @file DetailScaffold.tsx
 * @description Layout shared by the Design v2 detail pages (album, playlist,
 *   artist, Magic Mix). Portrait: the hero scrolls with the list, under the
 *   pinned top bar (Back, actions, title fading in once the hero is gone),
 *   over a wash of the cover's colour. Landscape: the hero sits in a fixed
 *   column on the left (with Back and the actions on top) and only the list
 *   scrolls, on the right, so the tracks are visible at once, under a frosted
 *   strip that keeps them off the status bar.
 * @author DoodzProg
 * @version 1.3.0
 * @license CC-BY-NC-4.0
 */
import React, {useCallback, useMemo, useRef} from 'react';
import {ScrollView, StyleSheet, View, type ListRenderItem} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import {useNavigation} from '@react-navigation/native';
import {useLargeTitleScroll} from '../ui/LargeTitleHeader';
import {SkeletonList} from '../ui/Skeleton';
import GlassSurface from '../ui/GlassSurface';
import {CoverBackdrop, DETAIL_BAR_HEIGHT, DetailTopBar, GlassButton} from './DetailParts';
import {BackArrowIcon} from '../icons';
import {useIsLandscape} from '../../hooks/useIsLandscape';
import {useLandscapeSidebarPadding} from '../../hooks/useLandscapeSidebarPadding';
import {useDockInset} from '../../navigation/dockLayout';
import {colors, spacing} from '../../theme';
import {useT} from '../../i18n';

/** Width of the fixed hero column in landscape (264 of content between the gutters). */
const SIDE_WIDTH = 264 + 2 * spacing.gutter;
/** Fade below the status bar in landscape. */
const STATUS_FADE = 16;

type Props<T> = {
  /** Shown in the top bar once the hero has scrolled away. */
  title: string;
  /** Cover whose colour tints the top of the page. */
  coverId?: string;
  /** Fixed tint instead of the cover's colour. */
  tint?: string;
  /** Actions at the top right (round glass buttons). */
  topRight?: React.ReactNode;
  /** Hero above the list in portrait. */
  hero: React.ReactNode;
  /** Hero column on the left in landscape; defaults to `hero`. */
  side?: React.ReactNode;
  /** Scroll offset at which the hero's title is under the bar (portrait). */
  showTitleAt: number;
  data: readonly T[];
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T, index: number) => string;
  /** Under the list (summary, recommendations…). */
  footer?: React.ReactNode;
  loading?: boolean;
  /** Shown instead of the list when it is empty and not loading. */
  empty?: React.ReactNode;
  /** Portrait: the hero starts at the very top, under the status bar (artist photo). */
  fullBleed?: boolean;
  /** Ref of the list, to jump to a row (`scrollToIndex`, needs `itemHeight`). */
  listRef?: React.Ref<any>;
  /** Fixed height of each row: the list then knows every offset without measuring (long lists, jumps). */
  itemHeight?: (item: T) => number;
};

export default function DetailScaffold<T>({
  title,
  coverId,
  tint,
  topRight,
  hero,
  side,
  showTitleAt,
  data,
  renderItem,
  keyExtractor,
  footer,
  loading,
  empty,
  fullBleed = false,
  listRef,
  itemHeight,
}: Props<T>) {
  const t = useT();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const isLandscape = useIsLandscape();
  const landscapePadding = useLandscapeSidebarPadding();
  const dockInset = useDockInset();
  const {scrollY, onScroll} = useLargeTitleScroll();
  const goBack = () => navigation.goBack();

  const topPadding = fullBleed ? 0 : insets.top + DETAIL_BAR_HEIGHT + spacing.s;
  const heroHeight = useRef(0);
  const rowOffsets = useMemo(() => {
    if (!itemHeight) return null;
    const out: number[] = [];
    let y = 0;
    for (const item of data) {
      out.push(y);
      y += itemHeight(item);
    }
    return out;
  }, [data, itemHeight]);
  // Offsets in the scroll content, like the measured ones: padding and hero included.
  const getItemLayout = useCallback((_: unknown, index: number) => {
    const base = isLandscape ? insets.top + spacing.s : topPadding + heroHeight.current;
    return {length: itemHeight!(data[index]), offset: base + rowOffsets![index], index};
  }, [isLandscape, insets.top, topPadding, itemHeight, data, rowOffsets]);
  const layoutProps = rowOffsets ? {getItemLayout} : {};

  // Rows shaped like the real ones while loading, rather than a spinner (R5.10).
  const listEmpty = loading ? <SkeletonList /> : <>{empty}</>;

  if (isLandscape) {
    return (
      <View style={[styles.root, styles.row, landscapePadding]}>
        <CoverBackdrop coverId={coverId} tint={tint} height={360} />
        <ScrollView
          style={styles.side}
          contentContainerStyle={[styles.sideContent, {paddingTop: insets.top + spacing.s, paddingBottom: dockInset + spacing.m}]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.sideBar}>
            <GlassButton icon={<BackArrowIcon size={20} color={colors.textPrimary} />} onPress={goBack} accessibilityLabel={t.common.back} />
            <View style={styles.sideRight}>{topRight}</View>
          </View>
          {side ?? hero}
        </ScrollView>
        <Animated.FlatList
          ref={listRef}
          {...layoutProps}
          style={styles.list}
          data={data as T[]}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListFooterComponent={<>{footer}</>}
          ListEmptyComponent={listEmpty}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{paddingTop: insets.top + spacing.s, paddingBottom: dockInset + spacing.m}}
        />
        {/* Frosted strip under the status bar, so rows never scroll under the clock. */}
        <View pointerEvents="none" style={[styles.statusFade, {height: insets.top + STATUS_FADE}]}>
          <GlassSurface variant="fade" solidRatio={insets.top / (insets.top + STATUS_FADE)} style={StyleSheet.absoluteFill} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, landscapePadding]}>
      {fullBleed ? null : <CoverBackdrop coverId={coverId} tint={tint} />}
      <Animated.FlatList
        ref={listRef}
        {...layoutProps}
        data={data as T[]}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={rowOffsets ? <View onLayout={e => { heroHeight.current = e.nativeEvent.layout.height; }}>{hero}</View> : <>{hero}</>}
        ListFooterComponent={<>{footer}</>}
        ListEmptyComponent={listEmpty}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{paddingTop: topPadding, paddingBottom: dockInset + spacing.m}}
      />
      <DetailTopBar title={title} scrollY={scrollY} showAt={showTitleAt} onBack={goBack} right={topRight} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.background},
  row: {flexDirection: 'row'},
  side: {width: SIDE_WIDTH, flexGrow: 0},
  sideContent: {paddingHorizontal: spacing.gutter},
  sideBar: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.m},
  sideRight: {flexDirection: 'row', gap: spacing.s},
  list: {flex: 1},
  statusFade: {position: 'absolute', top: 0, left: 0, right: 0},
});
