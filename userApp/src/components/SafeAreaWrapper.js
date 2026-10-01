import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

/**
 * SafeAreaWrapper ensures that its children are rendered within the safe area
 * on all platforms (iOS, Android, Web). It uses the edges prop to avoid extra
 * padding for the top edge when the root is already wrapped with SafeAreaProvider.
 */
export const SafeAreaWrapper = ({ children, style }) => (
  <SafeAreaView edges={['right','bottom','left']} style={[styles.wrapper, style]}>{children}</SafeAreaView>
);

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
