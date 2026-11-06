"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Custom User Model & Campus Roles
==============================================================================
"""

import uuid
from django.db import models
from django.contrib.auth.models import (
    AbstractBaseUser,
    PermissionsMixin,
    BaseUserManager,
)
from django.utils.crypto import salted_hmac

class UserRole(models.TextChoices):
    STUDENT_STAFF = 'STUDENT_STAFF', 'Student / Staff'
    SECURITY_PERSONNEL = 'SECURITY_PERSONNEL', 'Security Personnel'
    CAMPUS_ADMIN = 'CAMPUS_ADMIN', 'Campus Administrator'
    SYSTEM_ADMIN = 'SYSTEM_ADMIN', 'System Administrator'

class UserType(models.TextChoices):
    """Institutional account category, separate from the application's access role."""
    STUDENT = 'STUDENT', 'Student'
    STAFF = 'STAFF', 'Staff'
    SECURITY_OFFICER = 'SECURITY_OFFICER', 'Security Officer'
    CAMPUS_ADMIN = 'CAMPUS_ADMIN', 'Campus Administrator'
    SYSTEM_ADMIN = 'SYSTEM_ADMIN', 'System Administrator'
    UNSPECIFIED = 'UNSPECIFIED', 'Unspecified Student / Staff'

class UserManager(BaseUserManager):
    """Custom user manager supporting email/registration number as identifiers."""

    def create_user(self, email, registration_number, full_name, password=None, **extra_fields):
        if not email:
            raise ValueError("An official email address is required.")
        if not registration_number:
            raise ValueError("A university registration number is required.")

        email = self.normalize_email(email).lower()
        registration_number = registration_number.strip().upper()

        user = self.model(
            email=email,
            registration_number=registration_number,
            full_name=full_name.strip(),
            **extra_fields,
        )
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()

        user.save(using=self._db)
        return user

    def create_superuser(self, email, registration_number, full_name, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', UserRole.SYSTEM_ADMIN)
        extra_fields.setdefault('user_type', UserType.SYSTEM_ADMIN)

        if extra_fields.get('is_staff') is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get('is_superuser') is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self.create_user(email, registration_number, full_name, password, **extra_fields)

class User(AbstractBaseUser, PermissionsMixin):
    """
    Campus User Model representing students, faculty, security officers, and administrators.
    Uses UUID4 as the primary key to ensure anti-enumeration security.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    registration_number = models.CharField(max_length=30, unique=True, db_index=True)
    email = models.EmailField(unique=True, db_index=True)
    full_name = models.CharField(max_length=150)
    
    role = models.CharField(
        max_length=30,
        choices=UserRole.choices,
        default=UserRole.STUDENT_STAFF,
        db_index=True,
    )
    # Existing STUDENT_STAFF access role intentionally remains unchanged. This
    # field distinguishes student from staff accounts for policies that apply
    # to students only. Legacy rows stay UNSPECIFIED until an administrator
    # classifies them; they are not guessed to be students or staff.
    user_type = models.CharField(
        max_length=24,
        choices=UserType.choices,
        default=UserType.UNSPECIFIED,
        db_index=True,
    )
    department = models.CharField(max_length=150, blank=True, default='')
    security_post = models.CharField(max_length=150, blank=True, default='')
    phone = models.CharField(max_length=20, blank=True, default='')
    
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    auth_token_version = models.PositiveIntegerField(default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['registration_number', 'full_name']

    class Meta:
        verbose_name = 'Campus User'
        verbose_name_plural = 'Campus Users'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['email']),
            models.Index(fields=['registration_number']),
            models.Index(fields=['role']),
        ]

    def __str__(self):
        return f"{self.full_name} ({self.registration_number}) - {self.role}"

    def get_session_auth_hash(self):
        """Invalidate Django sessions after an administrator revokes this account."""
        base_hash = super().get_session_auth_hash()
        if not self.auth_token_version:
            return base_hash
        return salted_hmac(
            'accounts.User.session_auth_version',
            f'{base_hash}:{self.auth_token_version}',
        ).hexdigest()
