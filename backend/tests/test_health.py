"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Phase 1 Test Suite: Service Health & Connectivity Diagnostics
==============================================================================
"""

import pytest
from rest_framework.test import APIClient

@pytest.mark.django_db
def test_health_check_endpoint():
    """Verify GET /api/v1/health/ returns HTTP 200 with envelope and database diagnostics."""
    client = APIClient()
    response = client.get('/api/v1/health/')

    assert response.status_code == 200
    data = response.json()

    # Unified API response envelope contract
    assert data.get('success') is True
    assert data.get('statusCode') == 200
    assert 'data' in data

    payload = data['data']
    assert payload.get('status') == 'HEALTHY'
    assert 'LPU Lost & Found' in payload.get('service', '')
    assert 'uptimeSeconds' in payload
    assert 'timestamp' in payload
    assert payload.get('database', {}).get('connected') is True
    assert payload.get('database', {}).get('state') == 'CONNECTED'
