"""
==============================================================================
LPU Lost & Found Property Recovery Platform
DRF Centralized Exception Handler
==============================================================================
Formats exceptions into standard frontend error contracts:

{
  "success": false,
  "statusCode": 400,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Error description",
    "details": [ ... ]
  }
}
"""

import logging
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status

logger = logging.getLogger('apps.core.exceptions')

def custom_exception_handler(exc, context):
    """
    Standardize all DRF and unhandled Python exceptions to match the Express API contract.
    """
    response = exception_handler(exc, context)

    # Handled DRF exceptions
    if response is not None:
        status_code = response.status_code
        error_code = 'API_ERROR'
        message = 'An error occurred while processing your request.'
        details = []

        if status_code == 400:
            error_code = 'VALIDATION_ERROR'
            message = 'Request validation failed'
            if isinstance(response.data, dict):
                for field, errs in response.data.items():
                    err_msg = errs[0] if isinstance(errs, list) and len(errs) > 0 else str(errs)
                    details.append({'field': field, 'message': err_msg})
                    # If non_field_errors or detail exists, use as primary message
                    if field in ('non_field_errors', 'detail'):
                        message = err_msg
            elif isinstance(response.data, list):
                details = response.data
                message = str(response.data[0]) if response.data else message
        elif status_code == 401:
            error_code = 'UNAUTHORIZED'
            message = response.data.get('detail', 'Authentication required to access this resource.') if isinstance(response.data, dict) else str(response.data)
        elif status_code == 403:
            error_code = 'FORBIDDEN'
            message = response.data.get('detail', 'You do not have permission to perform this action.') if isinstance(response.data, dict) else str(response.data)
        elif status_code == 404:
            error_code = 'NOT_FOUND'
            message = response.data.get('detail', 'Requested resource was not found.') if isinstance(response.data, dict) else str(response.data)
        elif status_code == 429:
            error_code = 'TOO_MANY_REQUESTS'
            message = response.data.get('detail', 'Request limit exceeded. Please retry later.') if isinstance(response.data, dict) else str(response.data)

        error_payload = {
            'success': False,
            'statusCode': status_code,
            'error': {
                'code': error_code,
                'message': message,
            }
        }

        if details:
            error_payload['error']['details'] = details

        response.data = error_payload
        return response

    # Unhandled 500 exceptions
    logger.exception("Unhandled server exception: %s", exc)
    return Response(
        {
            'success': False,
            'statusCode': status.HTTP_500_INTERNAL_SERVER_ERROR,
            'error': {
                'code': 'INTERNAL_SERVER_ERROR',
                'message': 'An internal server error occurred. Please contact security administration.',
            }
        },
        status=status.HTTP_500_INTERNAL_SERVER_ERROR
    )
