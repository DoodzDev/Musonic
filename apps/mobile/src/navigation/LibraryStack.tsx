/**
 * @file LibraryStack.tsx
 * @description Stack navigator for the Library tab. Includes LibraryHome,
 *   LikedSongs, PlaylistDetail, AlbumDetail, and ArtistDetail with typed params.
 * @author DoodzProg
 * @version 1.0.3
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import LibraryScreen from '../screens/Library';
import LikedSongsScreen from '../screens/LikedSongs';
import LikedRecommendationsScreen from '../screens/LikedRecommendations';
import AllSongsScreen from '../screens/AllSongs';
import PlaylistDetailScreen from '../screens/PlaylistDetail';
import AlbumDetailScreen from '../screens/AlbumDetail';
import ArtistDetailScreen from '../screens/ArtistDetail';
import type {LibraryStackParams} from './types';

const Stack = createNativeStackNavigator<LibraryStackParams>();

export default function LibraryStack() {
  return (
    <Stack.Navigator
      screenOptions={{headerShown: false, animation: 'slide_from_right'}}>
      <Stack.Screen name="LibraryHome" component={LibraryScreen} />
      <Stack.Screen name="LikedSongs" component={LikedSongsScreen} />
      <Stack.Screen name="LikedRecommendations" component={LikedRecommendationsScreen} />
      <Stack.Screen name="AllSongs" component={AllSongsScreen} />
      <Stack.Screen name="PlaylistDetail" component={PlaylistDetailScreen} />
      <Stack.Screen name="AlbumDetail" component={AlbumDetailScreen} />
      <Stack.Screen name="ArtistDetail" component={ArtistDetailScreen} />
    </Stack.Navigator>
  );
}