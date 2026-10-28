import { isAbsolute } from 'node:path'
import { GearError } from '../../domain/errors.js'
import { validateInput as validateMetaInput, type CodexConfiguration } from '../codex/contracts.js'

export interface DshConfiguration extends CodexConfiguration {
  runtimeRoot: string
  nodeExecutable: string
  reasoningEffort: 'high'
}
export function configuration(input: unknown): DshConfiguration {
  const value = input as DshConfiguration
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          'executable',
          'runtimeRoot',
          'nodeExecutable',
          'model',
          'allowedDomains',
          'timeoutMs',
          'reasoningEffort',
          'linuxIsolation',
        ].includes(key),
    ) ||
    ![value.executable, value.runtimeRoot, value.nodeExecutable].every(
      (path) => typeof path === 'string' && isAbsolute(path),
    ) ||
    value.model !== 'deepseek-flash' ||
    value.reasoningEffort !== 'high' ||
    !Array.isArray(value.allowedDomains) ||
    value.allowedDomains.length !== 1 ||
    value.allowedDomains[0] !== 'api.deepseek.com' ||
    !Number.isSafeInteger(value.timeoutMs) ||
    value.timeoutMs < 100 ||
    value.timeoutMs > 86_400_000 ||
    (value.linuxIsolation !== undefined && !['seccomp', 'bubblewrap-only'].includes(value.linuxIsolation))
  )
    throw new GearError(
      'invalid-dsh-meta-profile',
      'DSH Meta requires pinned runtime paths, official deepseek-flash, high reasoning and an operation timeout',
    )
  return value
}
export const validateInput = (raw: unknown) => validateMetaInput(raw, configuration)
