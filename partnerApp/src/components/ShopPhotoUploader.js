import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  Modal,
  ScrollView,
  useWindowDimensions
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { usePartner } from '../context/PartnerContext';
import { resolveMediaUrl } from '../utils/media';
import { showAlert } from '../utils/alert';

export const ShopPhotoUploader = () => {
  const { vendor, uploadShopPhoto, removeShopPhoto } = usePartner();
  const { width: windowWidth } = useWindowDimensions();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [lastSelectedAsset, setLastSelectedAsset] = useState(null);

  // Staged image for 16:9 crop and reposition modal
  const [stagedAsset, setStagedAsset] = useState(null);
  const [stagedImageObj, setStagedImageObj] = useState(null);
  const [zoom, setZoom] = useState(1.0);
  const [panX, setPanX] = useState(0); // -1 (left) to 1 (right)
  const [panY, setPanY] = useState(0); // 1 (top) to -1 (bottom)
  const [isRenderingCanvas, setIsRenderingCanvas] = useState(false);

  const canvasRef = useRef(null);
  const bannerUrl = resolveMediaUrl(vendor?.banner);
  const hasPhoto = Boolean(bannerUrl);

  // 1. Pick Image
  const handlePick = async () => {
    setUploadError(null);
    setSuccessMessage('');
    try {
      if (Platform.OS !== 'web') {
        const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          if (!canAskAgain) {
            showAlert(
              'Photo Permission Required',
              'Photo library access is disabled. Please open device Settings to allow photo selection.'
            );
          } else {
            showAlert('Permission Denied', 'Please grant photo library access to choose your shop cover photo.');
          }
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: Platform.OS !== 'web',
        aspect: [16, 9],
        quality: 0.92,
        selectionLimit: 1
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      setLastSelectedAsset(asset);

      // Reset crop parameters for the newly selected photo
      setZoom(1.0);
      setPanX(0);
      setPanY(0);
      setStagedAsset(asset);

      // On web: preload image element for Canvas crop operations
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          setStagedImageObj(img);
        };
        img.src = asset.uri;
      }
    } catch (err) {
      console.warn('Shop photo picker error:', err);
      setUploadError('Could not open photo picker. Please try again.');
    }
  };

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleCustom = (e) => {
        if (e.detail?.uri) {
          const uri = e.detail.uri;
          setZoom(e.detail.zoom || 1.0);
          setPanX(e.detail.panX || 0);
          setPanY(e.detail.panY !== undefined ? e.detail.panY : 1);
          setStagedAsset({ uri, name: 'staged_photo.png', type: 'image/png' });
          const img = new window.Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => setStagedImageObj(img);
          img.src = uri;
        }
      };
      window.addEventListener('stage_shop_photo', handleCustom);
      return () => window.removeEventListener('stage_shop_photo', handleCustom);
    }
  }, []);

  // 2. Render live preview onto canvas whenever crop parameters change (Web)
  const renderPreviewCanvas = useCallback(() => {
    if (Platform.OS !== 'web' || !canvasRef.current || !stagedImageObj) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const W = canvas.width; // 1280
    const H = canvas.height; // 720
    const nw = stagedImageObj.naturalWidth || stagedImageObj.width;
    const nh = stagedImageObj.naturalHeight || stagedImageObj.height;

    if (!nw || !nh) return;

    // Background fill (clean light neutral canvas)
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, W, H);

    // Base scale to cover 16:9 canvas without distortion
    const baseScale = Math.max(W / nw, H / nh);
    const totalScale = baseScale * zoom;
    const renderedW = nw * totalScale;
    const renderedH = nh * totalScale;

    // Available shifts for user panning
    const maxShiftX = Math.max(0, (renderedW - W) / 2);
    const maxShiftY = Math.max(0, (renderedH - H) / 2);

    const drawX = (W - renderedW) / 2 + (panX * maxShiftX);
    const drawY = (H - renderedH) / 2 + (panY * maxShiftY);

    ctx.drawImage(stagedImageObj, drawX, drawY, renderedW, renderedH);
  }, [stagedImageObj, zoom, panX, panY]);

  useEffect(() => {
    if (stagedAsset && stagedImageObj) {
      renderPreviewCanvas();
    }
  }, [stagedAsset, stagedImageObj, renderPreviewCanvas]);

  // 3. Save & Apply Crop
  const handleApplyCropAndUpload = async () => {
    if (!stagedAsset) return;
    setIsUploading(true);
    setUploadError(null);

    try {
      let fileToUpload = stagedAsset;

      // On Web: export exact 16:9 crop from Canvas as high-quality JPEG Blob
      if (Platform.OS === 'web' && canvasRef.current && stagedImageObj) {
        renderPreviewCanvas();
        const canvas = canvasRef.current;

        const blob = await new Promise((resolve) => {
          canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92);
        });

        if (blob) {
          fileToUpload = blob;
          fileToUpload.name = 'shop_cover_16_9.jpg';
        }
      } else if (Platform.OS !== 'web' && stagedAsset) {
        fileToUpload = {
          uri: stagedAsset.uri,
          name: stagedAsset.fileName || stagedAsset.name || 'shop_cover_16_9.jpg',
          type: stagedAsset.mimeType || stagedAsset.type || 'image/jpeg'
        };
      }

      const res = await uploadShopPhoto(fileToUpload);
      if (res && res.success) {
        setSuccessMessage('Shop cover photo updated and saved successfully.');
        setUploadError(null);
        setStagedAsset(null);
        setStagedImageObj(null);
        setLastSelectedAsset(null);
        setTimeout(() => setSuccessMessage(''), 5000);
      } else {
        setUploadError(res?.message || 'Failed to upload photo. Tap retry.');
      }
    } catch (e) {
      setUploadError(e.message || 'Network error uploading photo.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancelCrop = () => {
    setStagedAsset(null);
    setStagedImageObj(null);
    setUploadError(null);
  };

  const handleConfirmRemove = () => {
    showAlert(
      'Remove Shop Photo',
      'Are you sure you want to remove your shop cover photo? Customers will see the default store placeholder.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setIsUploading(true);
            setUploadError(null);
            try {
              const res = await removeShopPhoto();
              if (res && res.success) {
                setSuccessMessage('Shop cover photo removed.');
                setTimeout(() => setSuccessMessage(''), 4000);
              } else {
                setUploadError(res?.message || 'Could not remove photo.');
              }
            } catch (err) {
              setUploadError(err.message || 'Error removing photo.');
            } finally {
              setIsUploading(false);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Guidance Note beside Picker */}
      <View style={styles.guidanceBox}>
        <View style={styles.guidanceIconCircle}>
          <Ionicons name="information-circle" size={18} color="#0284c7" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.guidanceTitle}>Choose a landscape photo of your actual shop</Text>
          <Text style={styles.guidanceSub}>
            Upload a clear 16:9 view of your storefront, farm counter, or kitchen. Customers see this on search, store listings, and your store header.
          </Text>
        </View>
      </View>

      {/* Saved Cover Photo Preview Box (Customer-Facing 16:9 Framing) */}
      <View style={styles.previewBox}>
        {hasPhoto ? (
          <Image
            source={{ uri: bannerUrl }}
            style={styles.bannerImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.placeholderBox}>
            <View style={styles.placeholderIconCircle}>
              <Ionicons name="storefront-outline" size={32} color="#16a34a" />
            </View>
            <Text style={styles.placeholderTitle}>No Shop Cover Photo</Text>
            <Text style={styles.placeholderSub}>
              Upload a landscape photo of your storefront, farm, or kitchen
            </Text>
          </View>
        )}

        {/* 16:9 Aspect Ratio Pill Badge */}
        <View style={styles.ratioBadge}>
          <Ionicons name="aspect-ratio-outline" size={12} color="#ffffff" />
          <Text style={styles.ratioBadgeText}>16:9 Customer View</Text>
        </View>

        {hasPhoto && (
          <View style={styles.savedPill}>
            <Ionicons name="checkmark-circle" size={12} color="#15803d" />
            <Text style={styles.savedPillText}>Saved in Profile</Text>
          </View>
        )}

        {isUploading && !stagedAsset && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#ffffff" />
            <Text style={styles.loadingText}>Saving photo to store profile...</Text>
          </View>
        )}
      </View>

      {/* Success Notification */}
      {successMessage ? (
        <View style={styles.successBanner}>
          <Ionicons name="checkmark-circle" size={16} color="#15803d" />
          <Text style={styles.successText}>{successMessage}</Text>
        </View>
      ) : null}

      {/* Error Notification */}
      {uploadError && !stagedAsset ? (
        <View style={styles.errorBanner}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="alert-circle" size={16} color="#b91c1c" />
            <Text style={styles.errorText} numberOfLines={2}>{uploadError}</Text>
          </View>
          <TouchableOpacity style={styles.retryBtn} onPress={handlePick} activeOpacity={0.8}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Main Action Buttons Row */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.uploadBtn, isUploading && styles.disabledBtn]}
          onPress={handlePick}
          disabled={isUploading}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={hasPhoto ? 'Change Shop Photo' : 'Upload Shop Photo'}
        >
          <Ionicons name={hasPhoto ? 'camera-reverse-outline' : 'cloud-upload-outline'} size={18} color="#ffffff" />
          <Text style={styles.uploadBtnText}>
            {hasPhoto ? 'Change Photo' : 'Upload Shop Photo'}
          </Text>
        </TouchableOpacity>

        {hasPhoto && (
          <TouchableOpacity
            style={[styles.removeBtn, isUploading && styles.disabledBtn]}
            onPress={handleConfirmRemove}
            disabled={isUploading}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Remove Shop Photo"
          >
            <Ionicons name="trash-outline" size={16} color="#b91c1c" />
            <Text style={styles.removeBtnText}>Remove</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.helperText}>
        Recommended ratio 16:9 • Max 5 MB • Formats: JPEG, PNG, WEBP
      </Text>

      {/* 16:9 Crop, Reposition & Framing Modal */}
      {stagedAsset && (
        <Modal
          visible={true}
          transparent={true}
          animationType="fade"
          onRequestClose={handleCancelCrop}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { maxWidth: Math.min(windowWidth - 32, 540) }]}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Adjust & Frame Shop Cover Photo</Text>
                  <Text style={styles.modalSubtitle}>
                    Position and frame your photo. Customers see this exact 16:9 composition.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleCancelCrop}
                  style={styles.modalCloseBtn}
                  disabled={isUploading}
                  accessibilityLabel="Close framing"
                >
                  <Ionicons name="close" size={20} color="#64748b" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
                {/* 16:9 Viewfinder Canvas Container */}
                <View style={styles.viewfinderWrapper}>
                  {Platform.OS === 'web' ? (
                    <canvas
                      ref={canvasRef}
                      width={1280}
                      height={720}
                      style={{
                        width: '100%',
                        height: 'auto',
                        aspectRatio: '16 / 9',
                        display: 'block',
                        borderRadius: 12,
                        backgroundColor: '#f8fafc'
                      }}
                    />
                  ) : (
                    <View style={styles.nativePreviewContainer}>
                      <Image
                        source={{ uri: stagedAsset.uri }}
                        style={[
                          styles.nativePreviewImg,
                          {
                            transform: [
                              { scale: zoom },
                              { translateX: panX * 40 },
                              { translateY: panY * 40 }
                            ]
                          }
                        ]}
                        resizeMode="cover"
                      />
                    </View>
                  )}

                  {/* Customer Card Live Simulation Overlay */}
                  <View style={styles.customerSimulationBadge}>
                    <Text style={styles.simulationText}>Customer View (16:9)</Text>
                  </View>

                  {/* Viewfinder Corner Grid Accents */}
                  <View style={[styles.cornerGuide, styles.cornerTL]} />
                  <View style={[styles.cornerGuide, styles.cornerTR]} />
                  <View style={[styles.cornerGuide, styles.cornerBL]} />
                  <View style={[styles.cornerGuide, styles.cornerBR]} />
                </View>

                {/* Repositioning & Framing Controls */}
                {Platform.OS === 'web' ? (
                  <>
                    {/* Vertical Repositioning Controls */}
                    <View style={styles.controlSection}>
                      <View style={styles.controlHeaderRow}>
                        <Text style={styles.controlLabel}>Vertical Alignment</Text>
                        <Text style={styles.controlValue}>
                          {panY > 0.3 ? 'Top' : panY < -0.3 ? 'Bottom' : 'Center'}
                        </Text>
                      </View>
                      <View style={styles.presetButtonsRow}>
                        <TouchableOpacity
                          style={[styles.presetBtn, panY === 1 && styles.presetBtnActive]}
                          onPress={() => setPanY(1)}
                          disabled={isUploading}
                        >
                          <Ionicons name="arrow-up" size={14} color={panY === 1 ? '#ffffff' : '#334155'} />
                          <Text style={[styles.presetBtnText, panY === 1 && styles.presetBtnTextActive]}>Top</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.presetBtn, panY === 0 && styles.presetBtnActive]}
                          onPress={() => setPanY(0)}
                          disabled={isUploading}
                        >
                          <Ionicons name="reorder-two-outline" size={14} color={panY === 0 ? '#ffffff' : '#334155'} />
                          <Text style={[styles.presetBtnText, panY === 0 && styles.presetBtnTextActive]}>Center</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.presetBtn, panY === -1 && styles.presetBtnActive]}
                          onPress={() => setPanY(-1)}
                          disabled={isUploading}
                        >
                          <Ionicons name="arrow-down" size={14} color={panY === -1 ? '#ffffff' : '#334155'} />
                          <Text style={[styles.presetBtnText, panY === -1 && styles.presetBtnTextActive]}>Bottom</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Zoom & Scale Controls */}
                    <View style={styles.controlSection}>
                      <View style={styles.controlHeaderRow}>
                        <Text style={styles.controlLabel}>Zoom & Scale</Text>
                        <Text style={styles.controlValue}>{zoom.toFixed(2)}x</Text>
                      </View>
                      <View style={styles.presetButtonsRow}>
                        {[1.0, 1.25, 1.5, 2.0].map((zVal) => (
                          <TouchableOpacity
                            key={zVal}
                            style={[styles.presetBtn, Math.abs(zoom - zVal) < 0.05 && styles.presetBtnActive]}
                            onPress={() => setZoom(zVal)}
                            disabled={isUploading}
                          >
                            <Text style={[styles.presetBtnText, Math.abs(zoom - zVal) < 0.05 && styles.presetBtnTextActive]}>
                              {zVal.toFixed(2)}x
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    {/* Horizontal Alignment Controls */}
                    <View style={styles.controlSection}>
                      <View style={styles.controlHeaderRow}>
                        <Text style={styles.controlLabel}>Horizontal Alignment</Text>
                        <Text style={styles.controlValue}>
                          {panX < -0.3 ? 'Left' : panX > 0.3 ? 'Right' : 'Center'}
                        </Text>
                      </View>
                      <View style={styles.presetButtonsRow}>
                        <TouchableOpacity
                          style={[styles.presetBtn, panX === -1 && styles.presetBtnActive]}
                          onPress={() => setPanX(-1)}
                          disabled={isUploading}
                        >
                          <Ionicons name="arrow-back" size={14} color={panX === -1 ? '#ffffff' : '#334155'} />
                          <Text style={[styles.presetBtnText, panX === -1 && styles.presetBtnTextActive]}>Left</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.presetBtn, panX === 0 && styles.presetBtnActive]}
                          onPress={() => setPanX(0)}
                          disabled={isUploading}
                        >
                          <Ionicons name="reorder-two-outline" size={14} color={panX === 0 ? '#ffffff' : '#334155'} />
                          <Text style={[styles.presetBtnText, panX === 0 && styles.presetBtnTextActive]}>Center</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.presetBtn, panX === 1 && styles.presetBtnActive]}
                          onPress={() => setPanX(1)}
                          disabled={isUploading}
                        >
                          <Ionicons name="arrow-forward" size={14} color={panX === 1 ? '#ffffff' : '#334155'} />
                          <Text style={[styles.presetBtnText, panX === 1 && styles.presetBtnTextActive]}>Right</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </>
                ) : (
                  <View style={styles.nativeCropNoteBox}>
                    <Ionicons name="shield-checkmark" size={16} color="#15803d" />
                    <Text style={styles.nativeCropNoteText}>
                      Native 16:9 crop applied. Tap "Save & Apply" to update your storefront profile.
                    </Text>
                  </View>
                )}

                {/* Modal Upload Error */}
                {uploadError && (
                  <View style={styles.modalErrorBanner}>
                    <Ionicons name="alert-circle" size={16} color="#b91c1c" />
                    <Text style={styles.modalErrorText}>{uploadError}</Text>
                  </View>
                )}
              </ScrollView>

              {/* Modal Action Buttons */}
              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={[styles.modalCancelBtn, isUploading && styles.disabledBtn]}
                  onPress={handleCancelCrop}
                  disabled={isUploading}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalSaveBtn, isUploading && styles.disabledBtn]}
                  onPress={handleApplyCropAndUpload}
                  disabled={isUploading}
                  activeOpacity={0.85}
                >
                  {isUploading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
                  )}
                  <Text style={styles.modalSaveText}>
                    {isUploading ? 'Saving 16:9 Cover...' : 'Save & Apply (16:9)'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 4
  },
  guidanceBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    gap: 8
  },
  guidanceIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1
  },
  guidanceTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0369a1'
  },
  guidanceSub: {
    fontSize: 11,
    color: '#0284c7',
    marginTop: 2,
    lineHeight: 15
  },
  previewBox: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center'
  },
  bannerImage: {
    width: '100%',
    height: '100%'
  },
  placeholderBox: {
    alignItems: 'center',
    paddingHorizontal: 20
  },
  placeholderIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#dcfce7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8
  },
  placeholderTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#334155'
  },
  placeholderSub: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 2
  },
  ratioBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  ratioBadgeText: {
    color: '#ffffff',
    fontSize: 10.5,
    fontWeight: '700'
  },
  savedPill: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bbf7d0'
  },
  savedPillText: {
    color: '#15803d',
    fontSize: 10.5,
    fontWeight: '700'
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    zIndex: 10
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '700'
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: '#86efac'
  },
  successText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803d',
    flex: 1
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#fca5a5'
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b91c1c'
  },
  retryBtn: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6
  },
  retryBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700'
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12
  },
  uploadBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16a34a',
    paddingVertical: 11,
    borderRadius: 10,
    gap: 8,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2
  },
  uploadBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: '#fca5a5'
  },
  removeBtnText: {
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: '700'
  },
  disabledBtn: {
    opacity: 0.6
  },
  helperText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 8,
    textAlign: 'center'
  },

  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  modalCard: {
    width: '100%',
    maxHeight: '92%',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  modalTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0f172a'
  },
  modalSubtitle: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 2
  },
  modalCloseBtn: {
    padding: 4,
    marginLeft: 8
  },
  modalScroll: {
    paddingVertical: 12
  },
  viewfinderWrapper: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0f172a',
    borderWidth: 2,
    borderColor: '#16a34a'
  },
  nativePreviewContainer: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center'
  },
  nativePreviewImg: {
    width: '100%',
    height: '100%'
  },
  customerSimulationBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6
  },
  simulationText: {
    color: '#ffffff',
    fontSize: 10.5,
    fontWeight: '700'
  },
  cornerGuide: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderColor: '#ffffff',
    opacity: 0.85
  },
  cornerTL: {
    top: 6,
    left: 6,
    borderTopWidth: 2,
    borderLeftWidth: 2
  },
  cornerTR: {
    top: 6,
    right: 6,
    borderTopWidth: 2,
    borderRightWidth: 2
  },
  cornerBL: {
    bottom: 6,
    left: 6,
    borderBottomWidth: 2,
    borderLeftWidth: 2
  },
  cornerBR: {
    bottom: 6,
    right: 6,
    borderBottomWidth: 2,
    borderRightWidth: 2
  },
  controlSection: {
    marginTop: 12
  },
  controlHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  controlLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155'
  },
  controlValue: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#16a34a'
  },
  presetButtonsRow: {
    flexDirection: 'row',
    gap: 8
  },
  presetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    paddingVertical: 7,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  presetBtnActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a'
  },
  presetBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155'
  },
  presetBtnTextActive: {
    color: '#ffffff'
  },
  modalErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fee2e2',
    padding: 8,
    borderRadius: 8,
    marginTop: 10
  },
  modalErrorText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#b91c1c'
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569'
  },
  modalSaveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#16a34a',
    gap: 6,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2
  },
  modalSaveText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff'
  },
  nativeCropNoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    padding: 12,
    borderRadius: 10,
    marginTop: 12
  },
  nativeCropNoteText: {
    fontSize: 12,
    color: '#15803d',
    fontWeight: '600',
    flex: 1
  }
});
