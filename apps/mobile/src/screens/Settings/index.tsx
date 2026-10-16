/**
 * @file index.tsx
 * @description Settings screen (Design v2, R5.8). Large title, then inset
 *   grouped lists (shared `ListGroup`): Language, Player, Downloads, Offline,
 *   Display, About. Each setting explains itself under its name; the visual
 *   choices (progress bar style, landscape navigation bar side, landscape
 *   player layout) show a small preview of each option.
 * @author DoodzProg
 * @version 2.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useState} from 'react';
import {ActivityIndicator, Alert, StatusBar, StyleSheet, View} from 'react-native';
import Animated from 'react-native-reanimated';
import {useNavigation} from '@react-navigation/native';
import Svg, {Circle, Path, Rect} from 'react-native-svg';
import Slider from '@react-native-community/slider';
import {useShallow} from 'zustand/react/shallow';
import {LargeTitle, LargeTitleHeader, useLargeTitleInset, useLargeTitleScroll} from '../../components/ui/LargeTitleHeader';
import {ListGroup, ListItem} from '../../components/ui/ListGroup';
import SegmentedControl from '../../components/ui/SegmentedControl';
import PressableScale from '../../components/ui/PressableScale';
import Button from '../../components/ui/Button';
import Text from '../../components/ui/Text';
import {BackArrowIcon} from '../../components/icons';
import {checkForUpdate} from '../../services/updateChecker';
import {useSettingsStore} from '../../store/settingsStore';
import {useLandscapeSidebarPadding} from '../../hooks/useLandscapeSidebarPadding';
import {useDockInset} from '../../navigation/dockLayout';
import {colors, radii, spacing} from '../../theme';
import {useT} from '../../i18n';
import {version as APP_VERSION} from '../../../package.json';

// ─── Previews ─────────────────────────────────────────────────────────────────

const OFF = colors.textSecondary;

function ProgressPreview({waveform, active}: {waveform: boolean; active: boolean}) {
  const on = active ? colors.accent : colors.textPrimary;
  if (!waveform) {
    return (
      <Svg width="100%" height={30} viewBox="0 0 100 30">
        <Path d="M10 15 L50 15" stroke={on} strokeWidth={3} strokeLinecap="round" />
        <Path d="M50 15 L90 15" stroke={OFF} strokeOpacity={0.5} strokeWidth={3} strokeLinecap="round" />
        <Circle cx="50" cy="15" r="5" fill={on} />
      </Svg>
    );
  }
  // Bars share one bottom baseline, like the real waveform scrubber.
  const bars = [[20, 10], [28, 20], [36, 6], [44, 26], [52, 14], [60, 2], [68, 18], [76, 8]];
  return (
    <Svg width="100%" height={30} viewBox="0 0 100 30">
      {bars.map(([x, h], i) => (
        <Rect key={x} x={x} y={28 - h} width={3} height={h} rx={1.5} fill={i < 5 ? on : OFF} fillOpacity={i < 5 ? 1 : 0.5} />
      ))}
    </Svg>
  );
}

/** A landscape screen with the bar (or the player cover) on one side. */
function SidePreview({right, player, active}: {right: boolean; player?: boolean; active: boolean}) {
  const color = active ? colors.accent : OFF;
  if (player) {
    const coverX = right ? 27 : 3;
    const barsX = right ? 3 : 27;
    return (
      <Svg width={44} height={28} viewBox="0 0 44 28">
        <Rect x={1} y={1} width={42} height={26} rx={3} stroke={color} strokeWidth={1.5} fill="none" />
        <Rect x={coverX} y={5} width={14} height={18} rx={2} fill={color} />
        <Rect x={barsX} y={8} width={14} height={3} rx={1.5} fill={color} />
        <Rect x={barsX} y={14} width={14} height={3} rx={1.5} fill={color} />
        <Rect x={barsX} y={20} width={14} height={3} rx={1.5} fill={color} />
      </Svg>
    );
  }
  return (
    <Svg width={44} height={28} viewBox="0 0 44 28">
      <Rect x={1} y={1} width={42} height={26} rx={3} stroke={color} strokeWidth={1.5} fill="none" />
      <Rect x={right ? 33 : 1} y={1} width={10} height={26} rx={2} fill={color} />
    </Svg>
  );
}

/** Two options side by side, each with its preview. */
function Choices<T extends string>({options, value, onChange, renderPreview}: {
  options: {value: T; label: string}[];
  value: T;
  onChange: (value: T) => void;
  renderPreview: (value: T, active: boolean) => React.ReactNode;
}) {
  return (
    <View style={styles.choices}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <PressableScale
            key={o.value}
            onPress={() => onChange(o.value)}
            haptic="selection"
            accessibilityLabel={o.label}
            accessibilityState={{selected: active}}
            style={[styles.choice, active && styles.choiceActive]}>
            {renderPreview(o.value, active)}
            <Text variant="footnote" style={[styles.choiceLabel, active && styles.choiceLabelActive]}>{o.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** A setting whose control sits under its name (choices, slider). */
function Block({label, description, children}: {label: string; description?: string; children: React.ReactNode}) {
  return (
    <View style={styles.block}>
      <Text variant="body">{label}</Text>
      {description ? <Text variant="footnote" color="textSecondary">{description}</Text> : null}
      <View style={styles.blockControl}>{children}</View>
    </View>
  );
}

const progressPreview = (v: 'classic' | 'waveform', active: boolean) => <ProgressPreview waveform={v === 'waveform'} active={active} />;
const navBarPreview = (v: 'left' | 'right', active: boolean) => <SidePreview right={v === 'right'} active={active} />;
const playerPreview = (v: 'left' | 'right', active: boolean) => <SidePreview player right={v === 'right'} active={active} />;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const t = useT();
  const navigation = useNavigation();
  const {scrollY, onScroll} = useLargeTitleScroll();
  const top = useLargeTitleInset();
  const dockInset = useDockInset();
  const landscapePadding = useLandscapeSidebarPadding();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const s = useSettingsStore(
    useShallow(st => ({
      useWaveformScrubber: st.useWaveformScrubber,
      setUseWaveformScrubber: st.setUseWaveformScrubber,
      crossfadeDuration: st.crossfadeDuration,
      setCrossfadeDuration: st.setCrossfadeDuration,
      rotationLocked: st.rotationLocked,
      setRotationLocked: st.setRotationLocked,
      navBarPosition: st.navBarPosition,
      setNavBarPosition: st.setNavBarPosition,
      isFullscreenMode: st.isFullscreenMode,
      setIsFullscreenMode: st.setIsFullscreenMode,
      fullPlayerCoverSide: st.fullPlayerCoverSide,
      setFullPlayerCoverSide: st.setFullPlayerCoverSide,
      isAutoplayEnabled: st.isAutoplayEnabled,
      setIsAutoplayEnabled: st.setIsAutoplayEnabled,
      isAlwaysPrevious: st.isAlwaysPrevious,
      setIsAlwaysPrevious: st.setIsAlwaysPrevious,
      isAutoDownloadEnabled: st.isAutoDownloadEnabled,
      setIsAutoDownloadEnabled: st.setIsAutoDownloadEnabled,
      autoOnlineMode: st.autoOnlineMode,
      setAutoOnlineMode: st.setAutoOnlineMode,
      locale: st.locale,
      setLocale: st.setLocale,
    })),
  );

  const setAutoDownload = (on: boolean) => {
    if (!on) {
      s.setIsAutoDownloadEnabled(false);
      return;
    }
    Alert.alert(t.settings.playback.autoDownloadAlertTitle, t.settings.playback.autoDownloadAlertMessage, [
      {text: t.settings.playback.autoDownloadAlertCancel, style: 'cancel'},
      {text: t.settings.playback.autoDownloadAlertConfirm, onPress: () => s.setIsAutoDownloadEnabled(true)},
    ]);
  };

  const checkUpdate = async () => {
    setCheckingUpdate(true);
    try { await checkForUpdate(); } finally { setCheckingUpdate(false); }
  };

  return (
    <View style={[styles.root, landscapePadding]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} hidden={s.isFullscreenMode} />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{paddingTop: top, paddingBottom: dockInset + spacing.l}}>
        <LargeTitle title={t.settings.title} scrollY={scrollY} />
        <View style={styles.groups}>
          <ListGroup caption={t.settings.language.sectionTitle}>
            <View style={styles.padded}>
              <SegmentedControl
                options={[{value: 'fr', label: 'Français'}, {value: 'en', label: 'English'}]}
                value={s.locale}
                onChange={s.setLocale}
              />
            </View>
          </ListGroup>

          <ListGroup caption={t.settings.sections.player}>
            <Block label={t.settings.player.progressLabel} description={t.settings.player.progressDesc}>
              <Choices
                options={[
                  {value: 'classic', label: t.settings.player.classic},
                  {value: 'waveform', label: t.settings.player.waveform},
                ]}
                renderPreview={progressPreview}
                value={s.useWaveformScrubber ? 'waveform' : 'classic'}
                onChange={v => s.setUseWaveformScrubber(v === 'waveform')}
              />
            </Block>
            <Block label={t.settings.transitions.crossfadeLabel} description={t.settings.transitions.crossfadeDesc}>
              <View style={styles.sliderRow}>
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={12}
                  step={1}
                  value={s.crossfadeDuration}
                  onValueChange={s.setCrossfadeDuration}
                  minimumTrackTintColor={colors.accent}
                  maximumTrackTintColor={colors.fill}
                  thumbTintColor={colors.textPrimary}
                  accessibilityLabel={t.settings.transitions.crossfadeLabel}
                />
                <Text variant="subhead" color="textSecondary" style={styles.sliderValue}>{s.crossfadeDuration} s</Text>
              </View>
            </Block>
            <ListItem
              label={t.settings.playback.autoplayLabel}
              description={t.settings.playback.autoplayDesc}
              toggle={{value: s.isAutoplayEnabled, onValueChange: s.setIsAutoplayEnabled}}
            />
            <ListItem
              label={t.settings.playback.alwaysPreviousLabel}
              description={t.settings.playback.alwaysPreviousDesc}
              toggle={{value: s.isAlwaysPrevious, onValueChange: s.setIsAlwaysPrevious}}
            />
          </ListGroup>

          <ListGroup caption={t.settings.sections.downloads}>
            <ListItem
              label={t.settings.playback.autoDownloadLabel}
              description={t.settings.playback.autoDownloadDesc}
              toggle={{value: s.isAutoDownloadEnabled, onValueChange: setAutoDownload}}
            />
          </ListGroup>

          <ListGroup caption={t.settings.sections.offline}>
            <ListItem
              label={t.settings.offline.autoOnlineLabel}
              description={t.settings.offline.autoOnlineDesc}
              toggle={{value: s.autoOnlineMode, onValueChange: s.setAutoOnlineMode}}
            />
          </ListGroup>

          <ListGroup caption={t.settings.sections.display}>
            <ListItem
              label={t.settings.display.lockRotationLabel}
              description={t.settings.display.lockRotationDesc}
              toggle={{value: s.rotationLocked, onValueChange: s.setRotationLocked}}
            />
            {s.rotationLocked ? null : (
              <Block label={t.settings.display.navBarPositionLabel}>
                <Choices
                  options={[
                    {value: 'left', label: t.settings.display.navBarLeft},
                    {value: 'right', label: t.settings.display.navBarRight},
                  ]}
                  renderPreview={navBarPreview}
                  value={s.navBarPosition}
                  onChange={s.setNavBarPosition}
                />
              </Block>
            )}
            <ListItem
              label={t.settings.display.fullscreenLabel}
              description={t.settings.display.fullscreenDesc}
              toggle={{value: s.isFullscreenMode, onValueChange: s.setIsFullscreenMode}}
            />
            <Block label={t.settings.display.fullPlayerLayoutLabel} description={t.settings.display.fullPlayerLayoutDesc}>
              <Choices
                options={[
                  {value: 'left', label: t.settings.display.fullPlayerCoverLeft},
                  {value: 'right', label: t.settings.display.fullPlayerCoverRight},
                ]}
                renderPreview={playerPreview}
                value={s.fullPlayerCoverSide}
                onChange={s.setFullPlayerCoverSide}
              />
            </Block>
          </ListGroup>

          <ListGroup caption={t.settings.updates.sectionTitle}>
            <ListItem
              label={t.settings.updates.checkButton}
              value={checkingUpdate ? undefined : `v${APP_VERSION}`}
              accessory={checkingUpdate ? <ActivityIndicator size="small" color={colors.accent} /> : undefined}
              onPress={checkingUpdate ? undefined : checkUpdate}
            />
          </ListGroup>
        </View>
      </Animated.ScrollView>

      <LargeTitleHeader
        title={t.settings.title}
        scrollY={scrollY}
        left={
          <Button
            variant="icon"
            size={36}
            accessibilityLabel={t.common.back}
            onPress={() => navigation.goBack()}
            icon={<BackArrowIcon size={18} color={colors.textPrimary} />}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.background},
  groups: {paddingHorizontal: spacing.m, gap: spacing.l, paddingTop: spacing.s},
  padded: {padding: 12},
  block: {paddingHorizontal: spacing.m, paddingVertical: 12, gap: 2},
  blockControl: {marginTop: 10},
  choices: {flexDirection: 'row', gap: 10},
  choice: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: radii.tile,
    backgroundColor: colors.fill,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  choiceActive: {borderColor: colors.accent, backgroundColor: colors.accentFill},
  choiceLabel: {fontWeight: '600', color: colors.textSecondary},
  choiceLabelActive: {color: colors.accent},
  sliderRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.s},
  slider: {flex: 1, height: 36},
  sliderValue: {minWidth: 36, textAlign: 'right', fontVariant: ['tabular-nums']},
});
