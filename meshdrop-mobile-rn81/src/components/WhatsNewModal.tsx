import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native'
import {
  Folder,
  Zap,
  ShieldCheck,
  Check,
  Sparkles,
} from 'lucide-react-native'
import RNFS from 'react-native-fs'
import { SimpleModal, Btn } from '../components'
import { useTheme, fonts } from '../theme'

// Version shown as the "What's New" target. When the app is running, the
// installed version (from version.properties via the native module) is passed
// in as `installedVersion` and used as the gate; this constant is only the
// fallback when the native version read fails.
const CURRENT_VERSION = '1.0.46'
const VERSION_FILE_PATH = `${RNFS.DocumentDirectoryPath}/.meshdrop_version`

const FEATURES = [
  {
    icon: Folder,
    title: 'Folder Browsing & Selective Download',
    desc: 'When claiming a shared folder, peruse all files inside and selectively download only the files you want or grab the whole folder.',
  },
  {
    icon: Zap,
    title: 'Fast Direct Streaming',
    desc: 'Upgraded peer-to-peer chunking and adaptive socket buffers for rapid transfers over Wi-Fi and DHT.',
  },
  {
    icon: ShieldCheck,
    title: 'Noise E2E Encryption',
    desc: 'Direct cryptographically secured transfers with zero cloud logging and zero tracking.',
  },
]

export function WhatsNewModal({ installedVersion }: { installedVersion?: string | null }) {
  const { theme } = useTheme()
  const [visible, setVisible] = useState(false)
  // Use the real installed version when available, so the gate never goes
  // stale against version.properties bumps.
  const version = (installedVersion && installedVersion.trim()) || CURRENT_VERSION

  useEffect(() => {
    let isMounted = true
    RNFS.readFile(VERSION_FILE_PATH, 'utf8')
      .then((savedVersion) => {
        if (isMounted && savedVersion.trim() !== version) {
          setVisible(true)
        }
      })
      .catch(() => {
        // First run or file doesn't exist
        if (isMounted) {
          setVisible(true)
        }
      })
    return () => {
      isMounted = false
    }
  }, [version])

  const handleDismiss = () => {
    RNFS.writeFile(VERSION_FILE_PATH, version, 'utf8').catch(() => {})
    setVisible(false)
  }

  return (
    <SimpleModal
      visible={visible}
      title="What's New in MeshDrop"
      subtitle={`Version ${version} Update`}
      onClose={handleDismiss}
    >
      <View style={styles.container}>
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {FEATURES.map((item, idx) => {
            const IconComp = item.icon
            return (
              <View key={idx} style={[styles.itemRow, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
                <View style={[styles.iconBox, { backgroundColor: theme.primarySoft, borderColor: theme.primary + '35' }]}>
                  <IconComp size={20} color={theme.primary} />
                </View>
                <View style={styles.flex1}>
                  <Text style={[styles.itemTitle, { color: theme.text }]}>{item.title}</Text>
                  <Text style={[styles.itemDesc, { color: theme.textSecondary }]}>{item.desc}</Text>
                </View>
              </View>
            )
          })}
        </ScrollView>

        <Btn
          label="Got it, let's go!"
          icon={Check}
          variant="primary"
          onPress={handleDismiss}
          size="lg"
          style={styles.btn}
        />
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
  list: {
    maxHeight: 340,
    marginBottom: 16,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  itemTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    marginBottom: 3,
  },
  itemDesc: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  btn: {
    marginTop: 4,
  },
})

