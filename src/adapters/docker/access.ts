import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { GearError } from '../../domain/errors.js'

const execute = promisify(execFile)
export async function dockerAccess() {
  try {
    await execute('docker', ['version', '--format', '{{.Server.Version}}'], {
      timeout: 10_000,
      maxBuffer: 4096,
    })
    return { status: 'available', authentication: 'not_required' }
  } catch {
    // Only the explicit setup option may invoke the native authentication agent.
  }
  if (process.platform !== 'linux' || !process.getuid || process.getuid() === 0)
    throw new GearError(
      'docker-access-manual',
      'Start Docker Desktop or configure Docker access for your normal user',
    )
  if (
    process.env.DOCKER_HOST &&
    !['unix:///var/run/docker.sock', 'unix:///run/docker.sock'].includes(process.env.DOCKER_HOST)
  )
    throw new GearError(
      'docker-access-remote',
      'One-time system authorization supports the local system Docker socket only',
    )
  let endpoint: string
  try {
    const { stdout } = await execute(
      'docker',
      ['context', 'inspect', '--format', '{{(index .Endpoints "docker").Host}}'],
      { timeout: 10_000, maxBuffer: 4096 },
    )
    endpoint = stdout.trim()
  } catch {
    throw new GearError(
      'docker-access-manual',
      'Select the local system Docker context before requesting system authorization',
    )
  }
  if (!['unix:///var/run/docker.sock', 'unix:///run/docker.sock'].includes(endpoint))
    throw new GearError(
      'docker-access-remote',
      'The selected Docker context does not use the local system socket',
    )
  try {
    const { stdout } = await execute(
      '/usr/bin/pkexec',
      [
        '/usr/bin/python3',
        '-I',
        '-B',
        fileURLToPath(new URL('../../../assets/docker-access.py', import.meta.url)),
        String(process.getuid()),
      ],
      { timeout: 180_000, maxBuffer: 4096 },
    )
    const result = JSON.parse(stdout) as { status?: string }
    if (result.status !== 'granted') throw new Error('Unconfirmed authorization')
    await execute('docker', ['version', '--format', '{{.Server.Version}}'], {
      timeout: 10_000,
      maxBuffer: 4096,
    })
    return { ...result, authentication: 'native_system' }
  } catch {
    throw new GearError(
      'docker-access-unconfirmed',
      'Docker authorization was cancelled, unavailable, or could not be verified',
      {
        next_action:
          'Run gear setup --docker-access from your desktop session; authentication occurs in the system dialog',
      },
    )
  }
}
