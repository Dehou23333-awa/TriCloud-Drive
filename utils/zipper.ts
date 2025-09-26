import { formatFileSize } from './format'

export async function createZipSink(zipName: string) {
  if (typeof window === 'undefined') throw new Error('仅支持浏览器下载')

  const canFSA = 'showSaveFilePicker' in window
  let outStream: WritableStream

  if (canFSA) {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: zipName,
      types: [{ description: 'ZIP', accept: { 'application/zip': ['.zip'] } }]
    })
    outStream = await handle.createWritable()
  } else {
    const mod = await import('streamsaver')
    const streamSaver = (mod as any).default || mod
    streamSaver.mitm = 'https://jimmywarting.github.io/StreamSaver.js/mitm.html'
    outStream = streamSaver.createWriteStream(zipName) as unknown as WritableStream
  }

  const zip = await import('@zip.js/zip.js')
  const { ZipWriter, configure } = zip as any
  if (typeof configure === 'function') configure({ useWebWorkers: false })
  const writer = new ZipWriter(outStream, { zip64: true })

  const addFromUrl = async (entryPath: string, downloadUrl: string) => {
  if (typeof entryPath !== 'string') throw new Error('entryPath 必须是字符串')
  await writer.add(
      entryPath,
      new zip.HttpReader(downloadUrl, { preventHeadRequest: true }) // 有些后端不支持 HEAD
    )
  }

  return {
    addFromUrl,
    close: () => writer.close()
  }
}