from django.db import migrations, models
import objects.models


class Migration(migrations.Migration):

    dependencies = [
        ('objects', '0006_add_registration_window_minutes'),
    ]

    operations = [
        migrations.AddField(
            model_name='object',
            name='photo',
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to=objects.models.object_photo_upload_path,
                verbose_name='Фото объекта',
            ),
        ),
    ]
