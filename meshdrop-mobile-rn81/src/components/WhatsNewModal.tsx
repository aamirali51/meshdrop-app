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
import { theme, fonts } from '../theme'

const CURRENT_VERSION = '1.0.38'
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

export function WhatsNewModal() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let isMounted = true
    RNFS.readFile(VERSION_FILE_PATH, 'utf8')
      .then((savedVersion) => {
        if (isMounted && savedVersion.trim() !== CURRENT_VERSION) {
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
  }, [])

  const handleDismiss = () => {
    RNFS.writeFile(VERSION_FILE_PATH, CURRENT_VERSION, 'utf8').catch(() => {})
    setVisible(false)
  }

  return (
    <SimpleModal
      visible={visible}
      title="What's New in MeshDrop"
      subtitle={`Version ${CURRENT_VERSION} Update`}
      onClose={handleDismiss}
    >
      <View style={styles.container}>
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {FEATURES.map((item, idx) => {
            const IconComp = item.icon
            return (
              <View key={idx} style={styles.itemRow}>
                <View style={styles.iconBox}>
                  <IconComp size={20} color={theme.primary} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemDesc}>{item.desc}</Text>
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
    backgroundColor: theme.bgElevated,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radiusSm,
    padding: 12,
    marginBottom: 10,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: theme.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(79, 70, 229, 0.2)',
  },
  itemTitle: {
    color: theme.text,
    fontSize: 13.5,
    fontWeight: '800',
    marginBottom: 3,
  },
  itemDesc: {
    color: theme.textSecondary,
    fontSize: 11.5,
    lineHeight: 16,
  },
  btn: {
    marginTop: 4,
  },
})
