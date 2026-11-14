"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Management Command: Create or Safely Verify Local Development Accounts
==============================================================================
Provides a safe, non-destructive way to provision or verify local development
accounts without printing passwords, resetting existing accounts silently,
or exposing sensitive data.
"""

import os
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from apps.accounts.models import User, UserRole, UserType

class Command(BaseCommand):
    help = 'Safely creates or verifies local development accounts for Student, Security, and Admin roles.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--role',
            type=str,
            choices=['student', 'security', 'admin', 'all'],
            default='all',
            help='Specify which development persona to provision (default: all).'
        )
        parser.add_argument(
            '--student-reg',
            type=str,
            default=os.getenv('DEV_STUDENT_REG', '12108801'),
            help='Registration number for the development student account.'
        )
        parser.add_argument(
            '--security-reg',
            type=str,
            default=os.getenv('DEV_SECURITY_REG', 'LPU-SEC-001'),
            help='Identifier for the development security officer account.'
        )
        parser.add_argument(
            '--admin-reg',
            type=str,
            default=os.getenv('DEV_ADMIN_REG', 'LPU-ADM-001'),
            help='Identifier for the development administrator account.'
        )
        parser.add_argument(
            '--reset-passwords',
            action='store_true',
            help='Force-reset passwords of existing development accounts to development defaults.'
        )

    def handle(self, *args, **options):
        if settings.IS_PRODUCTION:
            raise CommandError(
                'Development account creation is disabled in production.'
            )

        self.stdout.write(self.style.NOTICE('Initializing local development account verification...'))

        target_role = options['role']
        reset_passwords = options['reset_passwords']

        student_reg = options['student_reg'].strip().upper()
        security_reg = options['security_reg'].strip().upper()
        admin_reg = options['admin_reg'].strip().upper()

        student_pwd = os.getenv('DEV_STUDENT_PASSWORD', 'DemoStudent2026!')
        security_pwd = os.getenv('DEV_SECURITY_PASSWORD', 'DemoSecurity2026!')
        admin_pwd = os.getenv('DEV_ADMIN_PASSWORD', 'DemoAdmin2026!')

        # 1. Student Persona
        if target_role in ('student', 'all'):
            student_email = 'aarav.sharma.12108@lpu.in'
            user, created = User.objects.get_or_create(
                email=student_email,
                defaults={
                    'registration_number': student_reg,
                    'full_name': 'Aarav Sharma',
                    'role': UserRole.STUDENT_STAFF,
                    'user_type': UserType.STUDENT,
                    'department': 'School of Computer Science & Engineering',
                    'phone': '+91 98765 43210',
                    'is_active': True,
                    'is_staff': False,
                }
            )
            if created:
                user.set_password(student_pwd)
                user.save()
                self.stdout.write(self.style.SUCCESS(f'[CREATED] Student account: {student_email} (Reg: {student_reg})'))
            else:
                updated = False
                if user.registration_number != student_reg:
                    # Update registration number to match canonical identifier
                    user.registration_number = student_reg
                    updated = True
                if user.user_type != UserType.STUDENT:
                    user.user_type = UserType.STUDENT
                    updated = True
                if reset_passwords or not user.has_usable_password():
                    user.set_password(student_pwd)
                    updated = True
                if updated:
                    user.save()
                    self.stdout.write(self.style.SUCCESS(f'[UPDATED] Student account: {student_email} (Reg: {student_reg})'))
                else:
                    self.stdout.write(self.style.NOTICE(f'[EXISTS] Student account preserved: {student_email} (Reg: {user.registration_number})'))

        # 2. Security Officer Persona
        if target_role in ('security', 'all'):
            security_email = 'rajesh.verma.sec@lpu.in'
            user, created = User.objects.get_or_create(
                email=security_email,
                defaults={
                    'registration_number': security_reg,
                    'full_name': 'Rajesh Verma (Officer)',
                    'role': UserRole.SECURITY_PERSONNEL,
                    'user_type': UserType.SECURITY_OFFICER,
                    'department': 'Campus Security Department',
                    'security_post': 'Main Gate 1 Security Desk',
                    'phone': '+91 98765 43211',
                    'is_active': True,
                    'is_staff': False,
                }
            )
            if created:
                user.set_password(security_pwd)
                user.save()
                self.stdout.write(self.style.SUCCESS(f'[CREATED] Security Officer account: {security_email} (ID: {security_reg})'))
            else:
                updated = False
                if user.registration_number != security_reg:
                    user.registration_number = security_reg
                    updated = True
                if user.role != UserRole.SECURITY_PERSONNEL:
                    user.role = UserRole.SECURITY_PERSONNEL
                    updated = True
                if user.user_type != UserType.SECURITY_OFFICER:
                    user.user_type = UserType.SECURITY_OFFICER
                    updated = True
                if reset_passwords or not user.has_usable_password():
                    user.set_password(security_pwd)
                    updated = True
                if updated:
                    user.save()
                    self.stdout.write(self.style.SUCCESS(f'[UPDATED] Security Officer account: {security_email} (ID: {security_reg})'))
                else:
                    self.stdout.write(self.style.NOTICE(f'[EXISTS] Security Officer account preserved: {security_email} (ID: {user.registration_number})'))

        # 3. Campus Administrator Persona
        if target_role in ('admin', 'all'):
            admin_email = 'sunita.admin@lpu.in'
            user, created = User.objects.get_or_create(
                email=admin_email,
                defaults={
                    'registration_number': admin_reg,
                    'full_name': 'Sunita Rao (Dean of Student Welfare)',
                    'role': UserRole.CAMPUS_ADMIN,
                    'user_type': UserType.CAMPUS_ADMIN,
                    'department': 'Division of Student Welfare',
                    'phone': '+91 98765 43212',
                    'is_active': True,
                    'is_staff': True,
                }
            )
            if created:
                user.set_password(admin_pwd)
                user.save()
                self.stdout.write(self.style.SUCCESS(f'[CREATED] Campus Administrator account: {admin_email} (ID: {admin_reg})'))
            else:
                updated = False
                if user.registration_number != admin_reg:
                    user.registration_number = admin_reg
                    updated = True
                if user.role not in (UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN):
                    user.role = UserRole.CAMPUS_ADMIN
                    updated = True
                expected_type = UserType.SYSTEM_ADMIN if user.role == UserRole.SYSTEM_ADMIN else UserType.CAMPUS_ADMIN
                if user.user_type != expected_type:
                    user.user_type = expected_type
                    updated = True
                if not user.is_staff:
                    user.is_staff = True
                    updated = True
                if reset_passwords or not user.has_usable_password():
                    user.set_password(admin_pwd)
                    updated = True
                if updated:
                    user.save()
                    self.stdout.write(self.style.SUCCESS(f'[UPDATED] Campus Administrator account: {admin_email} (ID: {admin_reg})'))
                else:
                    self.stdout.write(self.style.NOTICE(f'[EXISTS] Campus Administrator account preserved: {admin_email} (ID: {user.registration_number})'))

        self.stdout.write(self.style.SUCCESS('Development accounts verification completed safely.'))
