declare module 'nodejs-mobile-react-native' {
  interface Channel {
    send(msg: string): void
    addListener(event: 'message', cb: (msg: string) => void): { remove(): void }
  }
  const nodejs: {
    start(script: string): void
    channel: Channel
  }
  export default nodejs
}
