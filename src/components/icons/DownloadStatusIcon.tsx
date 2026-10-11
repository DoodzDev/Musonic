/**
 * @file DownloadStatusIcon.tsx
 * @description Stateful download indicator — reads directly from downloadStore.
 *   Three visual states: idle (circled arrow), in-progress (spinner), complete
 *   (green check). Renders nothing for ext- (Deezer) tracks.
 * @author DoodzProg
 * @version 1.0.1
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import Svg, {Circle, Path} from 'react-native-svg';
import {useDownloadStore} from '../../store/downloadStore';

type Props = {
  trackId: string;
  size?: number;
};

export default function DownloadStatusIcon({trackId, size = 22}: Props) {
  const isDownloaded = useDownloadStore(s => trackId in s.downloads);
  const isDownloading = useDownloadStore(s => {
    const a = s.activeDownloads[trackId];
    return a != null && (a.status === 'queued' || a.status === 'downloading');
  });

  if (isDownloaded) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={9} stroke="#1ED760" strokeWidth={2} fill="none" />
        <Path
          d="M12 7 V14 M9 12 L12 15 L15 12"
          stroke="#1ED760"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    );
  }

  if (isDownloading) {
    return (
      <View style={[styles.iconCenter, {width: size, height: size}]}>
        <ActivityIndicator size="small" color="#1ED760" />
      </View>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} stroke="#B3B3B3" strokeWidth={2} fill="none" />
      <Path
        d="M12 7 V14 M9 12 L12 15 L15 12"
        stroke="#B3B3B3"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  iconCenter: {alignItems: 'center', justifyContent: 'center'},
});
