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
import { useTheme, fonts, type ThemeTokens } from './theme'

export function PulseIndicator({ color, size = 8 }: { color?: string; size?: number }) {
  const { theme } = useTheme()
  const resolvedColor = color || theme.success
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
            backgroundColor: resolvedColor,
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
            backgroundColor: resolvedColor,
            shadowColor: resolvedColor,
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
  const { theme } = useTheme()

  const getVariantStyle = () => {
    switch (variant) {
      case 'elevated':
        return { backgroundColor: theme.bgElevated, borderColor: theme.border }
      case 'glass':
        return { backgroundColor: theme.bgGlassHeavy, borderColor: theme.border }
      case 'accent':
        return { backgroundColor: theme.primarySoft, borderColor: 'rgba(79, 70, 229, 0.25)' }
      default:
        return { backgroundColor: theme.bgCard, borderColor: theme.cardBorder }
    }
  }

  return (
    <View
      style={[
        styles.card,
        {
          borderRadius: theme.radius,
          shadowColor: theme.shadowSm.shadowColor,
          shadowOpacity: theme.shadowSm.shadowOpacity,
          shadowRadius: theme.shadowSm.shadowRadius,
          elevation: theme.shadowSm.elevation,
        },
        getVariantStyle(),
        glow && {
          borderColor: theme.primaryGlow ? theme.primary : 'rgba(99, 102, 241, 0.35)',
          shadowColor: theme.primary,
          shadowOpacity: theme.isDark ? 0.25 : 0.1,
          shadowRadius: 12,
        },
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
  color,
  subtext,
}: {
  label: string
  value: string | number
  icon?: React.ElementType
  color?: string
  subtext?: string
}) {
  const { theme } = useTheme()
  const resolvedColor = color || theme.primary

  return (
    <View
      style={[
        styles.statCard,
        {
          backgroundColor: theme.bgCard,
          borderColor: theme.border,
          borderRadius: theme.radiusSm,
          shadowColor: theme.shadowSm.shadowColor,
          shadowOpacity: theme.shadowSm.shadowOpacity,
        },
      ]}
    >
      <View style={styles.statTop}>
        {IconComponent && (
          <View style={[styles.statIconBox, { backgroundColor: resolvedColor + '18', borderColor: resolvedColor + '30' }]}>
            <IconComponent size={15} color={resolvedColor} />
          </View>
        )}
        <Text style={[styles.statValue, { color: resolvedColor }]}>{value}</Text>
      </View>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
      {subtext && (
        <Text style={[styles.statSubtext, { color: theme.muted }]} numberOfLines={1}>
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
  const { theme } = useTheme()

  const getColors = () => {
    switch (variant) {
      case 'primary':
        return { bg: theme.primary, fg: '#FFFFFF', border: 'transparent', shadow: theme.primaryGlow }
      case 'cyan':
        return { bg: theme.accent, fg: '#FFFFFF', border: 'transparent', shadow: theme.accentGlow }
      case 'purple':
        return { bg: theme.purple, fg: '#FFFFFF', border: 'transparent', shadow: theme.purpleGlow }
      case 'secondary':
        return { bg: theme.bgElevated, fg: theme.text, border: theme.border, shadow: 'transparent' }
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
        {
          backgroundColor: c.bg,
          borderColor: c.border,
          borderRadius: theme.radiusSm,
        },
        c.border !== 'transparent' && styles.btnBordered,
        disabled && styles.btnDisabled,
        variant === 'primary' && { shadowColor: theme.primary, shadowOpacity: theme.isDark ? 0.35 : 0.2 },
        variant === 'cyan' && { shadowColor: theme.accent, shadowOpacity: theme.isDark ? 0.35 : 0.2 },
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
  color,
  icon: IconComponent,
  dot = false,
}: {
  label: string
  color?: string
  icon?: React.ElementType
  dot?: boolean
}) {
  const { theme } = useTheme()
  const resolvedColor = color || theme.accent

  return (
    <View
      style={[
        styles.pill,
        {
          borderColor: resolvedColor + '35',
          backgroundColor: resolvedColor + (theme.isDark ? '22' : '12'),
          borderRadius: theme.radiusFull,
        },
      ]}
    >
      {dot && <View style={[styles.pillDot, { backgroundColor: resolvedColor }]} />}
      {IconComponent && <IconComponent size={12} color={resolvedColor} style={{ marginRight: 4 }} />}
      <Text style={[styles.pillText, { color: resolvedColor }]}>{label}</Text>
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
  const { theme } = useTheme()

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
          borderColor: isTrusted ? theme.primary + '60' : isOnline ? theme.accent + '50' : theme.border,
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
            borderColor: theme.bgCard,
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
  const { theme } = useTheme()

  const formatCode = (c: string) => {
    if (!c || c === '…') return 'MD - •••• - •••• - •••• - ••••'
    const parts = c.split('-').map((s) => s.trim()).filter(Boolean)
    if (parts.length >= 2) return parts.join(' · ')
    return c
  }

  return (
    <Card glow style={styles.codeHeroCard}>
      <View style={styles.codeHeroHeader}>
        <View style={[styles.keyIconCircle, { backgroundColor: theme.primarySoft, borderColor: theme.primary + '35' }]}>
          <KeyRound size={18} color={theme.primary} />
        </View>
        <View style={styles.flex1}>
          <Text style={[styles.codeHeroTitle, { color: theme.text }]}>Pairing Code</Text>
          <Text style={[styles.codeHeroSub, { color: theme.textSecondary }]}>
            Share a code with anyone. Pair the devices you own.
          </Text>
        </View>
        {onRefresh && (
          <TouchableOpacity onPress={onRefresh} style={[styles.refreshIconBtn, { backgroundColor: theme.bgElevated }]} activeOpacity={0.7}>
            <RefreshCw size={14} color={theme.muted} />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onCopy}
        style={[styles.codeBox, { backgroundColor: theme.bgElevated, borderColor: theme.border, borderRadius: theme.radiusSm }]}
      >
        <Text style={[styles.codeMonospace, { color: theme.primary }]} numberOfLines={1} adjustsFontSizeToFit>
          {formatCode(code)}
        </Text>
        <View style={styles.codeCopyHintRow}>
          <Copy size={11} color={theme.primary} />
          <Text style={[styles.codeCopyHint, { color: theme.primary }]}>{copied ? 'Copied to Clipboard!' : 'Tap to Copy Code'}</Text>
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
  const { theme } = useTheme()
  const isDesktop = (device.os || '').toLowerCase().match(/win|mac|linux|darwin/)
  const OsIcon = isDesktop ? Monitor : Smartphone

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.deviceCard,
        {
          backgroundColor: theme.bgCard,
          borderColor: theme.border,
          borderRadius: theme.radius,
        },
        device.isOnline && { borderColor: theme.primary + '50' },
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
            <Text style={[styles.deviceName, { color: theme.text }]} numberOfLines={1}>
              {device.name}
            </Text>
            {device.isTrusted && (
              <View style={[styles.trustBadge, { backgroundColor: theme.primarySoft }]}>
                <ShieldCheck size={12} color={theme.primary} />
              </View>
            )}
          </View>

          <View style={styles.deviceMetaRow}>
            <OsIcon size={12} color={theme.muted} />
            <Text style={[styles.deviceMetaText, { color: theme.muted }]}>
              {device.os || 'Mesh Node'} · {device.isOnline ? 'Online' : 'Offline'}
              {(device as any).relayedViaOwnPeer ? ' · via your Desktop' : ''}
            </Text>
            {device.isOnline && (
              <View style={[
                styles.transportBadge,
                (device as any).transferMethod === 'lan'
                  ? styles.transportBadgeLan
                  : (device as any).transferMethod === 'relay' || (device as any).relayed
                    ? styles.transportBadgeRelay
                    : styles.transportBadgeDirect
              ]}>
                <Text style={[
                  styles.transportBadgeText,
                  (device as any).transferMethod === 'lan'
                    ? styles.transportTextLan
                    : (device as any).transferMethod === 'relay' || (device as any).relayed
                      ? styles.transportTextRelay
                      : styles.transportTextDirect
                ]}>
                  {(device as any).transferMethod === 'lan'
                    ? '⚡ LAN'
                    : (device as any).transferMethod === 'relay' || (device as any).relayed
                      ? '🌐 Relay'
                      : '🔗 Direct'}
                </Text>
              </View>
            )}
          </View>
        </View>

        {onSendFile && device.isOnline && (
          <TouchableOpacity
            style={[styles.quickSendBtn, { backgroundColor: theme.primary, shadowColor: theme.primary }]}
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
  const { theme } = useTheme()

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.modalBackdrop, { backgroundColor: theme.modalBackdrop }]}>
        <TouchableOpacity
          style={styles.modalBackdropTouch}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            styles.modalContent,
            {
              backgroundColor: theme.bgCard,
              borderColor: theme.border,
              borderTopLeftRadius: theme.radiusXl,
              borderTopRightRadius: theme.radiusXl,
            },
          ]}
        >
          <View style={[styles.modalDragHandle, { backgroundColor: theme.hairline }]} />

          <View style={styles.modalHeader}>
            <View style={styles.flex1}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>{title}</Text>
              {subtitle && <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>{subtitle}</Text>}
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.modalCloseBtn, { backgroundColor: theme.bgElevated }]}
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
  const { theme } = useTheme()

  return (
    <View style={styles.sectionHeaderRow}>
      <View style={styles.sectionTitleWrap}>
        <View style={[styles.sectionAccentBar, { backgroundColor: theme.primary }]} />
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
        {badge !== undefined && (
          <View style={[styles.sectionBadge, { backgroundColor: theme.primarySoft }]}>
            <Text style={[styles.sectionBadgeText, { color: theme.primary }]}>{badge}</Text>
          </View>
        )}
      </View>
      {actionLabel && onAction && (
        <TouchableOpacity onPress={onAction} activeOpacity={0.7}>
          <Text style={[styles.sectionAction, { color: theme.primary }]}>{actionLabel}</Text>
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
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  card: {
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    padding: 12,
    minWidth: 100,
    shadowOffset: { width: 0, height: 1 },
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
    fontSize: 11,
    fontWeight: '700',
  },
  statSubtext: {
    fontSize: 10,
    marginTop: 2,
  },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
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
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  codeHeroTitle: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  codeHeroSub: {
    fontSize: 11,
    marginTop: 1,
  },
  refreshIconBtn: {
    padding: 6,
    borderRadius: 8,
  },
  codeBox: {
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  codeMonospace: {
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
    fontSize: 10,
    fontWeight: '700',
  },
  codeActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  deviceCard: {
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
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
    fontSize: 14,
    fontWeight: '800',
  },
  trustBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  deviceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  deviceMetaText: {
    fontSize: 11,
    fontWeight: '600',
  },
  quickSendBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdropTouch: {
    flex: 1,
  },
  modalContent: {
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 12,
    maxHeight: '92%',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
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
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 10,
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
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sectionBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 9999,
  },
  sectionBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: fonts.mono,
  },
  sectionAction: {
    fontSize: 12,
    fontWeight: '700',
  },
  transportBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 6,
  },
  transportBadgeLan: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  transportBadgeDirect: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  transportBadgeRelay: {
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.3)',
  },
  transportBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    fontFamily: fonts.mono,
  },
  transportTextLan: {
    color: '#10B981',
  },
  transportTextDirect: {
    color: '#3B82F6',
  },
  transportTextRelay: {
    color: '#A855F7',
  },
})

