import { fileURLToPath } from 'node:url'
import { metaMain, metaOperation, type MetaDriver } from '../process/meta-runner.js'
import { executeJob, type MetaExecutionDriver } from '../codex/execution.js'
import { validateInput } from './contracts.js'
import { describeDsh } from './identity.js'
import { collectDsh, prepareDshSandbox } from './launch.js'

const execution: MetaExecutionDriver = {
  provider: 'dsh',
  describe: describeDsh,
  prepare: prepareDshSandbox,
  collect: collectDsh,
  // A completed CLI or writable session log is not proof of aggregate billed usage.
  // Keep unknown totals explicit until a trusted transport meter is available.
  usage: () => ({
    record() {},
    result: () => ({
      input_tokens: null,
      output_tokens: null,
      cached_input_tokens: null,
      tokens: null,
      model_requests: null,
      dollars: null,
    }),
  }),
}
const driver: MetaDriver = {
  workerEntry: fileURLToPath(new URL('../../../assets/dsh-meta-runner.mjs', import.meta.url)),
  passEnvNames: ['DEEPSEEK_API_KEY'],
  validateInput,
  describe: describeDsh,
  execute: (job, directory, worker) => executeJob(job, directory, worker, execution),
}
export const dshOperation = (raw: unknown) => metaOperation(raw, driver)
export const main = (argv = process.argv.slice(2)) => metaMain(driver, argv)
