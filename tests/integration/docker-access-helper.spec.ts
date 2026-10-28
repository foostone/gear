import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

it('binds native authorization to its caller and rejects replaced sockets before mutation', async () => {
  const { stdout } = await promisify(execFile)(process.env.GEAR_LOCK_PYTHON ?? 'python3', ['-I', '-B', '-c', `
import importlib.util,os,stat,types
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('docker_access',Path('assets/docker-access.py').resolve())
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
account=types.SimpleNamespace(pw_uid=1000,pw_name='fixture-user')
with patch.dict(os.environ,{'PKEXEC_UID':'999'}),patch.object(m.pwd,'getpwuid') as lookup:
 try:m.caller('1000')
 except ValueError:pass
 else:raise AssertionError('Unbound native caller accepted')
 lookup.assert_not_called()
for mode in (stat.S_IFLNK,stat.S_IFREG):
 with patch.dict(os.environ,{'PKEXEC_UID':'1000'}),patch.object(m.os,'geteuid',return_value=0),patch.object(m.pwd,'getpwuid',return_value=account),patch.object(m.grp,'getgrnam',return_value=types.SimpleNamespace(gr_gid=973)),patch.object(Path,'lstat',return_value=types.SimpleNamespace(st_mode=mode,st_uid=0,st_gid=973)),patch.object(m.subprocess,'run') as run:
  try:m.grant('1000')
  except ValueError:pass
  else:raise AssertionError('Replaced Docker socket accepted')
  run.assert_not_called()
with patch.dict(os.environ,{'PKEXEC_UID':'1000'}),patch.object(m.os,'geteuid',return_value=0),patch.object(m.pwd,'getpwuid',return_value=account),patch.object(m.grp,'getgrnam',return_value=types.SimpleNamespace(gr_gid=973)),patch.object(Path,'lstat',return_value=types.SimpleNamespace(st_mode=stat.S_IFSOCK,st_uid=0,st_gid=973)),patch.object(m.subprocess,'run') as run:
 result=m.grant('1000')
 assert result['status']=='granted'
 assert run.call_args_list[0].args[0]==['/usr/sbin/usermod','--append','--groups','docker','fixture-user']
 assert run.call_args_list[1].args[0]==['/usr/bin/setfacl','--modify','u:1000:rw','/run/docker.sock']
print('Caller and socket binding passed without system changes')
`], { cwd: process.cwd(), timeout: 10_000, maxBuffer: 4096 })
  expect(stdout).toContain('without system changes')
})
