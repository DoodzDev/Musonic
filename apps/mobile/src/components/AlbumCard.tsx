/**
 * @file AlbumCard.tsx
 * @description Vertical card for displaying an album or single in horizontal
 *   scroll lists (Home, ArtistDetail). Shows cover art, name, and artist.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {Text, TouchableOpacity, StyleSheet} from 'react-native';
import CoverArt from './CoverArt';
import {darkTheme} from '../theme';

type Props = {
  id: string;
  name: string;
  artist?: string;
  coverArt?: string;
  imageUrl?: string;
  label?: string;
  onPress?: () => void;
};

export default function AlbumCard({name, artist, coverArt, imageUrl, label, onPress}: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <CoverArt id={coverArt} size={150} borderRadius={6} imageUrl={imageUrl} />
      <Text style={styles.name} numberOfLines={2}>
        {name}
      </Text>
      {artist && (
        <Text style={styles.artist} numberOfLines={1}>
          {artist}
        </Text>
      )}
      {label && (
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 150,
    marginRight: 14,
  },
  name: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: darkTheme.textPrimary,
    lineHeight: 18,
  },
  artist: {
    marginTop: 3,
    fontSize: 12,
    color: darkTheme.textSecondary,
  },
  label: {
    marginTop: 3,
    fontSize: 11,
    color: '#6A6A6A',
    fontWeight: '500',
  },
});
