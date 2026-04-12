import * as signalR from '@microsoft/signalr'
import { getApiBaseUrl } from '../config/apiBase'

const apiBase = getApiBaseUrl()

export function createSignalRConnection() {
  return new signalR.HubConnectionBuilder()
    .withUrl(`${apiBase}/hubs/chat`, {
      accessTokenFactory: () => localStorage.getItem('token'),
    })
    .withAutomaticReconnect()
    .configureLogging(signalR.LogLevel.Warning)
    .build()
}

export function onSafe(connection, eventName, validate, handler) {
  connection.on(eventName, (payload) => {
    try {
      if (typeof validate === 'function') {
        const ok = validate(payload)
        if (!ok) {
          console.warn(`[signalr] invalid payload for ${eventName}`, payload)
          return
        }
      }
      handler(payload)
    } catch (err) {
      console.error(`[signalr] handler error for ${eventName}`, err, payload)
    }
  })
}

export default function useSignalR() {
  const connection = createSignalRConnection()

  async function start(onReconnected) {
    if (!connection) return
    if (typeof onReconnected === 'function') {
      connection.onreconnected(async () => {
        try { await onReconnected() } catch (e) { console.warn('[signalr] onReconnected handler failed', e) }
      })
    }
    try {
      await connection.start()
    } catch (err) {
      console.warn('[signalr] connection start failed', err)
      throw err
    }
  }

  async function stop() {
    if (!connection) return
    await connection.stop().catch(() => {})
  }

  return { connection, onSafe, start, stop }
}
