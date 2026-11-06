from datetime import timedelta

from django.db import migrations, models


def backfill_otp_generated_at(apps, schema_editor):
    DirectRecovery = apps.get_model('handovers', 'DirectRecovery')
    recoveries = DirectRecovery.objects.filter(
        otp_generated_at__isnull=True,
        otp_expires_at__isnull=False,
    )
    for recovery in recoveries.iterator():
        recovery.otp_generated_at = recovery.otp_expires_at - timedelta(hours=48)
        recovery.save(update_fields=['otp_generated_at'])


class Migration(migrations.Migration):
    dependencies = [
        ('handovers', '0003_directrecovery'),
    ]

    operations = [
        migrations.AddField(
            model_name='directrecovery',
            name='otp_generated_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(backfill_otp_generated_at, migrations.RunPython.noop),
    ]
