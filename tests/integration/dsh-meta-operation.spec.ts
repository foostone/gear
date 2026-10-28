import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { ProcessOperationProvider } from '../../src/adapters/process/operation-provider.js'
import { DshHarnessAdapter } from '../../src/adapters/dsh/harness.js'
import { canonicalDigest } from '../../src/domain/canonical.js'
import { fileLockHeld } from '../../src/adapters/storage/file-lock.js'
import type { Json } from '../../src/domain/algorithm-wire.js'
import type { OperationRequest } from '../../src/ports/operations.js'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) {
    for (const entry of await readdir(join(root, 'private/operations'), { withFileTypes: true })) {
      if (entry.isDirectory()) await expect.poll(() => fileLockHeld(join(root, 'private/operations', entry.name, 'execution.lock')), { timeout: 10_000 }).toBe(false)
    }
    await rm(root, { recursive: true, force: true })
  }
})
async function fixture(mode = 'success', timeoutMs = 10_000) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gear-dsh-meta-test-')))
  roots.push(root)
  const runtime = join(root, 'runtime'), targets = join(root, 'private/targets'), directory = join(root, 'private/operations')
  const pkg = join(runtime, 'node_modules/@deepseek-ai/dsh')
  await mkdir(join(pkg, 'lib'), { recursive: true })
  await mkdir(directory, { recursive: true })
  await new DshHarnessAdapter().prepare(join(targets, 'anchor'))
  await writeFile(join(root, 'private/held-out'), 'PRIVATE_CANARY')
  await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: '0.2.1-rc.2', type: 'module' }))
  const executable = join(pkg, 'lib/bin.js')
  await writeFile(executable, `import fs from 'node:fs';import path from 'node:path';
if(process.argv.includes('--version')) { console.log('0.2.1-rc.2');process.exit(0) }
const patch=JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--patch')+1],'utf8'));
const route=patch.find(x=>x.id==='llm-deepseek').config;
if(route.thinking!=='enabled'||route.reasoningEffort!=='high')throw Error('reasoning contract');
let privateRead=false;try{fs.readFileSync(${JSON.stringify(join(root, 'private/held-out'))});privateRead=true}catch{}
if(privateRead)throw Error('private data visible');
const input=JSON.parse(fs.readFileSync('../input.json','utf8'));
if(${JSON.stringify(mode)}==='hang') await new Promise(resolve=>setTimeout(resolve,30000));
if(input.operation.kind==='generate_candidate') {
 fs.writeFileSync(${JSON.stringify(mode)}==='outside'?'package.json':'prompts/system.md','Improved general instructions.\\n');
} else {let wrote=false;try{fs.writeFileSync('prompts/system.md','illegal');wrote=true}catch{};if(wrote)throw Error('diagnosis was writable')}
console.log(JSON.stringify({summary:'Fixture completed',declined:false,hypotheses:['Use a focused general rule.'],clusters:[]}));`)
  await chmod(executable, 0o700)
  const profile = { command: [process.execPath, resolve('assets/dsh-meta-runner.mjs')], workingDirectory: root,
    passEnv: [], timeoutMs: 30_000, configuration: { executable, runtimeRoot: runtime, nodeExecutable: process.execPath,
      model: 'deepseek-flash', reasoningEffort: 'high', allowedDomains: ['api.deepseek.com'], timeoutMs,
      ...(process.env.GEAR_TEST_LINUX_ISOLATION ? { linuxIsolation: process.env.GEAR_TEST_LINUX_ISOLATION as 'seccomp' | 'bubblewrap-only' } : {}) } }
  const context = { runId: 'run-fixture', directory, targets, targetAdapter: 'dsh', protectedPaths: [join(root, 'private')], tasks: [{ id: 'seed', family: 'fixture', instruction: 'Return a short answer.' }] }
  const provider = await ProcessOperationProvider.connect(profile, context as unknown as Json)
  await provider.prepareAdmission()
  const request = (kind: 'diagnose_seed' | 'generate_candidate'): OperationRequest => ({ operationId: canonicalDigest({ kind, mode }), runId: context.runId,
    generation: 0, partition: 'seed', repetitions: 1, slots: [], evidence: [],
    operation: { kind, candidate_id: kind === 'generate_candidate' ? 'candidate' : 'anchor', parent_id: kind === 'generate_candidate' ? 'anchor' : null,
      task_ids: ['seed'], scope: 'local', payload: null, rationale: 'Fixture operation' } })
  return { root, provider, request, targets, directory }
}

it('runs DSH diagnosis read-only and reuses a durable generated candidate receipt', async () => {
  const { provider, request, targets, directory } = await fixture()
  const diagnosis = await provider.submit(request('diagnose_seed'), new AbortController().signal)
  expect(diagnosis.result.status, JSON.stringify(diagnosis) + '\n' + await readFile(join(directory, request('diagnose_seed').operationId.slice(7), 'stderr.log'), 'utf8').catch(() => '')).toBe('complete')
  const input = request('generate_candidate')
  const first = await provider.submit(input, new AbortController().signal)
  expect(first.result.status).toBe('complete')
  expect((first.provenance as { provider: string }).provider).toBe('dsh')
  expect(first.usage?.tokens).toBeNull()
  expect(await provider.submit(input, new AbortController().signal)).toEqual(first)
  expect(await readFile(join(targets, 'candidate/prompts/system.md'), 'utf8')).toContain('Improved general')
  expect((await provider.inspect(input, new AbortController().signal)).state).toBe('complete')
}, 60_000)

it('rejects changes outside the harness mutation policy', async () => {
  const { provider, request } = await fixture('outside')
  const receipt = await provider.submit(request('generate_candidate'), new AbortController().signal)
  expect(receipt.result.status).toBe('failed')
  expect(receipt.candidate).toBeNull()
}, 30_000)

it('fences cancellation before submission without starting DSH', async () => {
  const { provider, request } = await fixture('hang')
  const input = request('generate_candidate')
  await provider.cancel(input)
  const receipt = await provider.submit(input, new AbortController().signal)
  expect(receipt.result.status).toBe('failed')
  expect(receipt.candidate).toBeNull()
}, 30_000)

it('recovers the original receipt after the submitting client disconnects', async () => {
  const { provider, request, directory } = await fixture()
  const input = request('generate_candidate'), controller = new AbortController()
  const pending = provider.submit(input, controller.signal).catch(() => null)
  await expect.poll(async () => readFile(join(directory, input.operationId.slice(7), 'started.json'), 'utf8').then(() => true).catch(() => false), { timeout: 20_000 }).toBe(true)
  controller.abort()
  await pending
  await expect.poll(async () => (await provider.inspect(input, new AbortController().signal)).state, { timeout: 20_000 }).toBe('complete')
  const inspected = await provider.inspect(input, new AbortController().signal)
  expect(inspected.state).toBe('complete')
  if (inspected.state === 'complete') expect(await provider.submit(input, new AbortController().signal)).toEqual(inspected.receipt)
}, 60_000)
