/**
 * @file SleepTimerSheet.tsx
 * @description Choice of the sleep timer (from the player's "…" menu): any
 *   duration on hours / minutes / seconds wheels, quick presets, the end of
 *   the current track, or off; shows what is set.
 * @author DoodzProg
 * @version 1.1.0
 * @license CC-BY-NC-4.0
 */
import React, {useState} from 'react';
import {ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent} from 'react-native';
import Sheet from './ui/Sheet';
import Button from './ui/Button';
import Chip from './ui/Chip';
import Text from './ui/Text';
import {ListGroup, ListItem} from './ui/ListGroup';
import {CheckIcon} from './icons';
import {colors, radii, spacing} from '../theme';
import {useT} from '../i18n';
import {secondsLeft, setSleepTimer, useSleepTimerStore} from '../services/sleepTimer';

/** Quick choices, in minutes. */
const PRESETS = [15, 30, 45, 60, 90];
const ROW = 40;
const VISIBLE_ROWS = 5;

/** Last custom duration, kept while the app runs (30 min the first time). */
let lastCustom = {h: 0, m: 30, s: 0};

/** A column of numbers that snaps on one, like a phone's timer. */
function Wheel({max, value, onChange, unit}: {max: number; value: number; onChange: (v: number) => void; unit: string}) {
  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    onChange(Math.min(max, Math.max(0, Math.round(e.nativeEvent.contentOffset.y / ROW))));
  return (
    <View style={styles.wheel}>
      <ScrollView
        snapToInterval={ROW}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        contentOffset={{x: 0, y: value * ROW}}
        contentContainerStyle={styles.wheelContent}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={settle}>
        {Array.from({length: max + 1}, (_, i) => (
          <View key={i} style={styles.wheelRow}>
            <Text variant="title3" color={i === value ? 'textPrimary' : 'textSecondary'}>
              {String(i).padStart(2, '0')}
            </Text>
          </View>
        ))}
      </ScrollView>
      <Text variant="footnote" color="textSecondary" style={styles.unit}>
        {unit}
      </Text>
    </View>
  );
}

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function SleepTimerSheet({visible, onClose}: Props) {
  const t = useT();
  const endsAt = useSleepTimerStore(s => s.endsAt);
  const endOfTrack = useSleepTimerStore(s => s.endOfTrack);
  const active = endsAt !== null || endOfTrack;
  const [h, setH] = useState(lastCustom.h);
  const [m, setM] = useState(lastCustom.m);
  const [s, setS] = useState(lastCustom.s);
  const total = h * 3600 + m * 60 + s;

  const choose = (choice: number | 'track' | null) => {
    setSleepTimer(choice);
    onClose();
  };
  const startCustom = () => {
    lastCustom = {h, m, s};
    choose(total);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t.sleepTimer.title} scrollable>
      <View style={styles.body}>
        {active ? (
          <Text variant="footnote" color="accent" style={styles.status}>
            {endsAt !== null ? t.sleepTimer.stopsIn(t.sleepTimer.duration(secondsLeft(endsAt))) : t.sleepTimer.stopsAtEnd}
          </Text>
        ) : null}

        <View style={styles.wheels}>
          <View pointerEvents="none" style={styles.band} />
          <Wheel max={23} value={h} onChange={setH} unit={t.sleepTimer.hoursUnit} />
          <Wheel max={59} value={m} onChange={setM} unit={t.sleepTimer.minutesUnit} />
          <Wheel max={59} value={s} onChange={setS} unit={t.sleepTimer.secondsUnit} />
        </View>
        <Button
          variant="filled"
          label={total > 0 ? t.sleepTimer.start(t.sleepTimer.duration(total)) : t.sleepTimer.pickDuration}
          disabled={total === 0}
          onPress={startCustom}
        />

        <View style={styles.presets}>
          {PRESETS.map(p => (
            <Chip key={p} label={t.sleepTimer.duration(p * 60)} selected={false} onPress={() => choose(p * 60)} />
          ))}
        </View>

        <ListGroup raised>
          <ListItem
            label={t.sleepTimer.endOfTrack}
            accessory={endOfTrack ? <CheckIcon size={20} color={colors.accent} strokeWidth={2.5} /> : undefined}
            onPress={() => choose('track')}
          />
          {active ? <ListItem label={t.sleepTimer.off} destructive onPress={() => choose(null)} /> : null}
        </ListGroup>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {paddingHorizontal: spacing.m, paddingBottom: spacing.l, gap: spacing.m},
  status: {textAlign: 'center'},
  wheels: {flexDirection: 'row', justifyContent: 'center', gap: spacing.l, height: ROW * VISIBLE_ROWS},
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: ROW * 2,
    height: ROW,
    borderRadius: radii.button,
    backgroundColor: colors.fill,
  },
  wheel: {flexDirection: 'row', alignItems: 'center'},
  wheelContent: {paddingVertical: ROW * 2},
  wheelRow: {height: ROW, width: 48, alignItems: 'center', justifyContent: 'center'},
  unit: {width: 28},
  presets: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s, justifyContent: 'center'},
});
