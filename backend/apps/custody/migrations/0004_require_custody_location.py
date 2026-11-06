import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('custody', '0003_custody_locations'),
    ]

    operations = [
        migrations.AlterField(
            model_name='locker',
            name='custody_location',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='lockers',
                to='custody.custodylocation',
            ),
        ),
    ]
