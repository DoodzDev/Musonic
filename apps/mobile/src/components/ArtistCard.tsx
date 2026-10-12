/**
 * @file ArtistCard.tsx
 * @description Circular artist card for horizontal scroll lists (Home Discover
 *   section). Shows artist photo or initials fallback.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import FastImage from '@d11/react-native-fast-image';
import {getCoverArtUrl} from '../api/client';
import {darkTheme} from '../theme';

type Props = {
  id: string;
  name: string;
  coverArt?: string;
  imageUrl?: string;
  onPress?: () => void;
};

export default function ArtistCard({name, coverArt, imageUrl, onPress}: Props) {
  const uri = imageUrl ?? (coverArt ? getCoverArtUrl(coverArt, 300) : null);
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.circle}>
        {uri ? (
          <FastImage
            style={styles.image}
            source={{uri, priority: FastImage.priority.normal}}
            resizeMode={FastImage.resizeMode.cover}
          />
        ) : (
          <Text style={styles.initials}>{initials}</Text>
        )}
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {name}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 120,
    marginRight: 14,
    alignItems: 'center',
  },
  circle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: darkTheme.surfaceAlt,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  initials: {
    fontSize: 36,
    fontWeight: '700',
    color: darkTheme.textSecondary,
  },
  name: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: darkTheme.textPrimary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
