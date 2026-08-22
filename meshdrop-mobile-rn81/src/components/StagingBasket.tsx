import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native'
import { File, X, Send, Plus, KeyRound, Sparkles, Layers, Trash2 } from 'lucide-react-native'
import { useTheme, fonts } from '../theme'

export interface StagedItem {
  id: string
  name: string
  size: number
  path: string
  type?: string
}

interface StagingBasketProps {
  items: StagedItem[]
  isOpen?: boolean
  onToggleOpen?: () => void
  onRemoveItem: (id: string) => void
  onAddMore?: () => void
  onClear?: () => void
  onSelectRecipient?: () => void
  onDirectSend?: () => void
  onCreateDropCode?: () => void
  onGenerateDropCode?: (items: StagedItem[]) => void
}

export function StagingBasket({
  items,
  isOpen,
  onToggleOpen,
  onRemoveItem,
  onAddMore,
  onClear,
  onSelectRecipient,
  onDirectSend,
  onCreateDropCode,
  onGenerateDropCode,
}: StagingBasketProps) {
  const { theme } = useTheme()
  if (!items || items.length === 0) return null

  const totalBytes = items.reduce((acc, it) => acc + (it.size || 0), 0)
  const formatBytes = (b: number) => {
    if (b >= 1024 * 1024 * 1024) return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`
    if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`
    return `${Math.round(b / 1024)} KB`
  }

  const handleSend = onDirectSend || onSelectRecipient || (() => {})
  const handleDrop = () => {
    if (onGenerateDropCode) onGenerateDropCode(items)
    else if (onCreateDropCode) onCreateDropCode()
  }

  return (
    <View style={[styles.sheetContainer, { backgroundColor: theme.bgCard, borderTopColor: theme.border }]}>
      {/* Header Summary */}
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          <View style={[styles.badgeIcon, { backgroundColor: theme.primarySoft, borderColor: theme.primary + '35' }]}>
            <Layers size={14} color={theme.primary} />
          </View>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>Staged Payloads</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {items.length} file{items.length === 1 ? '' : 's'} · {formatBytes(totalBytes)} ready to beam
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          {onClear && (
            <TouchableOpacity
              style={[styles.addMoreBtn, { backgroundColor: theme.dangerBg, borderColor: theme.dangerBorder }]}
              onPress={onClear}
              activeOpacity={0.7}
            >
              <Trash2 size={13} color={theme.danger} />
              <Text style={[styles.addMoreText, { color: theme.danger }]}>Clear</Text>
            </TouchableOpacity>
          )}
          {onAddMore && (
            <TouchableOpacity
              style={[styles.addMoreBtn, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}
              onPress={onAddMore}
              activeOpacity={0.7}
            >
              <Plus size={14} color={theme.text} />
              <Text style={[styles.addMoreText, { color: theme.text }]}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Horizontal Staging Tray */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollList}
      >
        {items.map((item) => (
          <View key={item.id} style={[styles.itemChip, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
            <View style={[styles.fileIconBox, { backgroundColor: theme.primarySoft }]}>
              <File size={13} color={theme.primary} />
            </View>
            <Text style={[styles.itemName, { color: theme.text }]} numberOfLines={1}>
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
        <TouchableOpacity
          style={[styles.secondaryBtn, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}
          onPress={handleDrop}
          activeOpacity={0.8}
        >
          <KeyRound size={15} color={theme.text} />
          <Text style={[styles.secondaryBtnText, { color: theme.text }]}>DROP Code</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
          onPress={handleSend}
          activeOpacity={0.8}
        >
          <Send size={15} color="#FFFFFF" />
          <Text style={styles.primaryBtnText}>Beam to Peer</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  sheetContainer: {
    borderTopWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 14,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
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
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  title: {
    fontSize: 14.5,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 11.5,
    marginTop: 1,
  },
  addMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 8,
    gap: 4,
  },
  addMoreText: {
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
    borderWidth: 1,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemName: {
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
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
  primaryBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
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

