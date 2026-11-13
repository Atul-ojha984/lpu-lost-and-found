from django.db import migrations, models
from django.db.models.functions import Lower


def backfill_name_keys(apps, schema_editor):
    CustodyLocation = apps.get_model('custody', 'CustodyLocation')
    seen = {}
    records = list(CustodyLocation.objects.only('pk', 'name').order_by('pk'))
    for record in records:
        name_key = (record.name or '').strip().lower()
        if name_key in seen:
            raise RuntimeError(
                'Cannot enable unique custody location names: records '
                f'{seen[name_key]} and {record.pk} have the same normalized name.'
            )
        seen[name_key] = record.pk
    for record in records:
        record.name_key = (record.name or '').strip().lower()
        record.save(update_fields=['name_key'])


def remove_legacy_functional_index(apps, schema_editor):
    # This constraint has no MongoDB index representation in backend 5.2.
    # Its normalized-field replacement is created in the following migration
    # operations. On SQL databases, remove the original functional index.
    if schema_editor.connection.vendor == 'mongodb':
        return
    CustodyLocation = apps.get_model('custody', 'CustodyLocation')
    schema_editor.remove_constraint(
        CustodyLocation,
        models.UniqueConstraint(Lower('name'), name='custody_location_name_ci_unique'),
    )


def restore_legacy_functional_index(apps, schema_editor):
    if schema_editor.connection.vendor == 'mongodb':
        return
    CustodyLocation = apps.get_model('custody', 'CustodyLocation')
    schema_editor.add_constraint(
        CustodyLocation,
        models.UniqueConstraint(Lower('name'), name='custody_location_name_ci_unique'),
    )


class Migration(migrations.Migration):

    dependencies = [
        ('custody', '0005_unique_custody_location_names'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(
                    remove_legacy_functional_index,
                    restore_legacy_functional_index,
                ),
            ],
            state_operations=[
                migrations.RemoveConstraint(
                    model_name='custodylocation',
                    name='custody_location_name_ci_unique',
                ),
            ],
        ),
        migrations.AddField(
            model_name='custodylocation',
            name='name_key',
            field=models.CharField(default='', editable=False, max_length=150),
        ),
        migrations.RunPython(backfill_name_keys, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='custodylocation',
            name='name_key',
            field=models.CharField(default='', editable=False, max_length=150, unique=True),
        ),
    ]
