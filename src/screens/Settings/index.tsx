/**
 * @file index.tsx
 * @description Settings screen. Grouped into captioned cards (Language, Player,
 *   Downloads, Offline, Display, About) so related controls read as one unit
 *   instead of a flat list. Language picker, player style (classic / waveform),
 *   crossfade duration, autoplay/auto-download, offline auto-reconnect, screen
 *   rotation lock, landscape navigation bar position (shown only while rotation
 *   is unlocked), and fullscreen mode (hides the OS status bar).
 * @author DoodzProg
 * @version 1.0.6
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
import Svg, {Path, Circle, Rect, G} from 'react-native-svg';
import BackArrowIcon from '../../components/icons/BackArrowIcon';
import {useShallow} from 'zustand/react/shallow';
import {useSettingsStore} from '../../store/settingsStore';
import {useIsLandscape} from '../../hooks/useIsLandscape';
import Slider from '@react-native-community/slider';
import {useT} from '../../i18n';

// ─── Icons ────────────────────────────────────────────────────────────────────

// Rotation icon artwork — two hand-picked variants (portrait->landscape arrow
// vs landscape->portrait arrow), swapped based on the device's CURRENT real
// orientation so the arrow always points toward the state a tap would reach.
const ROTATE_TO_LANDSCAPE = {
  viewBox: '0 0 392.657 392.656',
  paths: [
    'M266.182,62.711c15.014,21.124,21.545,46.847,18.255,73.22c-0.688,5.546,6.11,6.426,9.037,6.799c1.338,0.172,2.581,0.239,3.576,0.239c5.44,0,6.607-2.888,6.942-5.441c3.786-30.418-3.969-61.028-21.841-86.196c-9.477-13.32-21.296-24.403-35.104-32.943C227.693,6.359,205.413,0,182.654,0c-30.342,0-59.412,11.15-81.855,31.375c-1.042,0.928-3.031,1.062-4.035,0.306l-8.291-6.417c-3.768-2.897-7.994-2.744-10.433,0.019c-1.023,1.176-2.161,3.347-1.683,6.923l3.414,26.564c0.727,5.719,5.613,10.031,11.36,10.031l28.018-3.509c5.364-0.65,6.809-3.911,7.181-5.279c0.373-1.377,0.775-4.905-3.48-8.157l-7.488-5.814l-0.191-1.262c18.656-16.247,42.62-25.197,67.473-25.197c19.115,0,37.82,5.336,54.076,15.415C248.338,42.228,258.255,51.551,266.182,62.711z',
    'M374.544,351.105V218.158c0-10.93-8.854-19.756-19.775-19.756H202.372v26.67h134.104c3.013,0,5.432,2.439,5.432,5.441v108.229c0,3.012-2.429,5.441-5.432,5.441H202.372v26.689h152.388C365.69,370.873,374.544,362.018,374.544,351.105z',
    'M37.877,392.656h132.948c10.911,0,19.765-8.855,19.765-19.775V119.283c0-10.92-8.864-19.775-19.765-19.775H37.877c-10.93,0-19.766,8.855-19.766,19.775v253.598C18.122,383.801,26.948,392.656,37.877,392.656z M104.021,380.578c-6.885,0-12.45-5.566-12.45-12.441s5.565-12.449,12.45-12.449c6.866,0,12.441,5.574,12.441,12.449S110.887,380.578,104.021,380.578z M44.792,137.566c0-3.012,2.438-5.432,5.441-5.432h108.229c3.012,0,5.441,2.429,5.441,5.432v195.246c0,3.004-2.438,5.432-5.441,5.432H50.232c-3.002,0-5.441-2.428-5.441-5.432V137.566z',
  ],
};
const ROTATE_TO_PORTRAIT = {
  viewBox: '0 0 401.856 401.856',
  paths: [
    'M276.085,114.713c-5.326-0.698-7.535,2.075-8.233,3.318c-0.698,1.224-1.979,4.561,1.349,8.807l17.336,22.29c4.055,4.064,10.558,4.466,15.119,0.937l21.2-16.361c2.868-2.19,3.604-4.533,3.71-6.091c0.229-3.682-2.649-6.77-7.354-7.382l-10.404-1.329c-1.243-0.182-2.553-1.683-2.63-3.069c-1.568-30.17-14.238-58.609-35.688-80.067c-16.103-16.104-36.347-27.339-58.541-32.532c-15.807-3.72-31.996-4.236-48.109-1.521c-30.438,5.154-57.576,21.315-76.395,45.508c-1.578,2.037-2.792,4.905,1.052,8.75c0.708,0.708,1.645,1.54,2.697,2.362c2.343,1.817,7.765,5.996,11.207,1.587c16.323-20.98,39.13-34.549,64.681-38.862c13.502-2.286,27.1-1.865,40.43,1.243c18.628,4.37,35.63,13.817,49.142,27.339c17.576,17.566,28.19,40.842,29.893,65.522l-1.022,0.765L276.085,114.713z',
    'M359.355,207.604H206.967v26.67h134.104c3.003,0,5.432,2.438,5.432,5.441v108.229c0,3.002-2.429,5.44-5.432,5.44H206.967v26.689h152.397c10.931,0,19.775-8.864,19.775-19.766V227.36C379.14,216.439,370.285,207.604,359.355,207.604z',
    'M175.42,401.856c10.911,0,19.766-8.855,19.766-19.775V128.483c0-10.93-8.865-19.775-19.766-19.775H42.473c-10.93,0-19.756,8.855-19.756,19.775v253.598c0,10.93,8.836,19.775,19.756,19.775H175.42z M108.617,389.779c-6.885,0-12.45-5.565-12.45-12.441c0-6.875,5.565-12.45,12.45-12.45c6.866,0,12.441,5.575,12.441,12.45C121.048,384.214,115.473,389.779,108.617,389.779z M49.377,146.767c0-3.002,2.438-5.432,5.441-5.432h108.228c3.003,0,5.441,2.429,5.441,5.432v195.247c0,3.003-2.438,5.432-5.441,5.432H54.828c-3.002,0-5.441-2.429-5.441-5.432V146.767H49.377z',
  ],
};

function PhoneRotateIcon({locked}: {locked: boolean}) {
  const isLandscape = useIsLandscape();
  const color = locked ? '#FF6B35' : '#fff';
  // Locked: freeze on the portrait->landscape arrow (position 1) + a lock
  // badge, regardless of real orientation — nothing will actually rotate, so
  // showing a live-swapping arrow would be misleading. Unlocked: reflect the
  // real current orientation as before.
  const variant = locked ? ROTATE_TO_LANDSCAPE : (isLandscape ? ROTATE_TO_PORTRAIT : ROTATE_TO_LANDSCAPE);
  return (
    <View style={styles.rotateIconWrap}>
      <Svg width={26} height={26} viewBox={variant.viewBox}>
        <G fill={color}>
          {variant.paths.map((d, i) => <Path key={i} d={d} />)}
        </G>
      </Svg>
      {locked && (
        <View style={styles.lockBadge}>
          <Svg width={13} height={13} viewBox="0 0 24 24">
            <Rect x={5} y={11} width={14} height={10} rx={2} fill="#FF6B35" />
            <Path d="M8 11 V7a4 4 0 0 1 8 0v4" stroke="#FF6B35" strokeWidth={2} fill="none" strokeLinecap="round" />
          </Svg>
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

function FullscreenIcon({active}: {active: boolean}) {
  const color = active ? '#FF6B35' : '#fff';
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      <Path d="M4 9V4h5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M20 9V4h-5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M4 15v5h5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M20 15v5h-5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
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
            <FullscreenIcon active={isFullscreenMode} />
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
