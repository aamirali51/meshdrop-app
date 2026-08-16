import React, { useRef, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
  type StyleProp,
  Modal,
  ScrollView,
  Animated,
  Easing,
} from 'react-native'
import {
  KeyRound,
  Copy,
  Check,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Lock,
  ArrowRight,
  Send,
  Trash2,
  X,
  Plus,
  Monitor,
  Smartphone,
  Folder,
  Zap,
  Activity,
  Download,
  Upload,
  Radio,
  Cpu,
  Sparkles,
} from 'lucide-react-native'
import { theme, fonts } from './theme'

export function PulseIndicator({ color = theme.success, size = 8 }: { color?: string; size?: number }) {
  const scale = useRef(new Animated.Value(1)).current
  const opacity = useRef(new Animated.Value(0.8)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 2,
            duration: 1400,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 1400,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.8,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [scale, opacity])

  return (
    <View style={[styles.pulseContainer, { width: size * 2.2, height: size * 2.2 }]}>
      <Animated.View
        style={[
          styles.pulseRing,
          {
            width: size * 2,
            height: size * 2,
            borderRadius: size,
            backgroundColor: color,
            transform: [{ scale }],
            opacity,
          },
        ]}
      />
      <View
        style={[
          styles.pulseDot,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  )
}

export function Card({
  children,
  style,
  glow = false,
  variant = 'default',
}: {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  glow?: boolean
  variant?: 'default' | 'elevated' | 'glass' | 'accent'
}) {
  const getVariantStyle = () => {
    switch (variant) {
      case 'elevated':
        return styles.cardElevated
      case 'glass':
        return styles.cardGlass
      case 'accent':
        return styles.cardAccent
      default:
        return styles.cardDefault
    }
  }

  return (
    <View
      style={[
        styles.card,
        getVariantStyle(),
        glow && styles.cardGlow,
        style,
      ]}
    >
      {children}
    </View>
  )
}

export function StatCard({
  label,
  value,
  icon: IconComponent,
  color = theme.primary,
  subtext,
}: {
  label: string
  value: string | number
  icon?: React.ElementType
  color?: string
  subtext?: string
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statTop}>
        {IconComponent && (
          <View style={[styles.statIconBox, { backgroundColor: color + '14', borderColor: color + '25' }]}>
            <IconComponent size={15} color={color} />
          </View>
        )}
        <Text style={[styles.statValue, { color }]}>{value}</Text>
      </View>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      {subtext && (
        <Text style={styles.statSubtext} numberOfLines={1}>
          {subtext}
        </Text>
      )}
    </View>
  )
}

export function Btn({
  label,
  icon: IconComponent,
  onPress,
  variant = 'primary',
  disabled,
  style,
  textStyle,
  size = 'md',
  loading = false,
}: {
  label: string
  icon?: React.ElementType
  onPress: () => void
  variant?: 'primary' | 'cyan' | 'purple' | 'secondary' | 'outline' | 'danger' | 'ghost'
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  textStyle?: TextStyle
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}) {
  const getColors = () => {
    switch (variant) {
      case 'primary':
        return { bg: theme.primary, fg: '#FFFFFF', border: 'transparent', shadow: theme.primaryGlow }
      case 'cyan':
        return { bg: theme.accent, fg: '#FFFFFF', border: 'transparent', shadow: theme.accentGlow }
      case 'purple':
        return { bg: theme.purple, fg: '#FFFFFF', border: 'transparent', shadow: theme.purpleGlow }
      case 'secondary':
        return { bg: '#FFFFFF', fg: theme.text, border: theme.border, shadow: 'transparent' }
      case 'danger':
        return { bg: theme.dangerBg, fg: theme.danger, border: theme.dangerBorder, shadow: theme.dangerGlow }
      case 'outline':
        return { bg: 'transparent', fg: theme.primary, border: theme.primary, shadow: 'transparent' }
      case 'ghost':
        return { bg: 'transparent', fg: theme.muted, border: 'transparent', shadow: 'transparent' }
    }
  }

  const c = getColors()
  const pad = size === 'sm' ? styles.padSm : size === 'lg' ? styles.padLg : styles.padMd
  const fontSize = size === 'sm' ? 12 : size === 'lg' ? 15 : 13.5
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.btn,
        pad,
        { backgroundColor: c.bg, borderColor: c.border },
        c.border !== 'transparent' && styles.btnBordered,
        disabled && styles.btnDisabled,
        variant === 'primary' && styles.btnPrimaryShadow,
        variant === 'cyan' && styles.btnCyanShadow,
        style,
      ]}
    >
      <View style={styles.btnContent}>
        {IconComponent && <IconComponent size={iconSize} color={c.fg} style={styles.btnIcon} />}
        <Text style={[styles.btnText, { color: c.fg, fontSize }, textStyle]}>
          {loading ? 'Processing…' : label}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

export function Pill({
  label,
  color = theme.accent,
  icon: IconComponent,
  dot = false,
}: {
  label: string
  color?: string
  icon?: React.ElementType
  dot?: boolean
}) {
  return (
    <View style={[styles.pill, { borderColor: color + '30', backgroundColor: color + '12' }]}>
      {dot && <View style={[styles.pillDot, { backgroundColor: color }]} />}
      {IconComponent && <IconComponent size={12} color={color} style={{ marginRight: 4 }} />}
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  )
}

export function DeviceAvatar({
  name,
  isOnline = true,
  size = 44,
  isTrusted = false,
}: {
  name: string
  isOnline?: boolean
  size?: number
  isTrusted?: boolean
}) {
  const getInitials = (n: string) => {
    const parts = (n || 'Peer').split(/[\s-_]+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return (n || 'P').slice(0, 2).toUpperCase()
  }

  return (
    <View
      style={[
        styles.avatarWrap,
        {
          width: size,
          height: size,
          borderRadius: size * 0.38,
          borderColor: isTrusted ? theme.primary + '50' : isOnline ? theme.accent + '40' : theme.border,
          backgroundColor: isOnline ? theme.primarySoft : theme.bgElevated,
        },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.36, color: isOnline ? theme.primary : theme.muted }]}>
        {getInitials(name)}
      </Text>
      <View
        style={[
          styles.avatarDot,
          {
            backgroundColor: isOnline ? theme.success : theme.subtle,
            borderColor: '#FFFFFF',
          },
        ]}
      />
    </View>
  )
}

export function PairingCodeCard({
  code,
  onCopy,
  onShowQR,
  onRefresh,
  copied = false,
  loading = false,
}: {
  code: string
  onCopy: () => void
  onShowQR?: () => void
  onRefresh?: () => void
  copied?: boolean
  loading?: boolean
}) {
  const formatCode = (c: string) => {
    if (!c || c === '…') return 'MD - •••• - •••• - •••• - ••••'
    const parts = c.split('-').map((s) => s.trim()).filter(Boolean)
    if (parts.length >= 2) return parts.join(' · ')
    return c
  }

  return (
    <Card glow style={styles.codeHeroCard}>
      <View style={styles.codeHeroHeader}>
        <View style={styles.keyIconCircle}>
          <KeyRound size={18} color={theme.primary} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.codeHeroTitle}>Node Pairing Code</Text>
          <Text style={styles.codeHeroSub}>
            Share with another device to establish trusted P2P sync
          </Text>
        </View>
        {onRefresh && (
          <TouchableOpacity onPress={onRefresh} style={styles.refreshIconBtn} activeOpacity={0.7}>
            <RefreshCw size={14} color={theme.muted} />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity activeOpacity={0.85} onPress={onCopy} style={styles.codeBox}>
        <Text style={styles.codeMonospace} numberOfLines={1} adjustsFontSizeToFit>
          {formatCode(code)}
        </Text>
        <View style={styles.codeCopyHintRow}>
          <Copy size={11} color={theme.primary} />
          <Text style={styles.codeCopyHint}>{copied ? 'Copied to Clipboard!' : 'Tap to Copy Code'}</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.codeActionsRow}>
        <Btn
          label={copied ? 'Code Copied' : 'Copy Code'}
          icon={copied ? Check : Copy}
          variant="secondary"
          onPress={onCopy}
          style={styles.flex1}
          size="sm"
        />
        {onShowQR && (
          <Btn
            label="Show QR Matrix"
            icon={QrCode}
            variant="primary"
            onPress={onShowQR}
            style={styles.flex1}
            size="sm"
          />
        )}
      </View>
    </Card>
  )
}

export function DeviceCard({
  device,
  onPress,
  onSendFile,
  onToggleTrust,
  onForget,
}: {
  device: {
    id: string
    name: string
    os?: string
    isOnline?: boolean
    isTrusted?: boolean
    ipAddress?: string
    lastSeen?: string
  }
  onPress?: () => void
  onSendFile?: () => void
  onToggleTrust?: () => void
  onForget?: () => void
}) {
  const isDesktop = (device.os || '').toLowerCase().match(/win|mac|linux|darwin/)
  const OsIcon = isDesktop ? Monitor : Smartphone

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.deviceCard,
        device.isOnline && styles.deviceCardOnline,
      ]}
    >
      <View style={styles.deviceCardHeader}>
        <DeviceAvatar
          name={device.name}
          isOnline={device.isOnline}
          isTrusted={device.isTrusted}
          size={42}
        />

        <View style={styles.deviceInfoCol}>
          <View style={styles.deviceNameRow}>
            <Text style={styles.deviceName} numberOfLines={1}>
              {device.name}
            </Text>
            {device.isTrusted && (
              <View style={styles.trustBadge}>
                <ShieldCheck size={12} color={theme.primary} />
              </View>
            )}
          </View>

          <View style={styles.deviceMetaRow}>
            <OsIcon size={12} color={theme.muted} />
            <Text style={styles.deviceMetaText}>
              {device.os || 'Mesh Node'} · {device.isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>

        {onSendFile && device.isOnline && (
          <TouchableOpacity
            style={styles.quickSendBtn}
            onPress={onSendFile}
            activeOpacity={0.7}
          >
            <Send size={14} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  )
}

export function SimpleModal({
  visible,
  title,
  subtitle,
  children,
  onClose,
}: {
  visible: boolean
  title: string
  subtitle?: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <TouchableOpacity
          style={styles.modalBackdropTouch}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.modalContent}>
          <View style={styles.modalDragHandle} />

          <View style={styles.modalHeader}>
            <View style={styles.flex1}>
              <Text style={styles.modalTitle}>{title}</Text>
              {subtitle && <Text style={styles.modalSubtitle}>{subtitle}</Text>}
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.modalCloseBtn}
              activeOpacity={0.7}
            >
              <X size={18} color={theme.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.modalScrollContent}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
  badge,
}: {
  title: string
  actionLabel?: string
  onAction?: () => void
  badge?: string | number
}) {
  return (
    <View style={styles.sectionHeaderRow}>
      <View style={styles.sectionTitleWrap}>
        <View style={styles.sectionAccentBar} />
        <Text style={styles.sectionTitle}>{title}</Text>
        {badge !== undefined && (
          <View style={styles.sectionBadge}>
            <Text style={styles.sectionBadgeText}>{badge}</Text>
          </View>
        )}
      </View>
      {actionLabel && onAction && (
        <TouchableOpacity onPress={onAction} activeOpacity={0.7}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

export function Section({
  title,
  children,
  actionLabel,
  onAction,
  badge,
  style,
}: {
  title: string
  children: React.ReactNode
  actionLabel?: string
  onAction?: () => void
  badge?: string | number
  style?: ViewStyle
}) {
  return (
    <View style={[styles.sectionContainer, style]}>
      <SectionHeader
        title={title}
        actionLabel={actionLabel}
        onAction={onAction}
        badge={badge}
      />
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  pulseContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
  },
  pulseDot: {
    shadowColor: theme.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  card: {
    borderRadius: theme.radius,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardDefault: {
    backgroundColor: '#FFFFFF',
    borderColor: theme.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardElevated: {
    backgroundColor: '#FFFFFF',
    borderColor: theme.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  cardGlass: {
    backgroundColor: theme.bgGlassHeavy,
    borderColor: theme.border,
  },
  cardAccent: {
    backgroundColor: theme.primarySoft,
    borderColor: 'rgba(79, 70, 229, 0.2)',
  },
  cardGlow: {
    borderColor: 'rgba(79, 70, 229, 0.25)',
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radiusSm,
    padding: 12,
    minWidth: 100,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  statTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  statIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: fonts.mono,
  },
  statLabel: {
    color: theme.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  statSubtext: {
    color: theme.muted,
    fontSize: 10,
    marginTop: 2,
  },
  btn: {
    borderRadius: theme.radiusSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryShadow: {
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  btnCyanShadow: {
    shadowColor: theme.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  padSm: {
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  padMd: {
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  padLg: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  btnBordered: {
    borderWidth: 1,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnIcon: {
    marginRight: 2,
  },
  btnText: {
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: theme.radiusFull,
    borderWidth: 1,
    alignSelf: 'flex-start',
    gap: 5,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  avatarWrap: {
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarText: {
    fontWeight: '900',
    fontFamily: fonts.mono,
  },
  avatarDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
  },
  codeHeroCard: {
    padding: 16,
    marginBottom: 16,
  },
  codeHeroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  keyIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: theme.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(79, 70, 229, 0.2)',
  },
  codeHeroTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  codeHeroSub: {
    color: theme.textSecondary,
    fontSize: 11,
    marginTop: 1,
  },
  refreshIconBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: theme.bgElevated,
  },
  codeBox: {
    backgroundColor: theme.bgElevated,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radiusSm,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  codeMonospace: {
    color: theme.primary,
    fontSize: 17,
    fontWeight: '900',
    fontFamily: fonts.mono,
    letterSpacing: 1.2,
  },
  codeCopyHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  codeCopyHint: {
    color: theme.primary,
    fontSize: 10,
    fontWeight: '700',
  },
  codeActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  deviceCard: {
    backgroundColor: '#FFFFFF',
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radius,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  deviceCardOnline: {
    borderColor: 'rgba(79, 70, 229, 0.25)',
  },
  deviceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deviceInfoCol: {
    flex: 1,
  },
  deviceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deviceName: {
    color: theme.text,
    fontSize: 14,
    fontWeight: '800',
  },
  trustBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: theme.primarySoft,
  },
  deviceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  deviceMetaText: {
    color: theme.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  quickSendBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalBackdropTouch: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: theme.radiusXl,
    borderTopRightRadius: theme.radiusXl,
    borderTopWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 12,
    maxHeight: '92%',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 12,
  },
  modalScrollContent: {
    paddingBottom: 48,
  },
  modalDragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(15, 23, 42, 0.15)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    color: theme.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: theme.bgElevated,
  },
  sectionContainer: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionAccentBar: {
    width: 3,
    height: 14,
    borderRadius: 2,
    backgroundColor: theme.primary,
  },
  sectionTitle: {
    color: theme.text,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sectionBadge: {
    backgroundColor: theme.primarySoft,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 9999,
  },
  sectionBadgeText: {
    color: theme.primary,
    fontSize: 10,
    fontWeight: '800',
    fontFamily: fonts.mono,
  },
  sectionAction: {
    color: theme.primary,
    fontSize: 12,
    fontWeight: '700',
  },
})
