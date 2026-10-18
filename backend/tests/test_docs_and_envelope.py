"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Phase 1 Test Suite: OpenAPI Documentation & Response Envelope
==============================================================================
"""

import pytest
from rest_framework.test import APIClient

@pytest.mark.django_db
class TestDocsAndEnvelopeSuite:
    """Verifies OpenAPI schema, Swagger UI, ReDoc, and custom error formats."""

    def setup_method(self):
        self.client = APIClient()

    def test_schema_endpoint(self):
        """Verify GET /api/schema/ returns OpenAPI 3.0 specification."""
        response = self.client.get('/api/schema/')
        assert response.status_code == 200
        # Should be openapi format (YAML or JSON)
        assert 'openapi' in response.content.decode('utf-8')

    def test_swagger_ui_endpoint(self):
        """Verify GET /api/docs/ returns Swagger UI HTML."""
        response = self.client.get('/api/docs/')
        assert response.status_code == 200
        assert 'swagger-ui' in response.content.decode('utf-8').lower()

    def test_redoc_endpoint(self):
        """Verify GET /api/redoc/ returns ReDoc HTML."""
        response = self.client.get('/api/redoc/')
        assert response.status_code == 200
        assert 'redoc' in response.content.decode('utf-8').lower()

    def test_404_error_envelope(self):
        """Verify unmapped routes return standardized 404 envelope."""
        response = self.client.get('/api/v1/non-existent-endpoint/')
        assert response.status_code == 404
        body = response.json()
        assert body['success'] is False
        assert body['statusCode'] == 404
        assert body['error']['code'] == 'NOT_FOUND'
