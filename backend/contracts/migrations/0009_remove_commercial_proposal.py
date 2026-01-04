# Generated manually

from django.db import migrations


def delete_old_data(apps, schema_editor):
    """Удалить все данные из устаревших моделей"""
    CommercialProposal = apps.get_model('contracts', 'CommercialProposal')
    CommercialProposalEstimateFile = apps.get_model('contracts', 'CommercialProposalEstimateFile')
    
    # Удалить все данные (система не эксплуатировалась)
    CommercialProposalEstimateFile.objects.all().delete()
    CommercialProposal.objects.all().delete()


class Migration(migrations.Migration):
    
    dependencies = [
        ('contracts', '0008_remove_contract_commercial_proposal_and_more'),
        ('proposals', '0001_initial'),  # Новые модели уже созданы
    ]
    
    operations = [
        migrations.RunPython(delete_old_data, migrations.RunPython.noop),
        migrations.DeleteModel(name='CommercialProposalEstimateFile'),
        migrations.DeleteModel(name='CommercialProposal'),
    ]
