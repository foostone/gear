#!/usr/bin/env node
import { main } from '../lib/adapters/dsh-meta/runner.js'
main().catch(error => {
  process.stderr.write(`gear-meta-dsh: ${typeof error?.code === 'string' ? error.code : 'operation-failed'}\n`)
  process.exitCode = 1
})
