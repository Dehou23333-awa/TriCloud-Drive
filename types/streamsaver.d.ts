declare module 'streamsaver' {
  export interface StreamSaver {
    createWriteStream: (
      name: string,
      options?: { size?: number; writableStrategy?: any; readableStrategy?: any }
    ) => WritableStream
    mitm?: string
  }
  const streamSaver: StreamSaver
  export default streamSaver
}