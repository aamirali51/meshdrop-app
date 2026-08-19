import * as shared from '@shared/protocol'

export const METHODS = shared.METHODS
export const EVENTS = shared.EVENTS

export const PROTOCOL_VERSION = shared.PROTOCOL_VERSION || '1.0'
export const isProtocolCompatible = shared.isProtocolCompatible || (() => true)

export type MethodName = (typeof METHODS)[keyof typeof METHODS]
export type EventName = (typeof EVENTS)[keyof typeof EVENTS]

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
