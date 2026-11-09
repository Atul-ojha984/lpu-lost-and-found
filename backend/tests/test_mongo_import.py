"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Phase 2 Test Suite: MongoDB to Django ORM Import & Mapping Command
==============================================================================
"""

import bcrypt
import json
import pytest
from pathlib import Path
from django.core.management import call_command
from rest_framework.test import APIClient
from apps.accounts.models import User, UserRole
from apps.items.models import ItemCategory, Item
from apps.locations.models import Location
from apps.verification.models import PrivateDetail

@pytest.mark.django_db
def test_import_mongo_data_from_json(tmp_path):
    """Verifies that import_mongo_data reads JSON exports, validates references, and imports cleanly."""
    imported_password = 'ImportedBcryptPassword@123'
    valid_bcrypt_hash = bcrypt.hashpw(
        imported_password.encode('utf-8'),
        bcrypt.gensalt(rounds=4),
    ).decode('ascii')
    json_dir = tmp_path / "mongo_exports"
    json_dir.mkdir()

    # Seed mock mongo export files
    categories_data = [
        {
            '_id': '64e819b21f3a2b1001',
            'code': 'DOCUMENTS_BOOKS',
            'name': 'Documents & Books',
            'description': 'Student textbooks, notebooks, certificates',
            'isActive': True,
            'defaultRetentionDays': 180,
        }
    ]
    locations_data = [
        {
            '_id': '64e819b21f3a2b1002',
            'code': 'UNI_MALL',
            'name': 'Uni Mall Student Center',
            'campusZone': 'UNI_MALL',
            'hasSecurityDesk': True,
            'isActive': True,
        }
    ]
    users_data = [
        {
            '_id': '64e819b21f3a2b1003',
            'registrationNumber': '12009988',
            'email': 'student.mongo@lpu.in',
            'fullName': 'Mongo Test Student',
            'role': 'STUDENT_STAFF',
            'passwordHash': valid_bcrypt_hash,
            'isActive': True,
        }
    ]
    items_data = [
        {
            '_id': '64e819b21f3a2b1004',
            'referenceNumber': 'LPU-2026-F99881',
            'itemType': 'FOUND',
            'title': 'Operating Systems Textbook (Silberschatz)',
            'publicDescription': 'Hardcover 10th edition found at Uni Mall food court.',
            'category': '64e819b21f3a2b1001',
            'location': '64e819b21f3a2b1002',
            'specificLocation': 'Food Court Table 12',
            'eventDate': '2026-10-15T14:30:00Z',
            'status': 'REPORTED',
            'reportedBy': '64e819b21f3a2b1003',
            'retentionExpiresAt': '2027-04-15T14:30:00Z',
            'isArchived': False,
        }
    ]

    with open(json_dir / "categories.json", "w") as f:
        json.dump(categories_data, f)
    with open(json_dir / "locations.json", "w") as f:
        json.dump(locations_data, f)
    with open(json_dir / "users.json", "w") as f:
        json.dump(users_data, f)
    with open(json_dir / "items.json", "w") as f:
        json.dump(items_data, f)

    # 1. Test Dry Run (rollback check)
    call_command('import_mongo_data', json_dir=str(json_dir), dry_run=True)
    assert not Item.objects.filter(reference_number='LPU-2026-F99881').exists()

    # 2. Test Real Migration
    call_command('import_mongo_data', json_dir=str(json_dir))

    # Assert category imported
    category = ItemCategory.objects.get(code='DOCUMENTS_BOOKS')
    assert category.name == 'Documents & Books'

    # Assert location imported
    location = Location.objects.get(code='UNI_MALL')
    assert location.has_security_desk is True

    # Assert raw Express bcrypt is represented using Django's legacy bcrypt
    # format and can authenticate, then upgrades to the preferred hasher.
    user = User.objects.get(registration_number='12009988')
    assert user.full_name == 'Mongo Test Student'
    assert user.password.startswith('bcrypt$$2')

    response = APIClient().post(
        '/api/v1/auth/login/',
        {'emailOrRegNo': '12009988', 'password': imported_password},
        format='json',
    )
    assert response.status_code == 200
    user.refresh_from_db()
    assert user.password.startswith('bcrypt_sha256$')

    # Assert item imported with correct foreign key mappings
    item = Item.objects.get(reference_number='LPU-2026-F99881')
    assert item.title == 'Operating Systems Textbook (Silberschatz)'
    assert item.category == category
    assert item.location == location
    assert item.reported_by == user
