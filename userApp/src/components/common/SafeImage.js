import React, { useState, useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const DEFAULT_FALLBACK_IMAGE = require('../../../assets/farmart24_logo.jpg');

export const isValidImageUri = (uri) => {
  return typeof uri === 'string' && uri.trim().length > 0;
};

export const getSafeImageSource = (source, fallback = DEFAULT_FALLBACK_IMAGE) => {
  if (typeof source === 'number') {
    return source;
  }
  if (source && typeof source === 'object') {
    if (isValidImageUri(source.uri)) {
      return { ...source, uri: source.uri.trim() };
    }
  } else if (isValidImageUri(source)) {
    return { uri: source.trim() };
  }
  return fallback;
};

export const SafeImage = ({
  source,
  fallbackSource = null,
  placeholderIcon = 'image-outline',
  placeholderIconSize = 24,
  placeholderIconColor = '#94a3b8',
  placeholderBg = '#f1f5f9',
  style,
  resizeMode = 'cover',
  onError,
  ...rest
}) => {
  const [hasError, setHasError] = useState(false);
  const [failedUri, setFailedUri] = useState(null);

  const rawUri = typeof source === 'object' && source?.uri ? source.uri : (typeof source === 'string' ? source : null);
  const validUri = isValidImageUri(rawUri) ? rawUri.trim() : null;

  // Reset error only if the URI changes to a new non-empty URI
  useEffect(() => {
    if (validUri && validUri !== failedUri) {
      setHasError(false);
    }
  }, [validUri, failedUri]);

  // Case 1: Local require() image source
  if (typeof source === 'number') {
    return <Image source={source} style={style} resizeMode={resizeMode} {...rest} />;
  }

  // Case 2: No valid URI or load error occurred
  if (!validUri || hasError) {
    if (fallbackSource) {
      return <Image source={fallbackSource} style={style} resizeMode={resizeMode} {...rest} />;
    }
    return (
      <View style={[styles.placeholderBase, { backgroundColor: placeholderBg }, style]}>
        <Ionicons name={placeholderIcon} size={placeholderIconSize} color={placeholderIconColor} />
      </View>
    );
  }

  // Case 3: Valid remote URI
  return (
    <Image
      source={{ ...((typeof source === 'object' && source) || {}), uri: validUri }}
      style={style}
      resizeMode={resizeMode}
      onError={(e) => {
        setFailedUri(validUri);
        setHasError(true);
        if (typeof onError === 'function') {
          onError(e);
        }
      }}
      {...rest}
    />
  );
};

const styles = StyleSheet.create({
  placeholderBase: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden'
  }
});

export default SafeImage;
