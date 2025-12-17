/// <reference lib="webworker" />
import { runComputePipeline } from '../utils/computeEngine'
import type { ComputeJobPayload, ComputeWorkerResponse } from '../db/types'

const ctx: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope

ctx.onmessage = (event: MessageEvent<ComputeJobPayload>) => {
  runComputePipeline(event.data, {
    onProgress: (phase) => ctx.postMessage({ type: 'progress', phase } satisfies ComputeWorkerResponse),
  })
    .then((result) => ctx.postMessage({ type: 'completed', ...result } satisfies ComputeWorkerResponse))
    .catch((error) =>
      ctx.postMessage({ type: 'error', message: (error as Error).message } satisfies ComputeWorkerResponse),
    )
}
