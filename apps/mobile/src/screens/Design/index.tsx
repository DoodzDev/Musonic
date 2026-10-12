/**
 * @file index.tsx
 * @description Design screen, debug builds only: the app's internal design
 *   reference. A segmented control switches between the Foundations tab
 *   (tokens, icons, motion, haptics), the Components tab and the Gestures tab
 *   (swipes, sheets, toasts). Reached from the drawer in Musonic Dev.
 * @author DoodzProg
 * @version 2.1.0
 * @license CC-BY-NC-4.0
 */
import React, {useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import BackArrowIcon from '../../components/icons/BackArrowIcon';
import Text from '../../components/ui/Text';
import Button from '../../components/ui/Button';
import SegmentedControl from '../../components/ui/SegmentedControl';
import FoundationsTab from './FoundationsTab';
import ComponentsTab from './ComponentsTab';
import GesturesTab from './GesturesTab';
import {ToastHost} from '../../components/ui/Toast';
import {colors, spacing} from '../../theme';

type Tab = 'foundations' | 'components' | 'gestures';

const TABS = {foundations: FoundationsTab, components: ComponentsTab, gestures: GesturesTab};

export default function DesignScreen() {
  const navigation = useNavigation();
  const [tab, setTab] = useState<Tab>('foundations');
  const Content = TABS[tab];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Button
          variant="icon"
          accessibilityLabel="Retour"
          onPress={() => navigation.goBack()}
          icon={<BackArrowIcon size={22} color={colors.textPrimary} />}
          style={styles.back}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="caption" color="accent">
          MUSONIC DEV · DESIGN V2
        </Text>
        <Text variant="largeTitle" accessibilityRole="header">
          Design
        </Text>
        <SegmentedControl
          options={[
            {value: 'foundations', label: 'Fondations'},
            {value: 'components', label: 'Composants'},
            {value: 'gestures', label: 'Gestes'},
          ]}
          value={tab}
          onChange={setTab}
        />
        <Content />
      </ScrollView>
      <ToastHost bottom={spacing.xl} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.background},
  header: {paddingHorizontal: spacing.s},
  back: {backgroundColor: 'transparent'},
  content: {
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.xxxl,
    gap: spacing.s,
  },
});
