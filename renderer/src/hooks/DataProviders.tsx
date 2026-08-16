import type { ReactNode } from 'react'
import { DevicesProvider } from '@/hooks/useDevices'
import { ActivityProvider } from '@/hooks/useActivity'
import { NotificationsProvider } from '@/hooks/useNotifications'
import { TransfersProvider } from '@/hooks/useTransfers'
import { SharesProvider } from '@/hooks/useShares'
import { AppProvider } from '@/hooks/useAppState'

// Composition root for the domain state providers. Each provider owns one
// slice (devices, activity, notifications, transfers, shares, app shell) and
// subscribes to the events it cares about; none of them depend on each other,
// so nesting order is arbitrary (all require Toast + Navigation above them).
export function DataProviders({ children }: { children: ReactNode }) {
  return (
    <DevicesProvider>
      <ActivityProvider>
        <NotificationsProvider>
          <TransfersProvider>
            <SharesProvider>
              <AppProvider>{children}</AppProvider>
            </SharesProvider>
          </TransfersProvider>
        </NotificationsProvider>
      </ActivityProvider>
    </DevicesProvider>
  )
}
