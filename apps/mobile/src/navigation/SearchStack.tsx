/**
 * @file SearchStack.tsx
 * @description Stack navigator for the Search tab. Includes SearchHome,
 *   SearchActive, AlbumDetail, ArtistDetail and MixDetail (genre pages from
 *   Browse) so results navigate in-tab.
 *   Detail screens slide in from the right like in the other tabs; only the
 *   switch to the active search fades.
 * @author DoodzProg
 * @version 1.2.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import SearchHome from '../screens/Search/SearchHome';
import SearchActive from '../screens/Search/SearchActive';
import AlbumDetailScreen from '../screens/AlbumDetail';
import ArtistDetailScreen from '../screens/ArtistDetail';
import PodcastDetailScreen from '../screens/PodcastDetail';
import MixDetailScreen from '../screens/MixDetail';

const Stack = createNativeStackNavigator();

export default function SearchStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false, animation: 'slide_from_right'}}>
      <Stack.Screen name="SearchHome" component={SearchHome} />
      <Stack.Screen name="SearchActive" component={SearchActive} options={{animation: 'fade'}} />
      <Stack.Screen name="AlbumDetail" component={AlbumDetailScreen} />
      <Stack.Screen name="ArtistDetail" component={ArtistDetailScreen} />
      <Stack.Screen name="PodcastDetail" component={PodcastDetailScreen} />
      <Stack.Screen name="MixDetail" component={MixDetailScreen} />
    </Stack.Navigator>
  );
}