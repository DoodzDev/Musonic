/**
 * @file index.tsx
 * @description Settings screen. Grouped into captioned cards (Language, Player,
 *   Downloads, Offline, Display, About) so related controls read as one unit
 *   instead of a flat list. Language picker, player style (classic / waveform),
 *   crossfade duration, autoplay/auto-download, offline auto-reconnect, screen
 *   rotation lock, landscape navigation bar position (shown only while rotation
 *   is unlocked), and fullscreen mode (hides the OS status bar).
 * @author DoodzProg
 * @version 1.1.0
 * @license MIT
 */

import React, {useState} from 'react';
import {
  Alert,
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Platform,
} from 'react-native';
import {checkForUpdate} from '../../services/updateChecker';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import Svg, {Path, Circle, Rect} from 'react-native-svg';
import BackArrowIcon from '../../components/icons/BackArrowIcon';
import {useShallow} from 'zustand/react/shallow';
import {useSettingsStore} from '../../store/settingsStore';
import {useIsLandscape} from '../../hooks/useIsLandscape';
import Slider from '@react-native-community/slider';
import {useT} from '../../i18n';
import {FullscreenIcon, LockIcon, RotateIcon} from '../../components/icons';

// ─── Icons ────────────────────────────────────────────────────────────────────

function PhoneRotateIcon({locked}: {locked: boolean}) {
  const isLandscape = useIsLandscape();
  const color = locked ? '#FF6B35' : '#fff';
  // Locked: freeze on the portrait->landscape arrow + a lock badge (nothing will rotate).
  // Unlocked: the arrow points toward the state a tap would reach.
  const toLandscape = locked || !isLandscape;
  return (
    <View style={styles.rotateIconWrap}>
      <RotateIcon size={26} color={color} toLandscape={toLandscape} />
      {locked && (
        <View style={styles.lockBadge}>
          <LockIcon size={13} color="#FF6B35" />
        </View>
      )}
    </View>
  );
}

function NavBarSideIcon({onRight, active}: {onRight: boolean; active: boolean}) {
  const color = active ? '#FF6B35' : '#A7A7A7';
  return (
    <Svg width={44} height={28} viewBox="0 0 44 28" style={styles.navBarSideIcon}>
      {/* Landscape screen outline */}
      <Rect x={1} y={1} width={42} height={26} rx={3} stroke={color} strokeWidth={1.5} fill="none" />
      {/* Sidebar bar, on the matching edge */}
      <Rect
        x={onRight ? 33 : 1}
        y={1}
        width={10}
        height={26}
        rx={2}
        fill={color}
      />
    </Svg>
  );
}

function PlayerLayoutIcon({coverOnRight, active}: {coverOnRight: boolean; active: boolean}) {
  const color = active ? '#FF6B35' : '#A7A7A7';
  const coverX = coverOnRight ? 27 : 3;
  const barsX = coverOnRight ? 3 : 27;
  return (
    <Svg width={44} height={28} viewBox="0 0 44 28" style={styles.navBarSideIcon}>
      {/* Landscape screen outline */}
      <Rect x={1} y={1} width={42} height={26} rx={3} stroke={color} strokeWidth={1.5} fill="none" />
      {/* Cover square on the matching side */}
      <Rect x={coverX} y={5} width={14} height={18} rx={2} fill={color} />
      {/* Progress/controls bars on the other side */}
      <Rect x={barsX} y={8} width={14} height={3} rx={1.5} fill={color} />
      <Rect x={barsX} y={14} width={14} height={3} rx={1.5} fill={color} />
      <Rect x={barsX} y={20} width={14} height={3} rx={1.5} fill={color} />
    </Svg>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const navigation = useNavigation();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const {
    useWaveformScrubber,
    setUseWaveformScrubber,
    crossfadeDuration,
    setCrossfadeDuration,
    rotationLocked,
    setRotationLocked,
    navBarPosition,
    setNavBarPosition,
    isFullscreenMode,
    setIsFullscreenMode,
    fullPlayerCoverSide,
    setFullPlayerCoverSide,
    isAutoplayEnabled,
    setIsAutoplayEnabled,
    isAlwaysPrevious,
    setIsAlwaysPrevious,
    isAutoDownloadEnabled,
    setIsAutoDownloadEnabled,
    autoOnlineMode,
    setAutoOnlineMode,
    locale,
    setLocale,
  } = useSettingsStore(
    useShallow(s => ({
      useWaveformScrubber: s.useWaveformScrubber,
      setUseWaveformScrubber: s.setUseWaveformScrubber,
      crossfadeDuration: s.crossfadeDuration,
      setCrossfadeDuration: s.setCrossfadeDuration,
      rotationLocked: s.rotationLocked,
      setRotationLocked: s.setRotationLocked,
      navBarPosition: s.navBarPosition,
      setNavBarPosition: s.setNavBarPosition,
      isFullscreenMode: s.isFullscreenMode,
      setIsFullscreenMode: s.setIsFullscreenMode,
      fullPlayerCoverSide: s.fullPlayerCoverSide,
      setFullPlayerCoverSide: s.setFullPlayerCoverSide,
      isAutoplayEnabled: s.isAutoplayEnabled,
      setIsAutoplayEnabled: s.setIsAutoplayEnabled,
      isAlwaysPrevious: s.isAlwaysPrevious,
      setIsAlwaysPrevious: s.setIsAlwaysPrevious,
      isAutoDownloadEnabled: s.isAutoDownloadEnabled,
      setIsAutoDownloadEnabled: s.setIsAutoDownloadEnabled,
      autoOnlineMode: s.autoOnlineMode,
      setAutoOnlineMode: s.setAutoOnlineMode,
      locale: s.locale,
      setLocale: s.setLocale,
    })),
  );

  const t = useT();

  const ACCENT = '#FF6B35';

  return (
    <SafeAreaView style={styles.container} edges={isFullscreenMode ? [] : ['top']}>
      {/* Spotify-style header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <BackArrowIcon size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.settings.title}</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* ── Language ──────────────────────────────────────────────────── */}
        <Text style={styles.sectionCaption}>{t.settings.language.sectionTitle}</Text>
        <View style={styles.sectionCard}>
          <View style={styles.languagePicker}>
            <TouchableOpacity
              style={[styles.langPill, locale === 'en' && styles.langPillActive]}
              onPress={() => setLocale('en')}
              activeOpacity={0.8}>
              <Text style={[styles.langPillText, locale === 'en' && styles.langPillTextActive]}>
                English
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.langPill, locale === 'fr' && styles.langPillActive]}
              onPress={() => setLocale('fr')}
              activeOpacity={0.8}>
              <Text style={[styles.langPillText, locale === 'fr' && styles.langPillTextActive]}>
                Français
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Player ────────────────────────────────────────────────────── */}
        <Text style={styles.sectionCaption}>{t.settings.sections.player}</Text>
        <View style={styles.sectionCard}>
          <View style={styles.settingRow}>
            <View style={styles.textBlock}>
              <Text style={styles.settingLabel}>{t.settings.player.progressLabel}</Text>
              <Text style={styles.settingDesc}>{t.settings.player.progressDesc}</Text>
            </View>
          </View>

          {/* Waveform vs Classic preview */}
          <View style={styles.previewContainer}>
            <TouchableOpacity
              style={[styles.previewCard, !useWaveformScrubber && styles.previewCardActive]}
              onPress={() => setUseWaveformScrubber(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.previewTitle, !useWaveformScrubber && styles.previewTitleActive]}>
                {t.settings.player.classic}
              </Text>
              <Svg width="100%" height="30" viewBox="0 0 100 30">
                <Path d="M10 15 L50 15" stroke="#fff" strokeWidth={3} strokeLinecap="round" />
                <Path d="M50 15 L90 15" stroke="#535353" strokeWidth={3} strokeLinecap="round" />
                <Circle cx="50" cy="15" r="5" fill="#fff" />
              </Svg>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.previewCard, useWaveformScrubber && styles.previewCardActive]}
              onPress={() => setUseWaveformScrubber(true)}
              activeOpacity={0.8}
            >
              <Text style={[styles.previewTitle, useWaveformScrubber && styles.previewTitleActive]}>
                {t.settings.player.waveform}
              </Text>
              {/* Bars share one bottom baseline (y=28) — only height varies,
                  matching the real WaveformScrubber used in the full player. */}
              <Svg width="100%" height="30" viewBox="0 0 100 30">
                <Rect x="20" y="18" width="3" height="10" fill="#fff" rx="1.5" />
                <Rect x="28" y="8" width="3" height="20" fill="#fff" rx="1.5" />
                <Rect x="36" y="22" width="3" height="6" fill="#fff" rx="1.5" />
                <Rect x="44" y="2" width="3" height="26" fill="#fff" rx="1.5" />
                <Rect x="52" y="14" width="3" height="14" fill="#FF6B35" rx="1.5" />
                <Rect x="60" y="26" width="3" height="2" fill="#535353" rx="1.5" />
                <Rect x="68" y="10" width="3" height="18" fill="#535353" rx="1.5" />
                <Rect x="76" y="20" width="3" height="8" fill="#535353" rx="1.5" />
              </Svg>
            </TouchableOpacity>
          </View>

          <View style={styles.cardDivider} />

          <View style={styles.settingRow}>
            <View style={styles.textBlock}>
              <Text style={styles.settingLabel}>{t.settings.transitions.crossfadeLabel}</Text>
              <Text style={styles.settingDesc}>{t.settings.transitions.crossfadeDesc}</Text>
            </View>
          </View>

          <View style={styles.realSliderContainer}>
            <Text style={styles.sliderText}>0 s</Text>

            <View style={styles.sliderWrapper}>
              {/* Floating tooltip above thumb */}
              <View style={[styles.tooltip, {left: `${(crossfadeDuration / 12) * 100}%`}]}>
                <Text style={styles.tooltipText}>{crossfadeDuration} s</Text>
              </View>

              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={12}
                step={1}
                value={crossfadeDuration}
                onValueChange={setCrossfadeDuration}
                minimumTrackTintColor={ACCENT}
                maximumTrackTintColor="#535353"
                thumbTintColor="#fff"
              />
            </View>

            <Text style={styles.sliderText}>12 s</Text>
          </View>

          <View style={styles.cardDivider} />

          <View style={styles.settingRow}>
            <View style={styles.textBlock}>
              <Text style={styles.settingLabel}>{t.settings.playback.autoplayLabel}</Text>
              <Text style={styles.settingDesc}>{t.settings.playback.autoplayDesc}</Text>
            </View>
            <Switch
              value={isAutoplayEnabled}
              onValueChange={setIsAutoplayEnabled}
              trackColor={{false: '#535353', true: ACCENT}}
              thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
            />
          </View>

          <View style={styles.cardDivider} />

          <View style={styles.settingRow}>
            <View style={styles.textBlock}>
              <Text style={styles.settingLabel}>{t.settings.playback.alwaysPreviousLabel}</Text>
              <Text style={styles.settingDesc}>{t.settings.playback.alwaysPreviousDesc}</Text>
            </View>
            <Switch
              value={isAlwaysPrevious}
              onValueChange={setIsAlwaysPrevious}
              trackColor={{false: '#535353', true: ACCENT}}
              thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
            />
          </View>
        </View>

        {/* ── Downloads ─────────────────────────────────────────────────── */}
        <Text style={styles.sectionCaption}>{t.settings.sections.downloads}</Text>
        <View style={styles.sectionCard}>
          <View style={styles.settingRow}>
            <View style={styles.textBlock}>
              <Text style={styles.settingLabel}>{t.settings.playback.autoDownloadLabel}</Text>
              <Text style={styles.settingDesc}>{t.settings.playback.autoDownloadDesc}</Text>
            </View>
            <Switch
              value={isAutoDownloadEnabled}
              onValueChange={val => {
                if (val) {
                  Alert.alert(
                    t.settings.playback.autoDownloadAlertTitle,
                    t.settings.playback.autoDownloadAlertMessage,
                    [
                      {text: t.settings.playback.autoDownloadAlertCancel, style: 'cancel'},
                      {text: t.settings.playback.autoDownloadAlertConfirm, onPress: () => setIsAutoDownloadEnabled(true)},
                    ],
                  );
                } else {
                  setIsAutoDownloadEnabled(false);
                }
              }}
              trackColor={{false: '#535353', true: ACCENT}}
              thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
            />
          </View>
        </View>

        {/* ── Offline ───────────────────────────────────────────────────── */}
        <Text style={styles.sectionCaption}>{t.settings.sections.offline}</Text>
        <View style={styles.sectionCard}>
          <View style={styles.settingRow}>
            <View style={styles.textBlock}>
              <Text style={styles.settingLabel}>{t.settings.offline.autoOnlineLabel}</Text>
              <Text style={styles.settingDesc}>{t.settings.offline.autoOnlineDesc}</Text>
            </View>
            <Switch
              value={autoOnlineMode}
              onValueChange={setAutoOnlineMode}
              trackColor={{false: '#535353', true: ACCENT}}
              thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
            />
          </View>
        </View>

        {/* ── Display ───────────────────────────────────────────────────── */}
        <Text style={styles.sectionCaption}>{t.settings.sections.display}</Text>
        <View style={styles.sectionCard}>
          <View style={styles.settingRow}>
            <PhoneRotateIcon locked={rotationLocked} />
            <View style={[styles.textBlock, styles.textBlockIndent]}>
              <Text style={styles.settingLabel}>{t.settings.display.lockRotationLabel}</Text>
              <Text style={styles.settingDesc}>{t.settings.display.lockRotationDesc}</Text>
            </View>
            <Switch
              value={rotationLocked}
              onValueChange={setRotationLocked}
              trackColor={{false: '#535353', true: ACCENT}}
              thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
            />
          </View>

          {!rotationLocked && (
            <>
              <View style={styles.cardDivider} />
              <View style={styles.settingRow}>
                <View style={styles.textBlock}>
                  <Text style={styles.settingLabel}>{t.settings.display.navBarPositionLabel}</Text>
                </View>
              </View>
              <View style={styles.languagePicker}>
                <TouchableOpacity
                  style={[styles.langPill, navBarPosition === 'left' && styles.langPillActive]}
                  onPress={() => setNavBarPosition('left')}
                  activeOpacity={0.8}>
                  <NavBarSideIcon onRight={false} active={navBarPosition === 'left'} />
                  <Text style={[styles.langPillText, navBarPosition === 'left' && styles.langPillTextActive]}>
                    {t.settings.display.navBarLeft}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.langPill, navBarPosition === 'right' && styles.langPillActive]}
                  onPress={() => setNavBarPosition('right')}
                  activeOpacity={0.8}>
                  <NavBarSideIcon onRight={true} active={navBarPosition === 'right'} />
                  <Text style={[styles.langPillText, navBarPosition === 'right' && styles.langPillTextActive]}>
                    {t.settings.display.navBarRight}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <View style={styles.cardDivider} />
          <View style={styles.settingRow}>
            <FullscreenIcon size={26} color={isFullscreenMode ? '#FF6B35' : '#fff'} />
            <View style={[styles.textBlock, styles.textBlockIndent]}>
              <Text style={styles.settingLabel}>{t.settings.display.fullscreenLabel}</Text>
              <Text style={styles.settingDesc}>{t.settings.display.fullscreenDesc}</Text>
            </View>
            <Switch
              value={isFullscreenMode}
              onValueChange={setIsFullscreenMode}
              trackColor={{false: '#535353', true: ACCENT}}
              thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
            />
          </View>

          <View style={styles.cardDivider} />
          <View style={styles.settingRow}>
            <View style={styles.textBlock}>
              <Text style={styles.settingLabel}>{t.settings.display.fullPlayerLayoutLabel}</Text>
              <Text style={styles.settingDesc}>{t.settings.display.fullPlayerLayoutDesc}</Text>
            </View>
          </View>
          <View style={styles.languagePicker}>
            <TouchableOpacity
              style={[styles.langPill, fullPlayerCoverSide === 'left' && styles.langPillActive]}
              onPress={() => setFullPlayerCoverSide('left')}
              activeOpacity={0.8}>
              <PlayerLayoutIcon coverOnRight={false} active={fullPlayerCoverSide === 'left'} />
              <Text style={[styles.langPillText, fullPlayerCoverSide === 'left' && styles.langPillTextActive]}>
                {t.settings.display.fullPlayerCoverLeft}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.langPill, fullPlayerCoverSide === 'right' && styles.langPillActive]}
              onPress={() => setFullPlayerCoverSide('right')}
              activeOpacity={0.8}>
              <PlayerLayoutIcon coverOnRight={true} active={fullPlayerCoverSide === 'right'} />
              <Text style={[styles.langPillText, fullPlayerCoverSide === 'right' && styles.langPillTextActive]}>
                {t.settings.display.fullPlayerCoverRight}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── About ─────────────────────────────────────────────────────── */}
        <Text style={styles.sectionCaption}>{t.settings.updates.sectionTitle}</Text>
        <View style={styles.sectionCard}>
          <TouchableOpacity
            style={styles.settingRow}
            activeOpacity={0.7}
            disabled={checkingUpdate}
            onPress={async () => {
              setCheckingUpdate(true);
              try { await checkForUpdate(); } finally { setCheckingUpdate(false); }
            }}>
            <View style={styles.textBlock}>
              <Text style={styles.settingLabel}>{t.settings.updates.checkButton}</Text>
            </View>
            {checkingUpdate ? (
              <ActivityIndicator size="small" color={ACCENT} />
            ) : (
              <Text style={styles.versionText}>v1.0.6</Text>
            )}
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  slider: {width: '100%', height: 40},
  versionText: {fontSize: 13, color: '#888', fontWeight: '500'},
  textBlockIndent: {marginLeft: 12},
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  iconBtn: {
    padding: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  sectionCaption: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8A8A8A',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  sectionCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    marginHorizontal: 16,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2A2A2A',
    marginHorizontal: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  textBlock: {
    flex: 1,
    paddingRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '400',
    color: '#fff',
    marginBottom: 4,
  },
  settingDesc: {
    fontSize: 13,
    color: '#A7A7A7',
    lineHeight: 18,
  },
  previewContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  previewCard: {
    flex: 1,
    backgroundColor: '#282828',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  previewCardActive: {
    borderColor: '#FF6B35',
    backgroundColor: '#333333',
  },
  previewTitle: {
    color: '#A7A7A7',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  previewTitleActive: {
    color: '#FF6B35',
  },
  realSliderContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 24,
    marginBottom: 8,
  },
  sliderWrapper: {
    flex: 1,
    marginHorizontal: 10,
    position: 'relative',
    justifyContent: 'center',
  },
  tooltip: {
    position: 'absolute',
    top: -25,
    marginLeft: -15,
    backgroundColor: '#282828',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  tooltipText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  sliderText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  languagePicker: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  langPill: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 24,
    alignItems: 'center',
    backgroundColor: '#282828',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  langPillActive: {
    borderColor: '#FF6B35',
    backgroundColor: '#2A1A10',
  },
  navBarSideIcon: {
    marginBottom: 8,
  },
  rotateIconWrap: {
    width: 26,
    height: 26,
  },
  lockBadge: {
    position: 'absolute',
    top: -8,
    right: -4,
  },
  langPillText: {
    color: '#A7A7A7',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  langPillTextActive: {
    color: '#FF6B35',
  },
});
