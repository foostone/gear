// Synthetic integration evidence only; this does not run or score a benchmark.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { ProcessOperationProvider } from '../lib/adapters/process/operation-provider.js'
import { DshHarnessAdapter } from '../lib/adapters/dsh/harness.js'
import { canonicalDigest } from '../lib/domain/canonical.js'

const root = resolve(process.env.GEAR_TEST_LIVE_OUTPUT ?? '')
const runtimeRoot = process.env.GEAR_TEST_DSH_RUNTIME_ROOT
assert(process.env.GEAR_TEST_LIVE_OUTPUT && runtimeRoot && process.env.DEEPSEEK_API_KEY,
  'Set GEAR_TEST_LIVE_OUTPUT, GEAR_TEST_DSH_RUNTIME_ROOT and DEEPSEEK_API_KEY')
await mkdir(root, { mode: 0o700 })
const targets = join(root, 'private/targets'), directory = join(root, 'private/operations')
await mkdir(directory, { recursive: true, mode: 0o700 })
await writeFile(join(root, 'private/held-out.txt'), 'PRIVATE_HELD_OUT_SENTINEL', { mode: 0o600 })
await new DshHarnessAdapter().prepare(join(targets, 'anchor'))
const configuration = {
  executable: join(runtimeRoot, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), runtimeRoot,
  nodeExecutable: process.execPath, model: 'deepseek-flash', reasoningEffort: 'high',
  allowedDomains: ['api.deepseek.com'], timeoutMs: 300000,
  ...(process.env.GEAR_TEST_LINUX_ISOLATION ? { linuxIsolation: process.env.GEAR_TEST_LINUX_ISOLATION } : {}),
}
const profile = { command: [process.execPath, resolve('assets/dsh-meta-runner.mjs')], workingDirectory: root,
  passEnv: ['DEEPSEEK_API_KEY'], timeoutMs: 330000, configuration }
const context = { runId: 'dsh-live-synthetic', directory, targets, targetAdapter: 'dsh', protectedPaths: [join(root, 'private')],
  tasks: [{ id: 'seed', family: 'format', instruction: 'Return only the requested final format, without explanatory prose.' }] }
const provider = await ProcessOperationProvider.connect(profile, context)
await provider.prepareAdmission()
const request = {
  operationId: canonicalDigest({ canary: 'dsh-meta-generation-v1' }), runId: context.runId,
  generation: 0, partition: 'seed', repetitions: 1, slots: [], evidence: [],
  operation: { kind: 'generate_candidate', candidate_id: 'candidate', parent_id: 'anchor', task_ids: ['seed'],
    scope: 'local', rationale: 'Synthetic output-contract mutation, not measured failure diagnosis',
    payload: { hypothesis: 'Add a concise general instruction to prompts/system.md to preserve exact user-requested final output formats and omit extra commentary.' } },
}
const started = Date.now()
const receipt = await provider.submit(request, new AbortController().signal)
await writeFile(join(root, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 })
assert.equal(receipt.result.status, 'complete', 'DSH generation failed; inspect private native diagnostics')
assert.equal(receipt.candidate?.id, 'candidate')
assert.notEqual(await readFile(join(targets, 'anchor/prompts/system.md'), 'utf8'), await readFile(join(targets, 'candidate/prompts/system.md'), 'utf8'))
const inspection = await provider.inspect(request, new AbortController().signal)
assert.equal(inspection.state, 'complete')
assert.deepEqual(await provider.submit(request, new AbortController().signal), receipt)
const summary = { kind: 'dsh-meta-synthetic-canary', benchmark_tasks: 0, passed: true,
  model: 'deepseek-flash', thinking: 'enabled', reasoning_effort: 'high',
  elapsed_seconds: (Date.now() - started) / 1000, provider_identity: provider.identity,
  implementation: receipt.provenance.implementation, duplicate_submission_reused: true,
  inspection_recovered: true, physical_attempts: receipt.physicalAttempts, usage: receipt.usage,
  isolation: configuration.linuxIsolation ?? 'seccomp' }
await writeFile(join(root, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify(summary))
