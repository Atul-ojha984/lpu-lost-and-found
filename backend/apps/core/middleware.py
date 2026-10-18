"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Core API Middleware
==============================================================================
Ensures unmapped API routes return uniform JSON error envelopes.
"""

from django.http import JsonResponse

class ApiErrorEnvelopeMiddleware:
    """Intercepts unhandled 404s and errors under /api/ and converts them to JSON envelopes."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        # Only intercept for /api/ routes that aren't already application/json
        if request.path.startswith('/api/') and response.status_code == 404:
            content_type = response.get('Content-Type', '')
            if 'application/json' not in content_type:
                return JsonResponse({
                    'success': False,
                    'statusCode': 404,
                    'error': {
                        'code': 'NOT_FOUND',
                        'message': f'Endpoint not found: {request.path}',
                    }
                }, status=404)

        return response
