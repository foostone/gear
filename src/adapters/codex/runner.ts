import { fileURLToPath } from 'node:url'
import { metaMain, metaOperation, runMetaWorker, type MetaDriver } from '../process/meta-runner.js'
import { codexPassEnvNames, validateInput } from './contracts.js'
import { describeCodex } from './identity.js'
import { executeJob } from './execution.js'
import type { CodexWorkerLifecycle } from './cleanup.js'

const driver: MetaDriver = {
  workerEntry: fileURLToPath(new URL('../../../assets/codex-meta-runner.mjs', import.meta.url)),
  passEnvNames: codexPassEnvNames,
  validateInput,
  describe: describeCodex,
  execute: executeJob,
}
export const codexOperation = (raw: unknown) => metaOperation(raw, driver)
export const runCodexWorker = (directory: string, worker?: CodexWorkerLifecycle) =>
  runMetaWorker(directory, driver, worker)
export const main = (argv = process.argv.slice(2)) => metaMain(driver, argv)
