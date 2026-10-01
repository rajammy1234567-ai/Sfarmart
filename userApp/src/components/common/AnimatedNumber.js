import React, { useEffect, useState, useRef } from 'react';
import { Text } from 'react-native';

/**
 * AnimatedNumber
 * Smoothly animates number transitions (count-up/down) over a given duration.
 */
export const AnimatedNumber = ({ value = 0, duration = 600, prefix = '', suffix = '', style }) => {
  const [displayValue, setDisplayValue] = useState(Number(value) || 0);
  const startValRef = useRef(Number(value) || 0);

  useEffect(() => {
    const endVal = Number(value) || 0;
    const startVal = startValRef.current;
    if (startVal === endVal) {
      setDisplayValue(endVal);
      return;
    }

    const startTime = Date.now();
    const frameInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startVal + (endVal - startVal) * eased);
      setDisplayValue(current);

      if (progress >= 1) {
        clearInterval(frameInterval);
        startValRef.current = endVal;
        setDisplayValue(endVal);
      }
    }, 16);

    return () => clearInterval(frameInterval);
  }, [value, duration]);

  return (
    <Text style={style}>
      {prefix}{displayValue.toLocaleString('en-IN')}{suffix}
    </Text>
  );
};
