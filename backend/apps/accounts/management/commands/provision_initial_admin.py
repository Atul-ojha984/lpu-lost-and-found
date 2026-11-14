"""Provision the first system administrator without exposing credentials."""

import getpass
import os
import sys

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError
from django.db.models import Q

from apps.accounts.models import User, UserRole, UserType
from apps.core.workflow_concurrency import SYSTEM_ADMIN_SCOPE, workflow_transaction


ADMIN_ROLES = (UserRole.CAMPUS_ADMIN, UserRole.SYSTEM_ADMIN)


class Command(BaseCommand):
    help = "Safely provision the first SYSTEM_ADMIN account on the configured database."

    def add_arguments(self, parser):
        parser.add_argument(
            "--confirm",
            action="store_true",
            help="Confirm that you intend to provision the initial administrator.",
        )
        parser.add_argument(
            "--noinput",
            "-n",
            action="store_true",
            help="Require all values through the INITIAL_ADMIN_* environment variables.",
        )

    def handle(self, *args, **options):
        if not options["confirm"]:
            raise CommandError(
                "No changes made. Review the target database, then rerun with --confirm."
            )

        self.noinput = options["noinput"]
        registration_number = self._read_value(
            "INITIAL_ADMIN_REGISTRATION_NUMBER", "Administrator registration number: "
        ).strip().upper()
        email = self._read_value("INITIAL_ADMIN_EMAIL", "Administrator email: ")
        full_name = self._read_value("INITIAL_ADMIN_FULL_NAME", "Administrator full name: ")
        password = self._read_password()

        if not registration_number or len(registration_number) > 30:
            raise CommandError("Registration number is required and must be at most 30 characters.")
        if not full_name or len(full_name) > 150:
            raise CommandError("Full name is required and must be at most 150 characters.")
        try:
            validate_email(email)
        except ValidationError:
            raise CommandError("A valid administrator email address is required.") from None

        email = User.objects.normalize_email(email).lower()
        full_name = full_name.strip()
        candidate = User(
            email=email,
            registration_number=registration_number,
            full_name=full_name,
            role=UserRole.SYSTEM_ADMIN,
            user_type=UserType.SYSTEM_ADMIN,
        )
        try:
            validate_password(password, user=candidate)
        except ValidationError:
            raise CommandError("Password does not meet the configured password policy.") from None

        try:
            with workflow_transaction(SYSTEM_ADMIN_SCOPE):
                by_registration = User.objects.filter(
                    registration_number__iexact=registration_number
                ).first()
                by_email = User.objects.filter(email__iexact=email).first()

                if by_registration and by_email and by_registration.pk != by_email.pk:
                    raise CommandError(
                        "A conflicting account already uses one of the supplied identifiers; no changes made."
                    )

                existing = by_registration or by_email
                if existing:
                    if self._is_matching_initial_admin(
                        existing, registration_number, email
                    ):
                        self.stdout.write(
                            self.style.NOTICE(
                                "The matching initial system administrator already exists; no changes made."
                            )
                        )
                        return
                    raise CommandError(
                        "An account already uses one of the supplied identifiers; no changes made."
                    )

                existing_admin = User.objects.filter(
                    Q(role__in=ADMIN_ROLES) | Q(is_superuser=True)
                ).first()
                if existing_admin:
                    raise CommandError(
                        "An administrator already exists; this command will not create or change accounts."
                    )

                user = User.objects.create_superuser(
                    email=email,
                    registration_number=registration_number,
                    full_name=full_name,
                    password=password,
                )
                if not (
                    user.role == UserRole.SYSTEM_ADMIN
                    and user.user_type == UserType.SYSTEM_ADMIN
                    and user.is_staff
                    and user.is_superuser
                    and user.is_active
                ):
                    raise CommandError(
                        "The configured user manager did not create the expected active system administrator."
                    )
        except IntegrityError:
            raise CommandError(
                "A conflicting account was created concurrently; no existing account was changed."
            ) from None

        self.stdout.write(self.style.SUCCESS("Initial system administrator provisioned."))

    @staticmethod
    def _is_matching_initial_admin(user, registration_number, email):
        return bool(
            user.registration_number.strip().upper() == registration_number
            and user.email.strip().lower() == email
            and user.role == UserRole.SYSTEM_ADMIN
            and user.user_type == UserType.SYSTEM_ADMIN
            and user.is_staff
            and user.is_superuser
            and user.is_active
        )

    def _read_value(self, env_name, prompt):
        value = os.environ.get(env_name)
        if value is not None and value.strip():
            return value.strip()
        if self.noinput:
            raise CommandError(f"Set {env_name} or rerun without --noinput for secure prompting.")
        if not sys.stdin.isatty():
            raise CommandError(f"{env_name} is required when no interactive terminal is available.")
        return input(prompt).strip()

    def _read_password(self):
        password = os.environ.get("INITIAL_ADMIN_PASSWORD")
        if password is not None:
            if not password or password.isspace():
                raise CommandError("INITIAL_ADMIN_PASSWORD must not be blank.")
            return password
        if self.noinput:
            raise CommandError(
                "Set INITIAL_ADMIN_PASSWORD or rerun without --noinput for secure password prompting."
            )
        if not sys.stdin.isatty():
            raise CommandError("INITIAL_ADMIN_PASSWORD is required without an interactive terminal.")

        password = getpass.getpass("Administrator password (input hidden): ")
        confirmation = getpass.getpass("Confirm administrator password (input hidden): ")
        if not password:
            raise CommandError("Administrator password must not be blank.")
        if password != confirmation:
            raise CommandError("The password confirmation did not match.")
        return password
