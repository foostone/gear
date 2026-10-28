// Compile the predeclared public Marketing task selection with Hitch's producer.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
const args = process.argv.slice(2)
const take = name => { const i = args.indexOf(name); return i < 0 ? undefined : args.splice(i, 2)[1] }
const hitch = take('--hitch-source'), source = take('--source'), output = take('--out')
const planIndex = args.indexOf('--plan'), planOnly = planIndex >= 0
if (planOnly) args.splice(planIndex, 1)
assert(hitch && source && output && !args.length,
  'Usage: prepare-marketing.mjs --hitch-source PATH --source GIT --out NEW_DIRECTORY [--plan]')
const selection = JSON.parse(await readFile(new URL('./marketing-selection.json', import.meta.url), 'utf8'))
assert(selection.source_commit === '4a8e1061254004d9dac807054eed33fad7d1ff14')
assert(selection.task_names.length === 100 && new Set(selection.task_names).size === 100)
assert(selection.task_names.every(name => /^marketing\.[a-z0-9_]+$/u.test(name)))
const argv = [join(resolve(hitch), 'benchmark-packages/automationbench/import.mjs'), '--source', source,
  '--ref', selection.source_commit, ...selection.task_names.flatMap(name => ['--task', name]), '--out', resolve(output)]
if (planOnly) console.log(JSON.stringify({ executable: process.execPath, args: argv, tasks: 100 }, null, 2))
else {
  const child = spawnSync(process.execPath, argv, { stdio: 'inherit' })
  if (child.error) throw child.error
  process.exitCode = child.status ?? 1
}
