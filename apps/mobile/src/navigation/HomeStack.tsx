/**
 * @file HomeStack.tsx
 * @description Stack navigator for the Home tab. Includes Home, LikedSongs,
 *   LikedRecommendations, PlaylistDetail, AlbumDetail, and ArtistDetail so detail
 *   screens are reachable from the home feed without leaving the tab.
 * @author DoodzProg
 * @version 1.0.3
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import HomeScreen from '../screens/Home';
import LikedSongsScreen from '../screens/LikedSongs';
import LikedRecommendationsScreen from '../screens/LikedRecommendations';
import PlaylistDetailScreen from '../screens/PlaylistDetail';
import AlbumDetailScreen from '../screens/AlbumDetail';
import ArtistDetailScreen from '../screens/ArtistDetail';

const Stack = createNativeStackNavigator();

export default function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false, animation: 'slide_from_right'}}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="LikedSongs" component={LikedSongsScreen} />
      <Stack.Screen name="LikedRecommendations" component={LikedRecommendationsScreen} />
      <Stack.Screen name="PlaylistDetail" component={PlaylistDetailScreen} />
      <Stack.Screen name="AlbumDetail" component={AlbumDetailScreen} />
      <Stack.Screen name="ArtistDetail" component={ArtistDetailScreen} />
    </Stack.Navigator>
  );
}
