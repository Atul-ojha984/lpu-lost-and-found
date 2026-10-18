"""
==============================================================================
LPU Lost & Found Property Recovery Platform
DRF Unified Response Envelope Renderer
==============================================================================
Ensures DRF response envelopes precisely match the format expected by the
existing Next.js frontend (apps/web/src/lib/api-client.ts):

{
  "success": true,
  "statusCode": 200,
  "message": "Operation successful",
  "data": { ... },
  "meta": { ... }
}
"""

from rest_framework.renderers import JSONRenderer

class ApiEnvelopeRenderer(JSONRenderer):
    charset = 'utf-8'

    def render(self, data, accepted_media_type=None, renderer_context=None):
        response = renderer_context.get('response') if renderer_context else None
        status_code = response.status_code if response else 200

        # Skip envelope wrapping for OpenAPI schema endpoints
        request = renderer_context.get('request') if renderer_context else None
        if request and (request.path.startswith('/api/schema') or request.path.startswith('/api/docs') or request.path.startswith('/api/redoc')):
            return super().render(data, accepted_media_type, renderer_context)

        # Skip wrapping if already wrapped or custom formatted
        if isinstance(data, dict) and ('success' in data or 'error' in data):
            # Ensure statusCode is set
            if 'statusCode' not in data:
                data['statusCode'] = status_code
            return super().render(data, accepted_media_type, renderer_context)

        # Check for paginated response structure
        meta = None
        wrapped_data = data
        if isinstance(data, dict) and 'results' in data and ('count' in data or 'total' in data):
            meta = {
                'total': data.get('count') or data.get('total'),
                'next': data.get('next'),
                'previous': data.get('previous'),
                'page': data.get('page', 1),
                'pageSize': data.get('page_size', 20),
            }
            wrapped_data = data.get('results')

        envelope = {
            'success': status_code < 400,
            'statusCode': status_code,
            'data': wrapped_data,
        }

        if meta:
            envelope['meta'] = meta

        return super().render(envelope, accepted_media_type, renderer_context)
