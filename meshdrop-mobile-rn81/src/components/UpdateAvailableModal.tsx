// Global "Update available" modal for the store-free APK updater. Subscribes to
// src/updater state and renders via the shared SimpleModal: prompts on launch
// when a newer build is hosted, shows download progress, then hands the APK to
// the Android system installer.

import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, Alert } from 'react-native'
import { SimpleModal, Btn } from '../components'
import { theme } from '../theme'
import {
  subscribeUpdate,
  isUpdaterSupported,
  downloadUpdate,
  installApk,
  canInstallPackages,
  openInstallSettings,
  dismissUpdate,
  type UpdateState,
} from '../updater'

export function UpdateAvailableModal() {
  const [state, setState] = useState<UpdateState | null>(null)

  useEffect(() => {
    if (!isUpdaterSupported()) return
    return subscribeUpdate(setState)
  }, [])

  if (!isUpdaterSupported() || !state || state.phase === 'idle') return null

  const info = state.info
  const isDownloading = state.phase === 'downloading'

  const startUpdate = async () => {
    if (!info) return
    try {
      const canInstall = await canInstallPackages()
      if (!canInstall) {
        await openInstallSettings()
        Alert.alert(
          'Allow installs from MeshDrop',
          'In the app settings that just opened, turn on "Allow from this source", then return here and tap Update again.'
        )
        return
      }
      const path = await downloadUpdate(info)
      await installApk(path)
      dismissUpdate()
    } catch (err: any) {
      const msg = String(err?.message || err)
      if (/install from this app|unknown sources/i.test(msg)) {
        await openInstallSettings()
        Alert.alert(
          'Allow installs from MeshDrop',
          'In the app settings that just opened, turn on "Allow from this source", then return here and tap Update again.'
        )
      } else {
        Alert.alert('Update failed', msg)
      }
    }
  }

  const title =
    state.phase === 'downloading'
      ? 'Downloading update…'
      : state.phase === 'error'
      ? 'Update failed'
      : state.phase === 'ready'
      ? 'Update ready'
      : 'Update available'

  const subtitle =
    state.phase === 'downloading'
      ? `${state.versionName || ''} → ${info?.versionName || ''}`
      : info
      ? `A newer build (v${info.versionName}) is ready to install.`
      : undefined

  return (
    <SimpleModal
      visible
      title={title}
      subtitle={subtitle}
      onClose={isDownloading ? () => {} : dismissUpdate}
    >
      {isDownloading ? (
        <View>
          <Text style={styles.progressLabel}>{state.progress}%</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.max(4, state.progress)}%` }]} />
          </View>
          <Text style={styles.hint}>
            The new APK is being downloaded. You will be asked to confirm the
            install by Android when it finishes.
          </Text>
        </View>
      ) : info && state.phase !== 'error' ? (
        <View>
          {!!info.notes && <Text style={styles.notes}>{info.notes}</Text>}
          <Text style={styles.hint}>
            Installing will open the Android installer. Since this app isn't
            published to an app store, you'll see a confirmation from Android
            before the update applies.
          </Text>
          <View style={styles.actions}>
            <Btn label="Update now" variant="primary" onPress={startUpdate} style={styles.flex} />
            <Btn label="Later" variant="ghost" onPress={dismissUpdate} style={styles.flex} />
          </View>
        </View>
      ) : (
        <View>
          <Text style={styles.errorText}>
            {state.error || 'Something went wrong checking for the update.'}
          </Text>
          <View style={styles.actions}>
            <Btn label="Try again" variant="primary" onPress={startUpdate} style={styles.flex} />
            <Btn label="Close" variant="ghost" onPress={dismissUpdate} style={styles.flex} />
          </View>
        </View>
      )}
    </SimpleModal>
  )
}

const styles = StyleSheet.create({
  progressLabel: {
    color: theme.primary,
    fontSize: 24,
    fontWeight: '900',
    fontFamily: 'monospace',
    textAlign: 'center',
    marginBottom: 10,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.bgElevated,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.border,
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.primary,
    borderRadius: 4,
  },
  notes: {
    color: theme.text,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  hint: {
    color: theme.muted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 18,
  },
  errorText: {
    color: theme.danger,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  flex: {
    flex: 1,
  },
})
