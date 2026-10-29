/**
 * @file index.tsx
 * @description Settings screen (Design v2, R5.8): one simple page, a line per
 *   setting and a few words only where they help: Playback, Downloads,
 *   Musonic Connect (on a Musonic Server), Display, Updates, then « Advanced
 *   options », a second screen for the rest (progress bar style, crossfade,
 *   Previous, Home date, full screen, landscape layouts, back online by itself,
 *   the player kind). The visual choices show a small preview of each option.
 * @author DoodzProg
 * @version 3.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useState} from 'react';
import {ActivityIndicator, Alert, Platform, StatusBar, StyleSheet, View} from 'react-native';
import Animated from 'react-native-reanimated';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
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
import {chooseNativePlayer, nativePlayerChosen} from '../../services/player/mode';
import {useSettingsStore, type StorageLimitMB, type StreamQuality} from '../../store/settingsStore';
import {useDownloadStore} from '../../store/downloadStore';
import {formatBytes} from '../../utils/formatBytes';
import {useDockInset} from '../../navigation/dockLayout';
import {colors, radii, spacing} from '../../theme';
import {useT} from '../../i18n';
import {useConnectSnapshot} from '../../services/connect/useConnect';
import {setSync} from '../../services/connect/connectService';
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

/** The second screen: « Advanced options ». */
export function AdvancedSettingsScreen() {
  return <SettingsScreen advanced />;
}

export default function SettingsScreen({advanced = false}: {advanced?: boolean}) {
  const t = useT();
  const navigation = useNavigation();
  const {scrollY, onScroll} = useLargeTitleScroll();
  const top = useLargeTitleInset();
  const dockInset = useDockInset();
  // Settings opens over the tabs: no Rail beside it, only the side insets.
  const insets = useSafeAreaInsets();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const server = useSettingsStore(st => st.servers.find(x => x.id === st.activeServerId) ?? null);
  const connect = useConnectSnapshot();
  const usedBytes = useDownloadStore(st => st.getTotalSizeBytes());
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
      showRemainingTime: st.showRemainingTime,
      setShowRemainingTime: st.setShowRemainingTime,
      startTab: st.startTab,
      setStartTab: st.setStartTab,
      showHomeDate: st.showHomeDate,
      setShowHomeDate: st.setShowHomeDate,
      downloadWifiOnly: st.downloadWifiOnly,
      setDownloadWifiOnly: st.setDownloadWifiOnly,
      streamQualityWifi: st.streamQualityWifi,
      setStreamQualityWifi: st.setStreamQualityWifi,
      streamQualityMobile: st.streamQualityMobile,
      setStreamQualityMobile: st.setStreamQualityMobile,
      storageLimitMB: st.storageLimitMB,
      setStorageLimitMB: st.setStorageLimitMB,
      hapticsEnabled: st.hapticsEnabled,
      setHapticsEnabled: st.setHapticsEnabled,
    })),
  );

  // The player kind (ADR-022), saved for the next launch.
  const [nativePlayer, setNativePlayerState] = useState(nativePlayerChosen);
  const setNativePlayer = (on: boolean) => {
    chooseNativePlayer(on);
    setNativePlayerState(on);
    Alert.alert(t.settings.playback.nativePlayerRestartTitle, t.settings.playback.nativePlayerRestartMessage);
  };
  const qualityOptions: {value: StreamQuality; label: string}[] = [
    {value: 0, label: t.settings.playback.qualityOriginal},
    {value: 320, label: '320'},
    {value: 192, label: '192'},
    {value: 128, label: '128'},
  ];
  const storageOptions: {value: StorageLimitMB; label: string}[] = [
    {value: 0, label: t.settings.playback.storageLimitNone},
    {value: 2048, label: t.settings.playback.storageLimitGB(2)},
    {value: 5120, label: t.settings.playback.storageLimitGB(5)},
    {value: 10240, label: t.settings.playback.storageLimitGB(10)},
  ];

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


  const title = advanced ? t.settings.advanced : t.settings.title;

  const mainGroups = (
    <>
      <ListGroup caption={t.settings.sections.player}>
        <Block label={t.settings.playback.qualityWifiLabel}>
          <SegmentedControl options={qualityOptions} value={s.streamQualityWifi} onChange={s.setStreamQualityWifi} />
        </Block>
        <Block label={t.settings.playback.qualityMobileLabel}>
          <SegmentedControl options={qualityOptions} value={s.streamQualityMobile} onChange={s.setStreamQualityMobile} />
        </Block>
        <ListItem label={t.settings.playback.autoplayLabel} toggle={{value: s.isAutoplayEnabled, onValueChange: s.setIsAutoplayEnabled}} />
        <ListItem label={t.settings.player.showRemaining} toggle={{value: s.showRemainingTime, onValueChange: s.setShowRemainingTime}} />
      </ListGroup>

      <ListGroup caption={t.settings.sections.downloads}>
        <ListItem label={t.settings.playback.wifiOnlyLabel} toggle={{value: s.downloadWifiOnly, onValueChange: s.setDownloadWifiOnly}} />
        <ListItem label={t.settings.playback.autoDownloadLabel} toggle={{value: s.isAutoDownloadEnabled, onValueChange: setAutoDownload}} />
        <Block label={t.settings.playback.storageLimitLabel} description={t.settings.playback.storageLimitDesc(formatBytes(usedBytes))}>
          <SegmentedControl options={storageOptions} value={s.storageLimitMB} onChange={s.setStorageLimitMB} />
        </Block>
      </ListGroup>

      {server?.apiKey ? (
        <ListGroup caption={t.settings.sections.connect} note={t.connect.adminNotice}>
          <ListItem
            label={t.connect.sync}
            description={connect.sync ? t.connect.syncOn : t.connect.syncOff}
            toggle={{value: connect.sync, onValueChange: setSync}}
          />
        </ListGroup>
      ) : null}

      <ListGroup caption={t.settings.sections.display}>
        <Block label={t.settings.language.sectionTitle}>
          <SegmentedControl
            options={[
              {value: 'system', label: t.settings.language.system},
              {value: 'fr', label: 'Français'},
              {value: 'en', label: 'English'},
            ]}
            value={s.locale}
            onChange={s.setLocale}
          />
        </Block>
        <Block label={t.settings.display.startTabLabel}>
          <SegmentedControl
            options={[
              {value: 'Home', label: t.tabs.home},
              {value: 'Search', label: t.tabs.search},
              {value: 'Library', label: t.tabs.library},
            ]}
            value={s.startTab}
            onChange={s.setStartTab}
          />
        </Block>
        <ListItem label={t.settings.display.hapticsLabel} toggle={{value: s.hapticsEnabled, onValueChange: s.setHapticsEnabled}} />
        <ListItem label={t.settings.display.lockRotationLabel} toggle={{value: s.rotationLocked, onValueChange: s.setRotationLocked}} />
      </ListGroup>

      <ListGroup caption={t.settings.updates.sectionTitle}>
        <ListItem
          label={t.settings.updates.checkButton}
          value={checkingUpdate ? undefined : `v${APP_VERSION}`}
          accessory={checkingUpdate ? <ActivityIndicator size="small" color={colors.accent} /> : undefined}
          onPress={checkingUpdate ? undefined : checkUpdate}
        />
      </ListGroup>

      <ListGroup>
        <ListItem label={t.settings.advanced} accessory="chevron" onPress={() => navigation.navigate('SettingsAdvanced' as never)} />
      </ListGroup>
    </>
  );

  const advancedGroups = (
    <>
      <ListGroup caption={t.settings.sections.player}>
        <Block label={t.settings.player.progressLabel}>
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
          label={t.settings.playback.alwaysPreviousLabel}
          description={t.settings.playback.alwaysPreviousDesc}
          toggle={{value: s.isAlwaysPrevious, onValueChange: s.setIsAlwaysPrevious}}
        />
        {Platform.OS === 'android' ? (
          <ListItem
            label={t.settings.playback.nativePlayerLabel}
            description={t.settings.playback.nativePlayerDesc}
            toggle={{value: nativePlayer, onValueChange: setNativePlayer}}
          />
        ) : null}
      </ListGroup>

      <ListGroup caption={t.settings.sections.offline}>
        <ListItem
          label={t.settings.offline.autoOnlineLabel}
          description={t.settings.offline.autoOnlineDesc}
          toggle={{value: s.autoOnlineMode, onValueChange: s.setAutoOnlineMode}}
        />
      </ListGroup>

      <ListGroup caption={t.settings.sections.display}>
        <ListItem label={t.settings.display.homeDateLabel} toggle={{value: s.showHomeDate, onValueChange: s.setShowHomeDate}} />
        <ListItem label={t.settings.display.fullscreenLabel} toggle={{value: s.isFullscreenMode, onValueChange: s.setIsFullscreenMode}} />
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
        <Block label={t.settings.display.fullPlayerLayoutLabel}>
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
    </>
  );

  return (
    <View style={[styles.root, {paddingLeft: insets.left, paddingRight: insets.right}]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} hidden={s.isFullscreenMode} />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.column, {paddingTop: top, paddingBottom: dockInset + spacing.l}]}>
        <LargeTitle title={title} scrollY={scrollY} />
        <View style={styles.groups}>
          {advanced ? advancedGroups : mainGroups}
        </View>
      </Animated.ScrollView>

      <LargeTitleHeader
        title={title}
        scrollY={scrollY}
        besideRail={false}
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
  // Readable width in landscape, centred; the whole width in portrait.
  column: {width: '100%', maxWidth: 760, alignSelf: 'center'},
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
