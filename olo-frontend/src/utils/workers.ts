import type {
  ComputeJobPayload,
  ComputeWorkerResponse,
  ImportJobPayload,
  ImportWorkerResponse,
} from '../db/types'

export function runImportJob(
  payload: ImportJobPayload,
  onProgress?: (update: Extract<ImportWorkerResponse, { type: 'progress' }>) => void,
) {
  return new Promise<Extract<ImportWorkerResponse, { type: 'completed' }>>((resolve, reject) => {
    const worker = new Worker(new URL('../workers/import.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event: MessageEvent<ImportWorkerResponse>) => {
      if (event.data.type === 'progress') {
        onProgress?.(event.data)
      } else if (event.data.type === 'completed') {
        resolve(event.data)
        worker.terminate()
      } else if (event.data.type === 'error') {
        reject(new Error(event.data.message))
        worker.terminate()
      }
    }
    worker.onerror = (err) => {
      worker.terminate()
      reject(err)
    }
    worker.postMessage(payload)
  })
}

export function runComputeJob(
  payload: ComputeJobPayload,
  onProgress?: (update: Extract<ComputeWorkerResponse, { type: 'progress' }>) => void,
) {
  return new Promise<Extract<ComputeWorkerResponse, { type: 'completed' }>>((resolve, reject) => {
    const worker = new Worker(new URL('../workers/compute.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event: MessageEvent<ComputeWorkerResponse>) => {
      if (event.data.type === 'progress') {
        onProgress?.(event.data)
      } else if (event.data.type === 'completed') {
        resolve(event.data)
        worker.terminate()
      } else if (event.data.type === 'error') {
        reject(new Error(event.data.message))
        worker.terminate()
      }
    }
    worker.onerror = (err) => {
      worker.terminate()
      reject(err)
    }
    worker.postMessage(payload)
  })
}
