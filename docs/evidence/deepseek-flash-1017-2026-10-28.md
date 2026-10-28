# DeepSeek Flash 1017 Meta integration — 2026-10-28

The real DSH Meta synthetic generation passed using `deepseek-flash`, thinking
enabled and high effort. It edited the allowed candidate resources, passed the
existing harness/mutation checks, published a durable receipt, recovered that
receipt through inspection and reused it on duplicate submission. No benchmark
was scored. The [sanitized summary](deepseek-flash-1017-2026-10-28.json) records
implementation/provider identities, operation duration and explicit unknown usage.
The native session is v4 and records `deepseek-official/deepseek-flash` with high
effort; private native logs contain fourteen assistant usage observations.

The synthetic fixture tests cover read-only diagnosis, rejected protected edits,
pre-start cancellation, client disconnect and receipt reuse. The runner reuses
Gear's existing managed worker, journal, process guard, experience staging and
OS sandbox; it does not route Meta through a Codex credential or model.

This Ubuntu host rejects the nested seccomp namespace. Testing explicitly used
`bubblewrap-only`, retaining filesystem/PID/network namespace isolation with the
known reduced Unix-socket filtering. Production defaults were not changed.
A live transport failure exposed that a user-local `socat` installation was not
visible through the minimal model-process PATH. The bridge helper is now resolved
and granted read access by its absolute executable path. An earlier unsubmitted
identity probe and the terminal transport failure remain separate from success.

Five official API probes and a real Hitch file-tool run passed; the companion
[Hitch PR #59](https://github.com/rsi-gear/agent-hitch/pull/59) records that evidence.
1017 attribution follows the [official mutable alias mapping](https://api-docs.deepseek.com/quick_start/agent_integrations/),
not an immutable API snapshot identifier. Aggregate billed Meta usage stays null;
writable native session logs are not a trusted billing meter.

Docker access is unavailable and the operator chose not to change system
permissions. The explicit native authorization feature was tested with mocks;
it was not run on this system. Harbor scoring, a Gear scored small loop and the
full Marketing baseline/evolution are therefore **not run**. The 100 public
Marketing task names are frozen at source commit
`4a8e1061254004d9dac807054eed33fad7d1ff14`, with a no-execution producer plan and
three-round/12-candidate/1,000-attempt configuration ready for later use.
No Support or Terminal-Bench score is claimed.
