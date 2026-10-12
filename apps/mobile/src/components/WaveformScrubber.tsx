/**
 * @file WaveformScrubber.tsx
 * @description Animated waveform progress bar for the full-screen player.
 *   Renders 45 SVG bars with overflow-hidden masking to show playback progress
 *   without a position-update loop.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React, {useMemo, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Svg, {Defs, G, Line, LinearGradient, Mask, Rect, Stop} from 'react-native-svg';
import Slider from '@react-native-community/slider';
import {formatTime} from '../utils/colorUtils';

const BAR_COUNT = 45;
const WAVE_H = 60;
const BASELINE = 40;
const BAR_GAP = 2;

function generatePeaks(trackId: string, count: number): number[] {
  const seed = trackId
    .split('')
    .reduce((acc, c, i) => acc + c.charCodeAt(0) * (i + 1), 0);
  return Array.from({length: count}, (_, i) => {
    const t = i / count;
    const v =
      0.5 * Math.sin(seed * 0.0013 + t * Math.PI * 5.7) +
      0.3 * Math.sin(seed * 0.0031 + t * Math.PI * 11.3 + 1.57) +
      0.2 * Math.sin(seed * 0.0071 + t * Math.PI * 19.7 + 3.14);
    return 0.08 + 0.92 * ((v + 1) / 2);
  });
}

// Shared SVG renderer — same geometry, different colours
function WaveSvg({
  peaks,
  barWidth,
  containerWidth,
  active,
}: {
  peaks: number[];
  barWidth: number;
  containerWidth: number;
  active: boolean;
}) {
  const topColor   = active ? '#ffffff' : 'rgba(255,255,255,0.3)';
  const reflColor  = active ? 'rgba(255,255,255,0.4)' : 'rgba(83,83,83,0.4)';

  return (
    <Svg width={containerWidth} height={WAVE_H}>
      <Defs>
        <LinearGradient id="fadeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0" stopColor="#fff" stopOpacity="1" />
          <Stop offset="1" stopColor="#fff" stopOpacity="0" />
        </LinearGradient>
        <Mask id="fadeMask">
          <Rect x={0} y={BASELINE + 1} width={containerWidth} height={25} fill="url(#fadeGrad)" />
        </Mask>
      </Defs>

      {/* Top bars */}
      {peaks.map((peak, i) => {
        const x = barWidth / 2 + i * (barWidth + BAR_GAP);
        const h = Math.max(2, peak * 35);
        return (
          <Line
            key={`t${i}`}
            x1={x} y1={BASELINE - 1}
            x2={x} y2={BASELINE - 1 - h}
            stroke={topColor}
            strokeWidth={barWidth}
            strokeLinecap="round"
          />
        );
      })}

      {/* Fading reflection */}
      <G mask="url(#fadeMask)">
        {peaks.map((peak, i) => {
          const x = barWidth / 2 + i * (barWidth + BAR_GAP);
          const h = Math.max(2, peak * 25);
          return (
            <Line
              key={`b${i}`}
              x1={x} y1={BASELINE + 1}
              x2={x} y2={BASELINE + 1 + h}
              stroke={reflColor}
              strokeWidth={barWidth}
              strokeLinecap="round"
            />
          );
        })}
      </G>
    </Svg>
  );
}

interface Props {
  trackId: string;
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
}

export default function WaveformScrubber({trackId, duration, currentTime, onSeek}: Props) {
  const peaks = useMemo(() => generatePeaks(trackId, BAR_COUNT), [trackId]);
  const [containerWidth, setContainerWidth] = useState(0);
  const [seekValue, setSeekValue] = useState<number | null>(null);

  const displayTime    = seekValue ?? currentTime;
  const progressFrac   = Math.min(1, duration > 0 ? displayTime / duration : 0);
  const progressWidth  = containerWidth * progressFrac;
  const barWidth       = containerWidth > 0
    ? (containerWidth - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT
    : 4;
  const remaining = Math.max(0, duration - displayTime);
  const progressClipStyle = useMemo(
    () => [styles.progressClip, {width: progressWidth}],
    [progressWidth],
  );

  return (
    <View style={styles.container}>
      <View
        style={styles.waveWrapper}
        onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}>
        {containerWidth > 0 && (
          <>
            {/* Layer 1 — grey inactive (full width) */}
            <WaveSvg
              peaks={peaks}
              barWidth={barWidth}
              containerWidth={containerWidth}
              active={false}
            />

            {/* Layer 2 — white active, cropped to progress via overflow:hidden */}
            <View style={progressClipStyle}>
              <WaveSvg
                peaks={peaks}
                barWidth={barWidth}
                containerWidth={containerWidth}
                active={true}
              />
            </View>

            {/* Invisible Slider for seek interaction */}
            <Slider
              style={StyleSheet.absoluteFill}
              minimumValue={0}
              maximumValue={duration > 0 ? duration : 1}
              value={currentTime}
              onValueChange={v => setSeekValue(v)}
              onSlidingComplete={v => {
                setSeekValue(null);
                onSeek(v);
              }}
              minimumTrackTintColor="transparent"
              maximumTrackTintColor="transparent"
              thumbTintColor="transparent"
            />
          </>
        )}
      </View>

      <View style={styles.timeRow}>
        <Text style={styles.time}>{formatTime(displayTime)}</Text>
        <Text style={styles.time}>{`-${formatTime(remaining)}`}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {marginTop: 8},
  progressClip: {position: 'absolute', top: 0, bottom: 0, left: 0, overflow: 'hidden'},
  waveWrapper: {
    height: WAVE_H,
    position: 'relative',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  time: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
  },
});
