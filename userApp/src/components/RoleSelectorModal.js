import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
  Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, roles } from '../theme/colors';
import { useApp } from '../context/AppContext';

const LOGO = require('../../assets/farmart24_logo.jpg');
const safeRoles = Array.isArray(roles)
  ? roles
  : [
      {
        id: 'customer',
        name: 'Customer',
        desc: 'Shop fresh produce & everyday essentials',
        icon: 'person-outline',
        color: '#16a34a',
      },
    ];

export const RoleSelectorModal = () => {
  const { activeRole, setActiveRole, isRoleModalOpen, setIsRoleModalOpen } = useApp();

  const handleSelect = (roleId) => {
    setActiveRole(roleId);
    setIsRoleModalOpen(false);
  };

  return (
    <Modal
      animationType="slide"
      transparent
      visible={isRoleModalOpen}
      onRequestClose={() => setIsRoleModalOpen(false)}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={() => setIsRoleModalOpen(false)}
      >
        <Pressable style={styles.content} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.modalHeader}>
            <Image source={LOGO} style={styles.logo} resizeMode="contain" />
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>Select role</Text>
              <Text style={styles.modalSubtitle}>Switch persona for multi-role demo</Text>
            </View>
            <TouchableOpacity
              onPress={() => setIsRoleModalOpen(false)}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.roleList} showsVerticalScrollIndicator={false}>
            {safeRoles && safeRoles.length > 0 ? (
              safeRoles.map((role) => {
                const isSelected = activeRole === role.id;
                return (
                  <TouchableOpacity
                    key={role.id}
                    style={[
                      styles.roleCard,
                      isSelected && { borderColor: role.color, backgroundColor: role.color + '0A' }
                    ]}
                    onPress={() => handleSelect(role.id)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.iconContainer,
                        { backgroundColor: isSelected ? role.color : '#f1f5f9' }
                      ]}
                    >
                      <Ionicons
                        name={role.icon}
                        size={22}
                        color={isSelected ? '#ffffff' : role.color}
                      />
                    </View>
                    <View style={styles.roleInfo}>
                      <Text
                        style={[
                          styles.roleName,
                          isSelected && { color: role.color, fontWeight: '500' }
                        ]}
                      >
                        {role.name}
                      </Text>
                      <Text style={styles.roleDesc}>{role.desc}</Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={24} color={role.color} />
                    )}
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No roles available right now.</Text>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end'
  },
  content: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 14
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10
  },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 8
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '500',
    color: colors.textPrimary
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center'
  },
  roleList: {
    marginBottom: 10
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: 10,
    gap: 12,
    backgroundColor: '#ffffff'
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  roleInfo: {
    flex: 1
  },
  roleName: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary
  },
  roleDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
  },
  emptyStateText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  }
});
