/**
 * @file index.tsx
 * @description Design screen, debug builds only. Shows every Design v2 token
 *   (colours, type scale, radii, spacing, shadows, glass, motion, haptics) and
 *   the icon set, rendered on the device, plus pressables to try the animations and
 *   vibrations by hand: the app's internal design reference. Reached from the
 *   drawer in Musonic Dev.
 * @author DoodzProg
 * @version 1.2.0
 * @license CC-BY-NC-4.0
 */
import React, {useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import BackArrowIcon from '../../components/icons/BackArrowIcon';
import ChevronDownIcon from '../../components/icons/ChevronDownIcon';
import CloseIcon from '../../components/icons/CloseIcon';
import DotsHorizontalIcon from '../../components/icons/DotsHorizontalIcon';
import DotsVerticalIcon from '../../components/icons/DotsVerticalIcon';
import DownloadIcon from '../../components/icons/DownloadIcon';
import HeartIcon from '../../components/icons/HeartIcon';
import HomeIcon from '../../components/icons/HomeIcon';
import LibraryIcon from '../../components/icons/LibraryIcon';
import NextIcon from '../../components/icons/NextIcon';
import PauseIcon from '../../components/icons/PauseIcon';
import PersonIcon from '../../components/icons/PersonIcon';
import PlayIcon from '../../components/icons/PlayIcon';
import PrevIcon from '../../components/icons/PrevIcon';
import PlusCircleIcon from '../../components/icons/PlusCircleIcon';
import ProfileIcon from '../../components/icons/ProfileIcon';
import QueueAddIcon from '../../components/icons/QueueAddIcon';
import RepeatIcon from '../../components/icons/RepeatIcon';
import SearchIcon from '../../components/icons/SearchIcon';
import ShuffleIcon from '../../components/icons/ShuffleIcon';
import ShuffleMagicIcon from '../../components/icons/ShuffleMagicIcon';
import TrackMagicIcon from '../../components/icons/TrackMagicIcon';
import CheckCircleGreenIcon from '../../components/icons/CheckCircleGreenIcon';
import CloudIcon from '../../components/icons/CloudIcon';
import SparkleIcon from '../../components/icons/SparkleIcon';
import InfinityIcon from '../../components/icons/InfinityIcon';
import Text from '../../components/ui/Text';
import PressableScale from '../../components/ui/PressableScale';
import GlassSurface from '../../components/ui/GlassSurface';
import {haptic, type HapticKind} from '../../services/haptics';
import {useSettingsStore} from '../../store/settingsStore';
import {
  colors,
  spacing,
  radii,
  sizes,
  typography,
  shadows,
  heroShadow,
  springs,
  COVER_PAUSED_SCALE,
  GLASS_BLUR,
  type TextVariant,
} from '../../theme';

const TYPE_SAMPLES = Object.keys(typography) as TextVariant[];

const COLOR_ENTRIES = Object.entries(colors) as [keyof typeof colors, string][];

const RADIUS_ENTRIES = Object.entries(radii);

const SPACING_ENTRIES = Object.entries(spacing);

function Section({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <View style={styles.section}>
      <Text variant="title2">{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function CoverDemo() {
  const [playing, setPlaying] = useState(true);
  const scale = useSharedValue(1);
  const coverStyle = useAnimatedStyle(() => ({transform: [{scale: scale.value}]}));

  const toggle = () => {
    const next = !playing;
    setPlaying(next);
    scale.value = withSpring(next ? 1 : COVER_PAUSED_SCALE, springs.cover);
  };

  return (
    <View style={styles.demoRow}>
      <Animated.View style={[styles.cover, heroShadow(colors.accent), coverStyle]} />
      <PressableScale style={[styles.secondaryButton, styles.flex]} onPress={toggle}>
        <Text variant="headline" color="accent">
          {playing ? 'Pause' : 'Lecture'}
        </Text>
      </PressableScale>
    </View>
  );
}

const GLASS_STAGE_HEIGHT = 160;

const GLASS_BACKDROP = [colors.accent, colors.success, colors.destructive, colors.textPrimary, colors.accent];

function GlassDemo() {
  return (
    <View style={styles.glassStage}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {GLASS_BACKDROP.map((color, i) => (
          <View key={i} style={[styles.glassBlock, {backgroundColor: color}]}>
            <Text variant="title1" style={styles.glassBlockText}>
              Musonic
            </Text>
          </View>
        ))}
      </ScrollView>
      <GlassSurface style={styles.glassCapsule} pointerEvents="none">
        <Text variant="headline">Verre flottant</Text>
        <Text variant="footnote" color="textSecondary">
          blur {GLASS_BLUR}
        </Text>
      </GlassSurface>
    </View>
  );
}

const ICON_SIZE = 28;

/** Every icon of the set, drawn the same size and colour to compare strokes. */
const ICONS: {name: string; render: () => React.ReactNode}[] = [
  {name: 'BackArrow', render: () => <BackArrowIcon size={ICON_SIZE} color={colors.textPrimary} />},
  {name: 'ChevronDown', render: () => <ChevronDownIcon size={ICON_SIZE} color={colors.textPrimary} />},
  {name: 'Close', render: () => <CloseIcon size={ICON_SIZE} color={colors.textPrimary} />},
  {name: 'DotsH', render: () => <DotsHorizontalIcon size={ICON_SIZE} color={colors.textPrimary} />},
  {name: 'DotsV', render: () => <DotsVerticalIcon size={ICON_SIZE} color={colors.textPrimary} />},
  {name: 'Download', render: () => <DownloadIcon size={ICON_SIZE} color={colors.textPrimary} />},
  {name: 'Heart', render: () => <HeartIcon size={ICON_SIZE} color={colors.textPrimary} />},
  {name: 'Heart plein', render: () => <HeartIcon size={ICON_SIZE} color={colors.accent} filled />},
  {name: 'Home', render: () => <HomeIcon size={ICON_SIZE} color={colors.textPrimary} />},
  {name: 'Library', render: () => <LibraryIcon size={ICON_SIZE} color={colors.textPrimary} />},
  {name: 'Search', render: () => <SearchIcon size={ICON_SIZE} color={colors.textPrimary} />},
  {name: 'Play', render: () => <PlayIcon size={ICON_SIZE} color={colors.textPrimary} />},
  {name: 'Pause', render: () => <PauseIcon size={ICON_SIZE} color={colors.textPrimary} />},
  {name: 'Prev', render: () => <PrevIcon size={ICON_SIZE} color={colors.textPrimary} />},
  {name: 'Next', render: () => <NextIcon size={ICON_SIZE} color={colors.textPrimary} />},
  {name: 'Shuffle', render: () => <ShuffleIcon size={ICON_SIZE} color={colors.textPrimary} />},
  {name: 'ShuffleMagic', render: () => <ShuffleMagicIcon size={ICON_SIZE} />},
  {name: 'Repeat', render: () => <RepeatIcon size={ICON_SIZE} color={colors.textPrimary} />},
  {name: 'QueueAdd', render: () => <QueueAddIcon size={ICON_SIZE} color={colors.textPrimary} />},
  {name: 'PlusCircle', render: () => <PlusCircleIcon size={ICON_SIZE} color={colors.textPrimary} />},
  {name: 'Person', render: () => <PersonIcon size={ICON_SIZE} color={colors.textPrimary} />},
  {name: 'Profile', render: () => <ProfileIcon size={ICON_SIZE} color={colors.textPrimary} />},
  {name: 'TrackMagic', render: () => <TrackMagicIcon size={ICON_SIZE} />},
  {name: 'CheckCircle', render: () => <CheckCircleGreenIcon size={ICON_SIZE} />},
  {name: 'Cloud', render: () => <CloudIcon size={ICON_SIZE} color={colors.textPrimary} />},
  {name: 'Sparkle', render: () => <SparkleIcon size={ICON_SIZE} color={colors.accent} />},
  {name: 'Infinity', render: () => <InfinityIcon size={ICON_SIZE} color={colors.textPrimary} />},
];

/** Badge marking online-catalogue content, in place of the "Deezer" name. */
const SOURCE_BADGE = 'En ligne';

function SourceBadge({label}: {label: string}) {
  return (
    <View style={styles.badge}>
      <CloudIcon size={12} color={colors.textPrimary} />
      <Text variant="caption">{label}</Text>
    </View>
  );
}

function BadgeRow({label}: {label: string}) {
  return (
    <View style={styles.trackRow}>
      <View style={styles.trackCover} />
      <View style={styles.flex}>
        <Text variant="body" numberOfLines={1}>
          Titre de démonstration
        </Text>
        <View style={styles.trackMeta}>
          <SourceBadge label={label} />
          <Text variant="subhead" color="textSecondary" numberOfLines={1}>
            Artiste
          </Text>
        </View>
      </View>
    </View>
  );
}

const HAPTIC_DEMOS: {kind: HapticKind; label: string}[] = [
  {kind: 'light', label: 'Légère'},
  {kind: 'selection', label: 'Sélection'},
  {kind: 'success', label: 'Succès'},
  {kind: 'warning', label: 'Alerte'},
];

const SHEET_HEIGHT = 96;

function SheetDemo() {
  const [open, setOpen] = useState(false);
  const offset = useSharedValue(SHEET_HEIGHT);
  const sheetStyle = useAnimatedStyle(() => ({transform: [{translateY: offset.value}]}));

  const toggle = () => {
    const next = !open;
    setOpen(next);
    offset.value = withSpring(next ? 0 : SHEET_HEIGHT, springs.sheet);
  };

  return (
    <>
      <View style={styles.sheetStage}>
        <Animated.View style={[styles.sheet, sheetStyle]}>
          <Text variant="footnote" color="textSecondary">
            Feuille · spring {springs.sheet.damping}/{springs.sheet.stiffness}
          </Text>
        </Animated.View>
      </View>
      <PressableScale style={styles.secondaryButton} onPress={toggle}>
        <Text variant="headline" color="accent">
          {open ? 'Fermer la feuille' : 'Ouvrir la feuille'}
        </Text>
      </PressableScale>
    </>
  );
}

export default function DesignScreen() {
  const navigation = useNavigation();
  const reducedMotion = useReducedMotion();
  const hapticsEnabled = useSettingsStore(s => s.hapticsEnabled);
  const setHapticsEnabled = useSettingsStore(s => s.setHapticsEnabled);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <PressableScale
          style={styles.iconButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Retour">
          <BackArrowIcon size={24} color={colors.textPrimary} />
        </PressableScale>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="caption" color="accent">
          MUSONIC DEV · DESIGN V2
        </Text>
        <Text variant="largeTitle">Design</Text>

        <Section title="Couleurs">
          <View style={styles.grid}>
            {COLOR_ENTRIES.map(([name, value]) => (
              <View key={name} style={styles.swatchRow}>
                <View style={[styles.swatch, {backgroundColor: value}]} />
                <View style={styles.flex}>
                  <Text variant="subhead">{name}</Text>
                  <Text variant="caption" color="textSecondary" numberOfLines={1}>
                    {value}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Typographie">
          {TYPE_SAMPLES.map(variant => {
            const t = typography[variant];
            return (
              <View key={variant} style={styles.typeRow}>
                <Text variant={variant} numberOfLines={1} style={styles.flex}>
                  {variant}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {t.fontSize}/{t.lineHeight} · {t.fontWeight}
                </Text>
              </View>
            );
          })}
        </Section>

        <Section title="Rayons">
          <View style={styles.radiusRow}>
            {RADIUS_ENTRIES.map(([name, value]) => (
              <View key={name} style={styles.radiusItem}>
                <View style={[styles.radiusBox, {borderRadius: value}]} />
                <Text variant="caption">{value === radii.full ? 'plein' : value}</Text>
                <Text variant="caption" color="textSecondary">
                  {name}
                </Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Espacements">
          {SPACING_ENTRIES.map(([name, value]) => (
            <View key={name} style={styles.spacingRow}>
              <Text variant="footnote" color="textSecondary" style={styles.spacingLabel}>
                {name} · {value}
              </Text>
              <View style={[styles.spacingBar, {width: value * 4}]} />
            </View>
          ))}
        </Section>

        <Section title="Ombres">
          <View style={styles.shadowRow}>
            <View style={[styles.shadowBox, shadows.card]}>
              <Text variant="footnote">Carte</Text>
            </View>
            <View style={[styles.shadowBox, heroShadow(colors.accent)]}>
              <Text variant="footnote">Pochette</Text>
            </View>
          </View>
        </Section>

        <Section title="Verre">
          <Text variant="footnote" color="textSecondary">
            Fais défiler les couleurs : le flou suit le contenu.
          </Text>
          <GlassDemo />
        </Section>

        <Section title="Icônes">
          <View style={styles.iconGrid}>
            {ICONS.map(({name, render}) => (
              <View key={name} style={styles.iconCell}>
                {render()}
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {name}
                </Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Badge de source">
          <BadgeRow label={SOURCE_BADGE} />
        </Section>

        <Section title="Vibrations">
          <View style={styles.hapticGrid}>
            {HAPTIC_DEMOS.map(({kind, label}) => (
              <PressableScale
                key={kind}
                style={[styles.secondaryButton, styles.hapticButton]}
                onPress={() => haptic(kind)}>
                <Text variant="headline" color="accent">
                  {label}
                </Text>
              </PressableScale>
            ))}
          </View>
          <PressableScale
            style={[styles.secondaryButton, hapticsEnabled ? null : styles.dimmed]}
            haptic="selection"
            onPress={() => setHapticsEnabled(!hapticsEnabled)}>
            <Text variant="headline">
              Vibrations Musonic : {hapticsEnabled ? 'activées' : 'désactivées'}
            </Text>
          </PressableScale>
        </Section>

        <Section title="Mouvement">
          <Text variant="footnote" color="textSecondary">
            Réduire les animations : {reducedMotion ? 'activé' : 'désactivé'}
          </Text>
          <View style={styles.buttonRow}>
            <PressableScale style={[styles.primaryButton, styles.flex]}>
              <Text variant="headline" color="onAccent">
                Se connecter
              </Text>
            </PressableScale>
            <PressableScale style={[styles.secondaryButton, styles.flex]}>
              <Text variant="headline" color="accent">
                Lecture
              </Text>
            </PressableScale>
          </View>
          <View style={styles.chipRow}>
            <PressableScale style={[styles.chip, styles.chipActive]}>
              <Text variant="subhead" style={styles.chipActiveText}>
                Tout
              </Text>
            </PressableScale>
            <PressableScale style={styles.chip}>
              <Text variant="subhead">Playlists</Text>
            </PressableScale>
            <PressableScale style={styles.chip}>
              <Text variant="subhead">Albums</Text>
            </PressableScale>
          </View>
          <CoverDemo />
          <SheetDemo />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.background},
  header: {paddingHorizontal: spacing.s},
  iconButton: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.xxxl,
    gap: spacing.xs,
  },
  section: {marginTop: spacing.l, gap: spacing.s},
  card: {
    backgroundColor: colors.surface1,
    borderRadius: radii.card,
    padding: spacing.m,
    gap: spacing.m,
  },
  flex: {flex: 1},
  grid: {flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.m},
  swatchRow: {width: '50%', flexDirection: 'row', alignItems: 'center', gap: spacing.s},
  swatch: {
    width: 40,
    height: 40,
    borderRadius: radii.tile,
    borderWidth: sizes.hairline,
    borderColor: colors.separator,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.s,
    paddingBottom: spacing.s,
    borderBottomWidth: sizes.hairline,
    borderBottomColor: colors.separator,
  },
  radiusRow: {flexDirection: 'row', justifyContent: 'space-between'},
  radiusItem: {alignItems: 'center', gap: spacing.xs},
  radiusBox: {
    width: 44,
    height: 44,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  spacingRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.s},
  spacingLabel: {width: 96},
  spacingBar: {height: spacing.s, borderRadius: radii.full, backgroundColor: colors.accent},
  shadowRow: {flexDirection: 'row', gap: spacing.m, paddingVertical: spacing.m},
  shadowBox: {
    flex: 1,
    height: 96,
    borderRadius: radii.button,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassStage: {
    height: GLASS_STAGE_HEIGHT,
    borderRadius: radii.tile,
    overflow: 'hidden',
  },
  glassBlock: {
    width: 120,
    height: GLASS_STAGE_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glassBlockText: {color: colors.background},
  glassCapsule: {
    position: 'absolute',
    left: spacing.m,
    right: spacing.m,
    bottom: spacing.m,
    height: 56,
    paddingHorizontal: spacing.gutter,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconGrid: {flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.m},
  iconCell: {width: '25%', alignItems: 'center', gap: spacing.xs},
  badge: {
    height: 20,
    paddingHorizontal: spacing.s,
    borderRadius: radii.full,
    backgroundColor: colors.fill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  trackRow: {
    minHeight: sizes.listRowMin,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
  },
  trackCover: {
    width: 48,
    height: 48,
    borderRadius: radii.cover,
    backgroundColor: colors.surface2,
  },
  trackMeta: {flexDirection: 'row', alignItems: 'center', gap: spacing.s},
  hapticGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s},
  hapticButton: {flexGrow: 1, flexBasis: '40%'},
  dimmed: {opacity: 0.5},
  buttonRow: {flexDirection: 'row', gap: spacing.s},
  primaryButton: {
    height: 48,
    borderRadius: radii.button,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    height: 48,
    borderRadius: radii.button,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: {flexDirection: 'row', gap: spacing.s},
  chip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: radii.full,
    backgroundColor: colors.fill,
    justifyContent: 'center',
  },
  chipActive: {backgroundColor: colors.textPrimary},
  chipActiveText: {color: colors.background, fontWeight: '600'},
  demoRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.m},
  cover: {
    width: 96,
    height: 96,
    borderRadius: radii.button,
    backgroundColor: colors.accent,
  },
  sheetStage: {
    height: SHEET_HEIGHT + spacing.l,
    borderRadius: radii.tile,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SHEET_HEIGHT,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    paddingTop: spacing.s,
  },
});
