import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native'
import { File, X, Send, Plus, KeyRound, Sparkles, Layers } from 'lucide-react-native'
import { theme, fonts } from '../theme'

export interface StagedItem {
  id: string
  name: string
  size: number
  path: string
  type?: 'image' | 'video' | 'doc' | 'other'
}

interface StagingBasketProps {
  items: StagedItem[]
  onRemoveItem: (id: string) => void
  onAddMore: () => void
  onSelectRecipient: () => void
  onCreateDropCode: () => void
}

export function StagingBasket({
  items,
  onRemoveItem,
  onAddMore,
  onSelectRecipient,
  onCreateDropCode,
}: StagingBasketProps) {
  if (!items || items.length === 0) return null

  const totalBytes = items.reduce((acc, it) => acc + (it.size || 0), 0)
  const formatBytes = (b: number) => {
    if (b >= 1024 * 1024 * 1024) return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`
    if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`
    return `${Math.round(b / 1024)} KB`
  }

  return (
    <View style={styles.sheetContainer}>
      {/* Header Summary */}
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          <View style={styles.badgeIcon}>
            <Layers size={14} color={theme.primary} />
          </View>
          <View>
            <Text style={styles.title}>Staged Payloads</Text>
            <Text style={styles.subtitle}>
              {items.length} file{items.length === 1 ? '' : 's'} · {formatBytes(totalBytes)} ready to beam
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.addMoreBtn} onPress={onAddMore} activeOpacity={0.7}>
          <Plus size={14} color={theme.text} />
          <Text style={styles.addMoreText}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Horizontal Staging Tray */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollList}
      >
        {items.map((item) => (
          <View key={item.id} style={styles.itemChip}>
            <View style={styles.fileIconBox}>
              <File size={13} color={theme.primary} />
            </View>
            <Text style={styles.itemName} numberOfLines={1}>
              {item.name}
            </Text>
            <TouchableOpacity
              onPress={() => onRemoveItem(item.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.removeBtn}
            >
              <X size={12} color={theme.muted} />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onCreateDropCode} activeOpacity={0.8}>
          <KeyRound size={15} color={theme.text} />
          <Text style={styles.secondaryBtnText}>DROP Code</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.primaryBtn} onPress={onSelectRecipient} activeOpacity={0.8}>
          <Send size={15} color="#FFFFFF" />
          <Text style={styles.primaryBtnText}>Beam to Peer</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopLeftRadius: theme.radiusXl,
    borderTopRightRadius: theme.radiusXl,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgeIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: theme.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(79, 70, 229, 0.2)',
  },
  title: {
    color: theme.text,
    fontSize: 14.5,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  subtitle: {
    color: theme.textSecondary,
    fontSize: 11.5,
    marginTop: 1,
  },
  addMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: theme.bgElevated,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radiusSm,
    gap: 4,
  },
  addMoreText: {
    color: theme.text,
    fontSize: 12,
    fontWeight: '700',
  },
  scrollList: {
    gap: 8,
    paddingVertical: 2,
  },
  itemChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.bgElevated,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    maxWidth: 190,
    gap: 6,
  },
  fileIconBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: theme.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemName: {
    color: theme.text,
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  removeBtn: {
    padding: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: theme.border,
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  secondaryBtnText: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '800',
  },
  primaryBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.primary,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '900',
  },
})
