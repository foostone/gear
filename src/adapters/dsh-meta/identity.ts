import { readFile, readdir, realpath, lstat } from 'node:fs/promises'
import { join, relative, isAbsolute } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { canonicalDigest } from '../../domain/canonical.js'
import { GearError } from '../../domain/errors.js'
import { fileDigest } from '../codex/identity.js'
import type { describeCodex } from '../codex/identity.js'
import { configuration } from './contracts.js'
import { builtinPolicyImplementationDigest } from '../python/builtin-policy.js'

/** Bind the installed dependency bytes, not a mutable npm version label alone. */
export async function describeDsh(raw: Parameters<typeof describeCodex>[0]) {
  const config = configuration(raw)
  const runtimeRoot = await realpath(config.runtimeRoot)
  const executable = await realpath(config.executable)
  const child = relative(runtimeRoot, executable)
  if (!child || isAbsolute(child) || child.startsWith('../'))
    throw new GearError('dsh-runtime-invalid', 'DSH entrypoint must belong to its runtime root')
  const manifest = JSON.parse(
    await readFile(join(runtimeRoot, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8'),
  ) as { name: string; version: string }
  if (manifest.name !== '@deepseek-ai/dsh' || manifest.version !== '0.2.1-rc.2')
    throw new GearError('dsh-runtime-invalid', 'This experiment requires DSH 0.2.1-rc.2')
  const node = await realpath(config.nodeExecutable)
  const { stdout } = await promisify(execFile)(node, [executable, '--version'], {
    timeout: 10_000,
    maxBuffer: 1024,
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
  })
  const version = stdout.trim()
  if (!version.includes('0.2.1-rc.2'))
    throw new GearError('dsh-runtime-invalid', 'DSH executable does not match its package version')
  const paths: string[] = []
  let bytes = 0
  const walk = async (path: string): Promise<void> => {
    const info = await lstat(join(runtimeRoot, path))
    if (info.isDirectory()) {
      for (const name of (await readdir(join(runtimeRoot, path))).sort()) {
        if (name !== '.bin') await walk(join(path, name))
      }
    } else if (info.isFile() && info.nlink === 1) {
      bytes += info.size
      if (paths.length >= 100_000 || bytes > 2 * 1024 ** 3)
        throw new GearError('dsh-runtime-too-large', 'DSH runtime exceeds observation limits')
      paths.push(path)
    } else
      throw new GearError(
        'dsh-runtime-link',
        'DSH runtime must use a regular npm installation without dependency links',
      )
  }
  await walk('node_modules')
  const files: Array<[string, string]> = new Array(paths.length)
  let cursor = 0
  // Bound open descriptors while avoiding one stream-open round trip per file.
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (;;) {
        const index = cursor++
        if (index >= paths.length) return
        const path = paths[index]!
        files[index] = [path, await fileDigest(join(runtimeRoot, path))]
      }
    }),
  )
  const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js'
  const implementation = await Promise.all(
    [
      'contracts',
      'identity',
      'runner',
      'launch',
      '../process/meta-runner',
      '../process/executable',
      '../codex/contracts',
      '../codex/execution',
      '../codex/sandbox',
      '../codex/journal',
      '../codex/cleanup',
      '../codex/experience',
      '../codex/trajectory-gateway',
      '../codex/identity',
      '../codex/usage',
      '../codex/auth',
      '../codex/executable',
      '../codex/runner',
      '../artifacts/reader',
      '../artifacts/access',
      '../storage/trajectory',
      '../skill/server',
      '../hitch/trajectory',
      '../hitch/native-source',
      '../hitch/transport',
      '../hitch/settings',
      '../python/packaged-policy',
      '../python/builtin-policy',
      '../storage/experience',
      '../storage/experience-files',
      '../storage/experience-format',
      '../python/runtime',
      '../python/interpreter',
      '../storage/atomic',
      '../storage/file-lock',
      '../storage/targets',
      '../dsh/harness',
      '../pi/harness',
      '../../sandbox',
      '../../domain/canonical',
      '../../domain/mutation-policy',
      '../../domain/algorithm-schema',
    ].map((name) => readFile(new URL(`${name}${extension}`, import.meta.url), 'utf8')),
  )
  implementation.push(
    await readFile(new URL('../../../assets/dsh-meta-runner.mjs', import.meta.url), 'utf8'),
    await readFile(new URL('../../../assets/codex-process-guard.py', import.meta.url), 'utf8'),
  )
  return {
    executable,
    version,
    identity: canonicalDigest({
      implementation,
      experienceImplementation: builtinPolicyImplementationDigest,
      files,
      binary: await fileDigest(node),
      version,
      node: process.version,
    }),
  }
}
