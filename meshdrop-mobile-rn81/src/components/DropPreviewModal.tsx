import React, { useState, useEffect, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native'
import {
  Folder,
  FileText,
  Download,
  X,
  Check,
  Search,
  CheckSquare,
  Square,
  FileCode,
  FileArchive,
  Image as ImageIcon,
  Video,
  Music,
} from 'lucide-react-native'
import { SimpleModal, Btn } from '../components'
import { theme, fonts } from '../theme'

export interface ClaimPreviewFile {
  index: number
  filename: string
  fileSize: number
  fileType?: string
}

export interface ClaimPreview {
  code: string
  shareId: string
  folderName?: string | null
  totalSize: number
  totalFiles: number
  files: ClaimPreviewFile[]
}

interface DropPreviewModalProps {
  visible: boolean
  preview: ClaimPreview | null
  onConfirm: (indices: number[]) => void
  onCancel: () => void
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let val = bytes
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024
    i++
  }
  return `${val.toFixed(val >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) {
    return <ImageIcon size={18} color="#38BDF8" />
  }
  if (['mp4', 'mkv', 'mov', 'avi', 'webm'].includes(ext)) {
    return <Video size={18} color="#C084FC" />
  }
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) {
    return <Music size={18} color="#34D399" />
  }
  if (['zip', 'tar', 'gz', '7z', 'rar'].includes(ext)) {
    return <FileArchive size={18} color="#FBBF24" />
  }
  if (['js', 'ts', 'tsx', 'jsx', 'json', 'html', 'css', 'py', 'go', 'rs', 'c', 'cpp'].includes(ext)) {
    return <FileCode size={18} color="#818CF8" />
  }
  return <FileText size={18} color={theme.muted} />
}

export function DropPreviewModal({
  visible,
  preview,
  onConfirm,
  onCancel,
}: DropPreviewModalProps) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [filterQuery, setFilterQuery] = useState('')

  useEffect(() => {
    if (preview && preview.files) {
      setSelectedIndices(new Set(preview.files.map((f) => f.index)))
      setFilterQuery('')
    }
  }, [preview])

  const files = preview?.files || []

  const filteredFiles = useMemo(() => {
    if (!filterQuery.trim()) return files
    const q = filterQuery.toLowerCase()
    return files.filter((f) => f.filename.toLowerCase().includes(q))
  }, [files, filterQuery])

  const selectedBytes = useMemo(() => {
    return files
      .filter((f) => selectedIndices.has(f.index))
      .reduce((sum, f) => sum + (f.fileSize || 0), 0)
  }, [files, selectedIndices])

  if (!preview) return null

  const toggleSelectAll = () => {
    if (selectedIndices.size === files.length) {
      setSelectedIndices(new Set())
    } else {
      setSelectedIndices(new Set(files.map((f) => f.index)))
    }
  }

  const toggleFile = (idx: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const title = preview.folderName
    ? `Folder: ${preview.folderName}`
    : `Shared Files (${files.length})`

  return (
    <SimpleModal
      visible={visible}
      title={title}
      subtitle={`Code ${preview.code} · ${formatBytes(preview.totalSize)}`}
      onClose={onCancel}
    >
      <View style={styles.container}>
        {/* Search & Selection Header */}
        <View style={styles.headerToolbar}>
          {files.length > 4 && (
            <View style={styles.searchBox}>
              <Search size={14} color={theme.muted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search files..."
                placeholderTextColor={theme.muted}
                value={filterQuery}
                onChangeText={setFilterQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          )}

          <TouchableOpacity
            style={styles.selectAllBtn}
            onPress={toggleSelectAll}
            activeOpacity={0.7}
          >
            {selectedIndices.size === files.length ? (
              <CheckSquare size={16} color={theme.primary} />
            ) : (
              <Square size={16} color={theme.muted} />
            )}
            <Text style={styles.selectAllText}>
              {selectedIndices.size === files.length ? 'Deselect All' : 'Select All'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.selectedCountText}>
            {selectedIndices.size}/{files.length} ({formatBytes(selectedBytes)})
          </Text>
        </View>

        {/* Scrollable File List */}
        <ScrollView style={styles.fileList} showsVerticalScrollIndicator={false}>
          {filteredFiles.map((file) => {
            const isSelected = selectedIndices.has(file.index)
            return (
              <TouchableOpacity
                key={file.index}
                style={[styles.fileRow, isSelected && styles.fileRowSelected]}
                onPress={() => toggleFile(file.index)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  {isSelected && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                </View>

                <View style={styles.iconWrap}>{getFileIcon(file.filename)}</View>

                <View style={styles.flex1}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {file.filename}
                  </Text>
                  <Text style={styles.fileSize}>{formatBytes(file.fileSize)}</Text>
                </View>
              </TouchableOpacity>
            )
          })}

          {filteredFiles.length === 0 && (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No files matching "{filterQuery}"</Text>
            </View>
          )}
        </ScrollView>

        {/* Action Buttons */}
        <View style={styles.btnRow}>
          <Btn
            label="Cancel"
            icon={X}
            variant="ghost"
            onPress={onCancel}
            style={styles.flex1}
          />
          {selectedIndices.size < files.length && selectedIndices.size > 0 && (
            <Btn
              label={`Download (${selectedIndices.size})`}
              icon={Download}
              variant="primary"
              disabled={selectedIndices.size === 0}
              onPress={() => onConfirm(Array.from(selectedIndices))}
              style={styles.flex1}
            />
          )}
          <Btn
            label="Download All"
            icon={Download}
            variant={selectedIndices.size === files.length ? 'primary' : 'secondary'}
            onPress={() => onConfirm(files.map((f) => f.index))}
            style={styles.flex1}
          />
        </View>
      </View>
    </SimpleModal>
  )
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  container: {
    paddingVertical: 6,
  },
  headerToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
    flexWrap: 'wrap',
  },
  searchBox: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.bgElevated,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 34,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    height: 34,
    color: theme.text,
    fontSize: 12,
    paddingVertical: 0,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  selectAllText: {
    color: theme.text,
    fontSize: 11.5,
    fontWeight: '700',
  },
  selectedCountText: {
    color: theme.muted,
    fontSize: 11,
    fontFamily: fonts.mono,
  },
  fileList: {
    maxHeight: 280,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radiusSm,
    backgroundColor: theme.bgElevated,
    marginBottom: 14,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    gap: 10,
  },
  fileRowSelected: {
    backgroundColor: theme.primarySoft,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: theme.border,
    backgroundColor: theme.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  iconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileName: {
    color: theme.text,
    fontSize: 12.5,
    fontWeight: '700',
  },
  fileSize: {
    color: theme.muted,
    fontSize: 11,
    fontFamily: fonts.mono,
    marginTop: 2,
  },
  emptyWrap: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: theme.muted,
    fontSize: 12,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
  },
})
