import * as shared from '@shared/protocol'

const s = ((shared as any)?.default || shared) as typeof shared

export const METHODS = {
  ...(s.METHODS || {}),
  WATCH_STATE_BROADCAST: s.METHODS?.WATCH_STATE_BROADCAST || 'watch.stateBroadcast',
  STREAM_URL_GET: s.METHODS?.STREAM_URL_GET || 'stream.getUrl'
} as typeof s.METHODS

export const EVENTS = {
  ...(s.EVENTS || {}),
  WATCH_STATE_CHANGED: s.EVENTS?.WATCH_STATE_CHANGED || 'watch.stateChanged'
} as typeof s.EVENTS

export const PROTOCOL_VERSION = s.PROTOCOL_VERSION || '1.0'
export const isProtocolCompatible = s.isProtocolCompatible || (() => true)

export type MethodName = (typeof METHODS)[keyof typeof METHODS] | string
export type EventName = (typeof EVENTS)[keyof typeof EVENTS] | string

export interface RequestMessage {
  type: 'request'
  v?: string
  id: string
  method: MethodName
  params: unknown
}

export interface ResponseMessage {
  type: 'response'
  v?: string
  id: string
  result?: unknown
  error?: string
}

export interface EventMessage {
  type: 'event'
  v?: string
  event: EventName
  data: unknown
}

export type WireMessage = RequestMessage | ResponseMessage | EventMessage
