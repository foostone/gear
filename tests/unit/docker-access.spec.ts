import { afterEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ calls: [] as string[], failures: [] as boolean[], outputs: [] as string[] }))
vi.mock('node:child_process', () => {
  const invoke = (file: string, args: string[]) => {
    state.calls.push([file, ...args].join(' '))
    const failed = state.failures.shift()
    const stdout = state.outputs.shift() ?? ''
    if (failed) return Promise.reject(new Error('fixture failure'))
    return Promise.resolve({ stdout, stderr: '' })
  }
  return { execFile: Object.assign(() => {}, { [Symbol.for('nodejs.util.promisify.custom')]: invoke }) }
})
import { dockerAccess } from '../../src/adapters/docker/access.js'
afterEach(() => { state.calls.length = 0; state.failures.length = 0; state.outputs.length = 0; vi.unstubAllEnvs() })
it('does not authenticate when ordinary Docker access already works', async () => {
  expect(await dockerAccess()).toEqual({ status: 'available', authentication: 'not_required' })
  expect(state.calls).toHaveLength(1)
})
it.skipIf(process.platform !== 'linux')('verifies ordinary user access after one native authentication call', async () => {
  vi.stubEnv('DOCKER_HOST', '')
  state.failures.push(true, false, false, false)
  state.outputs.push('', 'unix:///run/docker.sock', JSON.stringify({ status: 'granted', persistent_group: 'docker' }), '29.9.2')
  expect((await dockerAccess()).status).toBe('granted')
  expect(state.calls.filter(call => call.startsWith('/usr/bin/pkexec '))).toHaveLength(1)
  expect(state.calls.at(-1)).toContain('docker version')
})
it.skipIf(process.platform !== 'linux')('reports cancelled authentication without a password or sudo retry', async () => {
  vi.stubEnv('DOCKER_HOST', '')
  state.failures.push(true, false, true)
  state.outputs.push('', 'unix:///run/docker.sock')
  await expect(dockerAccess()).rejects.toMatchObject({ code: 'docker-access-unconfirmed' })
  expect(state.calls).toHaveLength(3)
})
it.skipIf(process.platform !== 'linux')('does not change local system privileges for a remote Docker endpoint', async () => {
  vi.stubEnv('DOCKER_HOST', 'ssh://remote.example')
  state.failures.push(true)
  await expect(dockerAccess()).rejects.toMatchObject({ code: 'docker-access-remote' })
  expect(state.calls).toHaveLength(1)
})

it.skipIf(process.platform !== 'linux')('does not authenticate for a remote context when DOCKER_HOST is unset', async () => {
  vi.stubEnv('DOCKER_HOST', '')
  state.failures.push(true, false)
  state.outputs.push('', 'ssh://remote.example')
  await expect(dockerAccess()).rejects.toMatchObject({ code: 'docker-access-remote' })
  expect(state.calls.some(call => call.includes('pkexec'))).toBe(false)
})

it.skipIf(process.platform === 'linux')('leaves platform-specific Docker authorization to the normal desktop setup', async () => {
  state.failures.push(true)
  await expect(dockerAccess()).rejects.toMatchObject({ code: 'docker-access-manual' })
  expect(state.calls).toHaveLength(1)
})
