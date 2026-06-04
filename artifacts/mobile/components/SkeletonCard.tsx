import React, { useEffect, useState } from "react";
import { Animated, StyleSheet, View, type DimensionValue } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useReducedMotion } from "@/hooks/useReducedMotion";

type Props = { count?: number };

function ShimmerBar({ width, height = 16, colors, reduceMotion }: { width: DimensionValue; height?: number; colors: ReturnType<typeof useColors>; reduceMotion: boolean }) {
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) {
      anim.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim, reduceMotion]);

  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.8] });
  return (
    <Animated.View
      style={[
        { width, height, borderRadius: 8, backgroundColor: colors.muted, opacity },
      ]}
    />
  );
}

function SkeletonItem({ colors, reduceMotion }: { colors: ReturnType<typeof useColors>; reduceMotion: boolean }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <ShimmerBar width={44} height={44} colors={colors} reduceMotion={reduceMotion} />
      <View style={styles.info}>
        <ShimmerBar width="60%" height={14} colors={colors} reduceMotion={reduceMotion} />
        <ShimmerBar width="40%" height={11} colors={colors} reduceMotion={reduceMotion} />
        <ShimmerBar width="50%" height={12} colors={colors} reduceMotion={reduceMotion} />
      </View>
      <ShimmerBar width={36} height={28} colors={colors} reduceMotion={reduceMotion} />
    </View>
  );
}

export function SkeletonCard({ count = 5 }: Props) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonItem key={i} colors={colors} reduceMotion={reduceMotion} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  info: { flex: 1, gap: 6 },
});
