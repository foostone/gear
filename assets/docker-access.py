"""Grant the authenticated local caller Docker access; never accept a password."""
import grp
import json
import os
import pwd
from pathlib import Path
import stat
import subprocess
import sys


def caller(uid_text):
    if not uid_text.isdecimal() or int(uid_text) <= 0:
        raise ValueError('Expected an unprivileged caller UID')
    if os.environ.get('PKEXEC_UID') != uid_text:
        raise ValueError('Caller does not match the native authentication session')
    account = pwd.getpwuid(int(uid_text))
    if not account.pw_name or account.pw_name.startswith('-'):
        raise ValueError('Invalid local account')
    return account


def grant(uid_text):
    if os.geteuid() != 0:
        raise PermissionError('Native system authentication is required')
    account = caller(uid_text)
    group = grp.getgrnam('docker')
    socket = Path('/run/docker.sock')
    info = socket.lstat()
    if not stat.S_ISSOCK(info.st_mode) or info.st_uid != 0 or info.st_gid != group.gr_gid:
        raise ValueError('Expected the root-owned system Docker socket and docker group')
    # Permanent membership applies to future login sessions. The ACL also enables
    # the current desktop process without restarting it or running Gear as root.
    subprocess.run(['/usr/sbin/usermod', '--append', '--groups', 'docker', account.pw_name], check=True, timeout=30)
    subprocess.run(['/usr/bin/setfacl', '--modify', 'u:' + str(account.pw_uid) + ':rw', str(socket)], check=True, timeout=10)
    return {'status': 'granted', 'persistent_group': 'docker', 'current_session_acl': True,
            'next_login': 'Group membership applies after signing in again; a replaced socket may require a new session.'}


if __name__ == '__main__':
    try:
        if len(sys.argv) != 2:
            raise ValueError('Expected one caller UID')
        print(json.dumps(grant(sys.argv[1])))
    except Exception as error:
        # Do not forward authentication-agent diagnostics or account details.
        print(json.dumps({'status': 'failed', 'error_type': type(error).__name__}))
        sys.exit(1)
