# DeepSeek Flash 1017 evaluation

This is a new experiment using the current Python GEPA implementation, not an
exact reproduction of the historical TypeScript search. Use the official
`deepseek-flash` alias for both Target and Meta, with thinking enabled and high
reasoning effort. [DeepSeek documents the alias as V4.1-Flash-1017](https://api-docs.deepseek.com/quick_start/agent_integrations/);
this is attribution by a mutable provider mapping, not an immutable checkpoint pin.

All credentials are supplied through `DEEPSEEK_API_KEY`. Do not place credentials
in a profile, command argument, experiment archive, or Git repository.

## Runtime and one-time Docker access

Use Node 22.19+ or 24+, Python 3.12, Harbor 0.21.0, and an isolated, regular npm
installation of `@deepseek-ai/dsh@0.2.1-rc.2`. Retain its package lock and record the
actual Gear/Hitch commits, DSH dependency bytes, dataset and OCI image digests.
The Meta runner rejects a different DSH version or linked dependency tree.

```sh
npm install --prefix /absolute/path/to/dsh-runtime --save-exact @deepseek-ai/dsh@0.2.1-rc.2
gear setup --docker-access --json
```

The explicit Docker option checks ordinary user access first. On Linux, when
needed, it opens the native PolicyKit authentication dialog once. The helper
binds its caller to `PKEXEC_UID`, verifies the root-owned system Docker socket,
adds that user to the `docker` group, and grants the current socket an individual
ACL. Docker group access is effectively root-equivalent; opt in only on a host
where that access is intended. Gear and Hitch continue to run without root.
No password is read, stored, or cached by Gear. Cancellation leaves authorization
unconfirmed and does not cause a password prompt on stdin or a sudo fallback.
Group membership persists for future login sessions. If Docker recreates its
socket before the current session has acquired that group, sign out and in.
Remote endpoints, rootless Docker and Docker Desktop use their own access setup.

## Profiles

Import an external process Meta profile with `gear profile create flash-1017-meta
--from /absolute/path/to/meta.json`. Its shape is:

```json
{
  "command": ["/absolute/path/to/node", "/absolute/path/to/gear/assets/dsh-meta-runner.mjs"],
  "workingDirectory": "/absolute/path/to/experiment",
  "passEnv": ["DEEPSEEK_API_KEY"],
  "timeoutMs": 1830000,
  "configuration": {
    "executable": "/absolute/path/to/dsh-runtime/node_modules/@deepseek-ai/dsh/lib/bin.js",
    "runtimeRoot": "/absolute/path/to/dsh-runtime",
    "nodeExecutable": "/absolute/path/to/node",
    "model": "deepseek-flash",
    "allowedDomains": ["api.deepseek.com"],
    "reasoningEffort": "high",
    "timeoutMs": 1800000
  }
}
```

The operation runner implements admission, durable submit/inspect/cancel and
uses the same managed worker, process guard, seed experience and OS sandbox as
the Codex Meta runner. Diagnosis has a read-only candidate; generation is checked
against the existing mutation policy and harness validator before publication.
It needs no Codex credentials. Linux also needs `bubblewrap` and `socat`; the bridge executable is resolved independently of the model process PATH. Native session diagnostics are retained privately.
Aggregate billed Meta usage remains unknown (`null`): writable session files are
not a trusted billing meter. No aggregate token/request limit is advertised. On Ubuntu hosts that reject nested seccomp namespaces, explicitly set `linuxIsolation: "bubblewrap-only"` in the Meta profile and `sandbox: {linux_isolation: bubblewrap-only}` in `gear.yaml`; record that filesystem/PID/network namespace mode in the evidence. There is no automatic isolation fallback.

Create a Hitch Target profile pinned to `deepseek@version:0.2.1-rc.2`, selecting
`deepseek-official/deepseek-flash`, with `passEnv: [DEEPSEEK_API_KEY]`, concurrency
4 and an immutable base image digest. Import its JSON with `agentArgs` set to
`["--patch", "/absolute/path/to/target.patch.json"]`. This overlay is applied
alongside Gear's Target resource patch. Preserve the benchmark's task deadlines
and scorer settings. Do not use the historical Codex wrapper example.

## Probe, admit and run

```sh
python3 probe.py --out /absolute/path/to/fresh-probe-output
gear doctor --json
gear benchmark check --json
gear refine --json
```

First require a successful file/tool Hitch run with readable native trajectory,
a valid one-task Harbor score, and a complete Gear small-loop result before the
full Marketing run. Probe responses store only usage, identity, completion state
and digests, not reasoning text. Interrupted or failed probes are not scores.

For Marketing, import the public 100-task dataset at upstream commit
`4a8e1061254004d9dac807054eed33fad7d1ff14` using the existing AutomationBench
producer. Keep all 100 tasks in the seed research set. The supplied `gear.yaml`
sets three rounds, at most 12 generated candidates, 4→2→1 stage widths, one
repetition and a total 1,000 physical-attempt ceiling. Baseline, candidates,
parent-scope completion and repair all share this ceiling. There is no total
token cap; task and operation timeouts still apply. Unused candidate quota may
carry forward, so four candidates per round is not a hard limit.

Archive per-task baseline and champion observations, strict pass rate, auxiliary
metrics, elapsed time, known/unknown usage and physical attempts. Keep valid zeros
and infrastructure failures distinct; never shrink the task denominator. This
same-set research has no independent held-out generalization claim. Support and
Terminal-Bench results require separately frozen datasets, scorers and harness
conditions; missing materials must remain explicitly unavailable.

The predeclared task names are in `marketing-selection.json`. Inspect the producer
invocation without Docker or model calls:

```sh
node prepare-marketing.mjs --hitch-source /path/to/agent-hitch \
  --source /path/to/pinned/AutomationBench --out /path/to/new-marketing-dataset --plan
```

Remove `--plan` to build and export the dataset once Docker access is available.
Then use `gear benchmark import /path/to/new-marketing-dataset --template harbor
--research`, review the returned plan, and apply it with `gear benchmark import
--apply PLAN_ID`. Configure the supplied profiles and `gear.yaml` in that project.
No script changes Docker permissions automatically.
