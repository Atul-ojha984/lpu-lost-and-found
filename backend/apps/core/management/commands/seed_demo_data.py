"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Management Command: Seed Initial Taxonomy, Demo Accounts & Sample Records
==============================================================================
"""

from datetime import datetime, timezone, timedelta
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import User, UserRole
from apps.locations.models import Location
from apps.items.models import ItemCategory, Item, ItemType, ItemStatus
from apps.verification.models import PrivateDetail, VerificationChallenge
from apps.custody.models import CustodyRecord, CustodyAction
from apps.audit.models import AuditEntry, AuditAction
from apps.matching.services import generate_match_suggestions_for_item

DEFAULT_CATEGORIES = [
    {'code': 'ELECTRONICS', 'name': 'Electronics & Gadgets', 'description': 'Laptops, smartphones, smartwatches, calculators, earphones, chargers', 'icon': 'Laptop', 'default_retention_days': 90},
    {'code': 'STUDENT_ID_CARDS', 'name': 'Student ID Cards', 'description': 'LPU university identity cards, RFID access tags', 'icon': 'CreditCard', 'default_retention_days': 30},
    {'code': 'WALLETS_PURSE', 'name': 'Wallets & Purses', 'description': 'Wallets, purses, pouches with currency or payment cards', 'icon': 'Wallet', 'default_retention_days': 60},
    {'code': 'DOCUMENTS_BOOKS', 'name': 'Documents & Notebooks', 'description': 'Textbooks, lab registers, project binders, government certificates', 'icon': 'FileText', 'default_retention_days': 90},
    {'code': 'KEYS', 'name': 'Keys & Keychains', 'description': 'Room keys, bike/scooty keys, locker master keys', 'icon': 'Key', 'default_retention_days': 45},
    {'code': 'BAGS_BACKPACKS', 'name': 'Bags & Backpacks', 'description': 'College backpacks, gym duffels, side bags, laptop sleeves', 'icon': 'Backpack', 'default_retention_days': 90},
    {'code': 'CLOTHING_ACCESSORIES', 'name': 'Clothing & Wearables', 'description': 'Jackets, sweaters, caps, prescription glasses, watches', 'icon': 'Shirt', 'default_retention_days': 60},
    {'code': 'SPORTS_EQUIPMENT', 'name': 'Sports Equipment', 'description': 'Badminton rackets, basketballs, gym gloves, water bottles', 'icon': 'Dumbbell', 'default_retention_days': 45},
    {'code': 'OTHERS', 'name': 'Miscellaneous Items', 'description': 'Umbrellas, stationery kits, miscellaneous personal effects', 'icon': 'HelpCircle', 'default_retention_days': 30},
]

DEFAULT_LOCATIONS = [
    {'code': 'BLOCK_30_38', 'name': 'Block 30–38', 'campus_zone': 'Engineering & Technology Academic Hub', 'building_name': 'Block 34', 'has_security_desk': True, 'security_contact_phone': '+91-1824-517034'},
    {'code': 'BLOCK_55_58', 'name': 'Block 55–58', 'campus_zone': 'Management & Applied Sciences', 'building_name': 'Block 56', 'has_security_desk': True, 'security_contact_phone': '+91-1824-517056'},
    {'code': 'UNI_MALL', 'name': 'Uni-Mall', 'campus_zone': 'Commercial Center & Student Food Court', 'building_name': 'Uni-Mall Central', 'has_security_desk': True, 'security_contact_phone': '+91-1824-517100'},
    {'code': 'CENTRAL_LIBRARY', 'name': 'Central Library', 'campus_zone': 'Reading Halls & Reference Wing', 'building_name': 'Central Library Building', 'has_security_desk': True, 'security_contact_phone': '+91-1824-517088'},
    {'code': 'INDOOR_STADIUM_SHANTI_DEVI', 'name': 'Shanti Devi Sports Complex', 'campus_zone': 'Indoor Stadium, Gym & Courts', 'building_name': 'Sports Complex', 'has_security_desk': True, 'security_contact_phone': '+91-1824-517099'},
    {'code': 'RESIDENTIAL_BOYS_BH', 'name': 'Boys Hostels (BH-1 to BH-8)', 'campus_zone': 'Residential Zone North', 'building_name': 'BH-4 Warden Post', 'has_security_desk': True, 'security_contact_phone': '+91-1824-517104'},
    {'code': 'RESIDENTIAL_GIRLS_GH', 'name': 'Girls Hostels (GH-1 to GH-6)', 'campus_zone': 'Residential Zone South', 'building_name': 'GH-2 Warden Post', 'has_security_desk': True, 'security_contact_phone': '+91-1824-517202'},
    {'code': 'MAIN_GATE_SECURITY', 'name': 'Main Security Posts (Gate 1 & 2)', 'campus_zone': 'Campus Transit Points', 'building_name': 'Main Gate Security Office', 'has_security_desk': True, 'security_contact_phone': '+91-1824-517001'},
    {'code': 'ROBOPARK_BALDEV_RAJ_MITTAL', 'name': 'Baldev Raj Mittal Unipolis & Park', 'campus_zone': 'Auditorium & Green Lawn', 'building_name': 'Unipolis', 'has_security_desk': False, 'security_contact_phone': ''},
    {'code': 'OTHER_CAMPUS_AREA', 'name': 'Other Campus Perimeter', 'campus_zone': 'General Grounds & Walkways', 'building_name': 'Campus Perimeter', 'has_security_desk': False, 'security_contact_phone': ''},
]

class Command(BaseCommand):
    help = 'Seeds initial taxonomy, demo accounts and recovery records for LPU Lost & Found.'

    def handle(self, *args, **options):
        if settings.IS_PRODUCTION:
            raise CommandError(
                'Demo data seeding is disabled in production. Use the authorized account provisioning workflow.'
            )

        self.stdout.write('Starting LPU Lost & Found initial database seed...')

        with transaction.atomic():
            # 1. Categories
            for cat_data in DEFAULT_CATEGORIES:
                ItemCategory.objects.update_or_create(
                    code=cat_data['code'],
                    defaults=cat_data
                )
            self.stdout.write(self.style.SUCCESS(f'Seeded {len(DEFAULT_CATEGORIES)} item categories.'))

            # 2. Locations
            for loc_data in DEFAULT_LOCATIONS:
                Location.objects.update_or_create(
                    code=loc_data['code'],
                    defaults=loc_data
                )
            self.stdout.write(self.style.SUCCESS(f'Seeded {len(DEFAULT_LOCATIONS)} campus locations.'))

            # 3. Demo Users (matching quick-fill presets and official UI specifications)
            import os
            student_pwd = os.getenv('DEV_STUDENT_PASSWORD', 'DemoStudent2026!')
            security_pwd = os.getenv('DEV_SECURITY_PASSWORD', 'DemoSecurity2026!')
            admin_pwd = os.getenv('DEV_ADMIN_PASSWORD', 'DemoAdmin2026!')

            # Clean up obsolete typo records if present to avoid unique constraint collisions
            User.objects.filter(email='aarav.sharma.12108@lpu.in', registration_number='12108001').delete()
            User.objects.filter(email='rajesh.verma.sec@lpu.in', registration_number='SEC8001').delete()
            User.objects.filter(email='sunita.admin@lpu.in', registration_number='ADM9001').delete()

            student_user, _ = User.objects.update_or_create(
                email='aarav.sharma.12108@lpu.in',
                defaults={
                    'registration_number': '12108801',
                    'full_name': 'Aarav Sharma',
                    'role': UserRole.STUDENT_STAFF,
                    'department': 'School of Computer Science & Engineering',
                    'phone': '+91 98765 43210',
                    'is_active': True,
                }
            )
            student_user.set_password(student_pwd)
            student_user.save()

            security_user, _ = User.objects.update_or_create(
                email='rajesh.verma.sec@lpu.in',
                defaults={
                    'registration_number': 'LPU-SEC-001',
                    'full_name': 'Rajesh Verma (Officer)',
                    'role': UserRole.SECURITY_PERSONNEL,
                    'department': 'Campus Security Department',
                    'security_post': 'Main Gate 1 Security Desk',
                    'phone': '+91 98765 43211',
                    'is_active': True,
                }
            )
            security_user.set_password(security_pwd)
            security_user.save()

            admin_user, _ = User.objects.update_or_create(
                email='sunita.admin@lpu.in',
                defaults={
                    'registration_number': 'LPU-ADM-001',
                    'full_name': 'Sunita Rao (Dean of Student Welfare)',
                    'role': UserRole.CAMPUS_ADMIN,
                    'department': 'Division of Student Welfare',
                    'phone': '+91 98765 43212',
                    'is_active': True,
                    'is_staff': True,
                }
            )
            admin_user.set_password(admin_pwd)
            admin_user.save()

            # E2E Smoke Test Users
            student2_user, _ = User.objects.update_or_create(
                email='student2@lpu.co.in',
                defaults={
                    'registration_number': '12209999',
                    'full_name': 'Riya Patel',
                    'role': UserRole.STUDENT_STAFF,
                    'department': 'School of Electronics & Electrical Engineering',
                    'is_active': True,
                }
            )
            student2_user.set_password('Student@12345')
            student2_user.save()

            sec2_user, _ = User.objects.update_or_create(
                email='security@lpu.co.in',
                defaults={
                    'registration_number': 'SEC9999',
                    'full_name': 'Balwinder Singh (Head Warden)',
                    'role': UserRole.SECURITY_PERSONNEL,
                    'department': 'Campus Security Department',
                    'security_post': 'Main Gate 1 Security Desk',
                    'is_active': True,
                }
            )
            sec2_user.set_password('Security@12345')
            sec2_user.save()

            self.stdout.write(self.style.SUCCESS('Seeded demo users: Student, Security Officer, Campus Administrator, and E2E Smoke Test Personas.'))

            # 4. Sample Items
            elec_cat = ItemCategory.objects.get(code='ELECTRONICS')
            id_cat = ItemCategory.objects.get(code='STUDENT_ID_CARDS')
            wallet_cat = ItemCategory.objects.get(code='WALLETS_PURSE')
            sports_cat = ItemCategory.objects.get(code='SPORTS_EQUIPMENT')

            lib_loc = Location.objects.get(code='CENTRAL_LIBRARY')
            b34_loc = Location.objects.get(code='BLOCK_30_38')
            mall_loc = Location.objects.get(code='UNI_MALL')
            gate_loc = Location.objects.get(code='MAIN_GATE_SECURITY')
            stadium_loc = Location.objects.get(code='INDOOR_STADIUM_SHANTI_DEVI')

            now = datetime.now(timezone.utc)

            # Item 1: FOUND Scientific Calculator
            item1, _ = Item.objects.update_or_create(
                reference_number='LPU-2026-F1001',
                defaults={
                    'item_type': ItemType.FOUND,
                    'title': 'Scientific Calculator fx-991EX',
                    'public_description': 'Black casing Casio ClassWiz fx-991EX scientific calculator found on desk 14 in 2nd floor reference reading room.',
                    'category': elec_cat,
                    'location': lib_loc,
                    'specific_location': 'Central Library 2nd Floor Reference Section Desk 14',
                    'event_date': now - timedelta(days=2),
                    'status': ItemStatus.IN_CUSTODY,
                    'reported_by': student_user,
                    'current_custody_desk': 'Central Library Security Desk',
                    'retention_expires_at': now + timedelta(days=90),
                }
            )
            # Private vault for Item 1
            PrivateDetail.objects.update_or_create(
                item=item1,
                defaults={
                    'fields_summary': ['Back Panel Initials', 'Battery Compartment Sticker'],
                    'encrypted_ciphertext': '636173696f2d696e697469616c732d6161726176',
                    'iv': '0123456789abcdef01234567',
                    'auth_tag': '0123456789abcdef0123456789abcdef',
                }
            )
            # Challenge Question for Item 1
            VerificationChallenge.objects.update_or_create(
                item=item1,
                question_text='What initials or marking are engraved on the back of the battery cover?',
                defaults={
                    'hint': 'Two letters in silver marker',
                    'max_attempts': 3,
                    'is_active': True,
                }
            )

            # Item 2: LOST Dell Laptop Charger
            item2, _ = Item.objects.update_or_create(
                reference_number='LPU-2026-L1002',
                defaults={
                    'item_type': ItemType.LOST,
                    'title': 'Navy Blue Dell Laptop Charger (65W Type-C)',
                    'public_description': 'Dell original 65W USB Type-C barrel power adapter misplaced during evening lab session in Block 34.',
                    'category': elec_cat,
                    'location': b34_loc,
                    'specific_location': 'Block 34 Room 308 Computer Lab 4',
                    'event_date': now - timedelta(days=1),
                    'status': ItemStatus.REPORTED,
                    'reported_by': student_user,
                    'retention_expires_at': now + timedelta(days=90),
                }
            )

            # Item 3: FOUND Student RFID Identity Card
            item3, _ = Item.objects.update_or_create(
                reference_number='LPU-2026-F1003',
                defaults={
                    'item_type': ItemType.FOUND,
                    'title': 'LPU Student RFID Identity Card & Red Lanyard',
                    'public_description': 'Standard university student identity smart card on branded red woven neck ribbon found near transit gate turnstiles.',
                    'category': id_cat,
                    'location': gate_loc,
                    'specific_location': 'Main Gate 1 Turnstile Entrance Lane 2',
                    'event_date': now - timedelta(hours=14),
                    'status': ItemStatus.IN_CUSTODY,
                    'reported_by': security_user,
                    'current_custody_desk': 'Main Gate 1 Security Desk',
                    'retention_expires_at': now + timedelta(days=30),
                }
            )

            # Item 4: LOST Leather Wallet
            item4, _ = Item.objects.update_or_create(
                reference_number='LPU-2026-L1004',
                defaults={
                    'item_type': ItemType.LOST,
                    'title': 'Brown Leather Trifold Wallet',
                    'public_description': 'Dark brown genuine leather trifold wallet misplaced near food court seating area in Uni-Mall.',
                    'category': wallet_cat,
                    'location': mall_loc,
                    'specific_location': 'Uni-Mall 1st Floor Food Court Table 22',
                    'event_date': now - timedelta(days=3),
                    'status': ItemStatus.REPORTED,
                    'reported_by': student_user,
                    'retention_expires_at': now + timedelta(days=60),
                }
            )

            # Item 5: FOUND Shaker Bottle
            item5, _ = Item.objects.update_or_create(
                reference_number='LPU-2026-F1005',
                defaults={
                    'item_type': ItemType.FOUND,
                    'title': 'Black Metal Protein Shaker Bottle (750ml)',
                    'public_description': 'Matte black stainless steel shaker bottle with BlenderBall wire whisk found on court bench.',
                    'category': sports_cat,
                    'location': stadium_loc,
                    'specific_location': 'Shanti Devi Sports Complex Badminton Court 3',
                    'event_date': now - timedelta(days=4),
                    'status': ItemStatus.READY_FOR_HANDOVER,
                    'reported_by': security_user,
                    'current_custody_desk': 'Shanti Devi Sports Complex Desk',
                    'retention_expires_at': now + timedelta(days=45),
                }
            )

            # Custody records
            CustodyRecord.objects.get_or_create(
                item=item1,
                action=CustodyAction.INITIAL_INTAKE,
                defaults={
                    'from_location': 'Central Library 2nd Floor',
                    'to_location': 'Central Library Security Desk',
                    'locker_reference': 'LOCKER-LIB-04',
                    'evidence_reference': 'INTAKE-F1001-LIB',
                    'handled_by': security_user,
                    'remarks': 'Intake verified from student Aarav Sharma.',
                }
            )

            CustodyRecord.objects.get_or_create(
                item=item3,
                action=CustodyAction.INITIAL_INTAKE,
                defaults={
                    'from_location': 'Main Gate 1 Turnstiles',
                    'to_location': 'Main Gate 1 Security Desk',
                    'locker_reference': 'DESK-DRAWER-1',
                    'evidence_reference': 'INTAKE-F1003-GATE',
                    'handled_by': security_user,
                    'remarks': 'Found near turnstile lane 2.',
                }
            )

            # Initial Audit entry
            AuditEntry.objects.create(
                actor=admin_user,
                actor_role=UserRole.CAMPUS_ADMIN,
                action=AuditAction.CONFIG_UPDATE,
                target_entity='System',
                target_id='INIT_SEED',
                ip_address='127.0.0.1',
                user_agent='Django Seed Command',
                metadata={'message': 'Initial seed data established.'},
            )

            # Generate match suggestions
            generate_match_suggestions_for_item(item1.id)
            generate_match_suggestions_for_item(item2.id)

            self.stdout.write(self.style.SUCCESS('Successfully seeded 5 items, custody records, and matches.'))
