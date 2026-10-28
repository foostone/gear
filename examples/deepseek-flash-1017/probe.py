"""Probe the official Flash alias without publishing prompts or reasoning text."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import struct
import time
import urllib.request
import zlib
from datetime import datetime, timezone

BASE_URL = 'https://api.deepseek.com'
MODEL = 'deepseek-flash'


def red_image():
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data))
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', 64, 64, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress((b'\x00' + b'\xff\x00\x00' * 64) * 64)) + chunk(b'IEND', b'')
    return 'data:image/png;base64,' + base64.b64encode(png).decode()


def run(output):
    key = os.environ['DEEPSEEK_API_KEY']
    output.mkdir(parents=True, exist_ok=False)
    records = []

    def call(name, path, body):
        start = time.monotonic()
        raw = json.dumps(body).encode()
        record = {'case': name, 'at': datetime.now(timezone.utc).isoformat(),
                  'endpoint': BASE_URL + path, 'requested_model': MODEL,
                  'thinking': 'enabled', 'reasoning_effort': 'high',
                  'request_sha256': hashlib.sha256(raw).hexdigest()}
        records.append(record)
        try:
            request = urllib.request.Request(BASE_URL + path, raw,
                {'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
            with urllib.request.urlopen(request, timeout=300) as response:
                data = json.load(response)
            record.update(returned_model=data.get('model'), usage=data.get('usage'),
                          response_sha256=hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest(),
                          elapsed_seconds=round(time.monotonic() - start, 3))
            return data, record
        except Exception as error:
            record.update(status='failed', error_type=type(error).__name__, http_status=getattr(error, 'code', None))
            raise
        finally:
            (output / 'probe.json').write_text(json.dumps({'model_attribution':
                'Official alias mapping to DeepSeek-V4.1-Flash-1017; no immutable checkpoint proof',
                'source': 'https://api-docs.deepseek.com/quick_start/agent_integrations/',
                'records': records}, indent=2) + '\n')

    def chat(name, messages, **options):
        data, record = call(name, '/chat/completions', dict(model=MODEL, messages=messages,
            thinking={'type': 'enabled'}, reasoning_effort='high', max_tokens=8192, **options))
        choice = data['choices'][0]
        message = choice['message']
        record.update(finish_reason=choice['finish_reason'], reasoning_observed=bool(message.get('reasoning_content')))
        if choice['finish_reason'] not in ('stop', 'tool_calls'):
            raise ValueError('Incomplete chat response')
        return message, record

    try:
        message, record = chat('text', [{'role': 'user', 'content': 'Reply with exactly FLASH_OK.'}])
        assert message['content'].strip() == 'FLASH_OK'
        record['status'] = 'passed'
        message, record = chat('image', [{'role': 'user', 'content': [
            {'type': 'text', 'text': 'What solid color is this image? Reply with exactly RED.'},
            {'type': 'image_url', 'image_url': {'url': red_image()}}]}])
        assert message['content'].strip() == 'RED'
        record['status'] = 'passed'
        tools = [{'type': 'function', 'function': {'name': 'echo', 'description': 'Echo a text value.',
            'parameters': {'type': 'object', 'properties': {'text': {'type': 'string'}}, 'required': ['text']}}}]
        messages = [{'role': 'user', 'content': 'Call echo with text FLASH_TOOL_OK, then repeat the result exactly.'}]
        message, record = chat('tool_request', messages, tools=tools)
        assert len(message.get('tool_calls', [])) == 1
        tool = message['tool_calls'][0]
        assert tool['function']['name'] == 'echo'
        value = json.loads(tool['function']['arguments'])['text']
        assert value == 'FLASH_TOOL_OK'
        # Preserve native reasoning and assistant content across the tool round trip.
        messages.extend([message, {'role': 'tool', 'tool_call_id': tool['id'], 'content': value}])
        record['status'] = 'passed'
        message, record = chat('tool_result', messages, tools=tools)
        assert message['content'].strip() == 'FLASH_TOOL_OK'
        record['status'] = 'passed'
        data, record = call('responses_text', '/responses', {'model': MODEL,
            'input': 'Reply with exactly FLASH_RESPONSES_OK.', 'reasoning': {'effort': 'high'}, 'max_output_tokens': 8192})
        text = ''.join(part.get('text', '') for item in data.get('output', []) for part in item.get('content', []) if part.get('type') == 'output_text')
        assert data.get('status') == 'completed' and text.strip() == 'FLASH_RESPONSES_OK'
        record['status'] = 'passed'
    finally:
        for record in records:
            record.setdefault('status', 'failed')
        report = {'requested_model': MODEL, 'attribution': 'Official mutable alias mapping to DeepSeek-V4.1-Flash-1017',
                  'source': 'https://api-docs.deepseek.com/quick_start/agent_integrations/',
                  'passed': all(record['status'] == 'passed' for record in records) and len(records) == 5,
                  'records': records}
        (output / 'probe.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps({'passed': report['passed'], 'cases': len(records), 'report': str(output / 'probe.json')}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    run(parser.parse_args().out)
