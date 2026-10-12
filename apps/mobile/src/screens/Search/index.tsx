/**
 * @file index.tsx
 * @description Search feature entry — re-exports the SearchStack navigator so
 *   the tab navigator imports a single path regardless of internal structure.
 * @author DoodzProg
 * @version 1.0.0
 * @license CC-BY-NC-4.0
 */
import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import SearchHome from './SearchHome';
import SearchActive from './SearchActive';
import ArtistDetailScreen from '../ArtistDetail';
import AlbumDetailScreen from '../AlbumDetail';
import type {SearchStackParams} from '../../navigation/types';

const Stack = createNativeStackNavigator<SearchStackParams>();

export default function SearchNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="SearchHome" component={SearchHome} />
      <Stack.Screen name="SearchActive" component={SearchActive} />
      <Stack.Screen name="ArtistDetail" component={ArtistDetailScreen} />
      <Stack.Screen name="AlbumDetail" component={AlbumDetailScreen} />
    </Stack.Navigator>
  );
}