"""Wave 11: тесты management команды rename_legacy_filenames."""
from __future__ import annotations

from io import StringIO
from pathlib import Path

import pytest
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management import call_command

from ac_brands.tests.factories import BrandFactory
from ac_catalog.models import ACModelPhoto
from ac_catalog.tests.factories import ACModelFactory


CYRILLIC_NAME = "Снимок_тест.png"
LATIN_PREFIX = "snimok"


def _save_raw_file(rel_path: str, content: bytes = b"\x89PNG\r\n\x1a\n") -> str:
    """Сохраняет файл напрямую через storage с заданным rel_path —
    минуя pre_save signal модели (чтобы reproduce legacy состояние)."""
    return default_storage.save(rel_path, ContentFile(content))


@pytest.fixture
def media_root(tmp_path: Path, settings) -> Path:
    settings.MEDIA_ROOT = str(tmp_path)
    return tmp_path


@pytest.mark.django_db
def test_dry_run_does_not_rename(media_root: Path):
    """Без --execute БД и storage не меняются, но команда выводит план."""
    raw_name = f"ac-models/photos/{CYRILLIC_NAME}"
    saved_name = _save_raw_file(raw_name)
    photo = ACModelPhoto.objects.create(
        model=ACModelFactory(), order=0,
    )
    # bypass pre_save signal: пишем имя напрямую в БД
    ACModelPhoto.objects.filter(pk=photo.pk).update(image=saved_name)
    photo.refresh_from_db()
    assert "Снимок" in photo.image.name

    out = StringIO()
    call_command("rename_legacy_filenames", stdout=out)

    output = out.getvalue()
    assert "DRY RUN" in output
    assert saved_name in output
    assert LATIN_PREFIX in output.lower()

    photo.refresh_from_db()
    assert "Снимок" in photo.image.name
    assert default_storage.exists(saved_name)


@pytest.mark.django_db
def test_execute_renames_file_and_db(media_root: Path):
    """С --execute файл копируется на новое имя, старый удаляется,
    FK в БД обновляется."""
    raw_name = f"ac-models/photos/{CYRILLIC_NAME}"
    saved_name = _save_raw_file(raw_name)
    photo = ACModelPhoto.objects.create(model=ACModelFactory(), order=0)
    ACModelPhoto.objects.filter(pk=photo.pk).update(image=saved_name)

    out = StringIO()
    call_command("rename_legacy_filenames", "--execute", stdout=out)

    photo.refresh_from_db()
    new_name = photo.image.name
    assert all(c.isascii() for c in new_name), f"имя должно быть ASCII: {new_name}"
    assert new_name.startswith("ac-models/photos/")
    assert default_storage.exists(new_name)
    assert not default_storage.exists(saved_name), "старый файл должен быть удалён"


@pytest.mark.django_db
def test_skip_already_latin(media_root: Path):
    """Файлы с уже-латинским именем не трогаются (idempotent)."""
    brand = BrandFactory()
    raw_name = "brand-logos/funai.png"
    saved_name = _save_raw_file(raw_name)
    type(brand).objects.filter(pk=brand.pk).update(logo=saved_name)
    brand.refresh_from_db()

    out = StringIO()
    call_command("rename_legacy_filenames", "--execute", stdout=out)

    brand.refresh_from_db()
    assert brand.logo.name == saved_name
    assert default_storage.exists(saved_name)


@pytest.mark.django_db
def test_missing_storage_file_warns_and_skips(media_root: Path):
    """Если БД ссылается на отсутствующий файл — warning, БД не трогается."""
    photo = ACModelPhoto.objects.create(model=ACModelFactory(), order=0)
    missing_name = f"ac-models/photos/{CYRILLIC_NAME}"
    ACModelPhoto.objects.filter(pk=photo.pk).update(image=missing_name)

    out = StringIO()
    call_command("rename_legacy_filenames", "--execute", stdout=out)

    output = out.getvalue()
    assert "missing" in output.lower()

    photo.refresh_from_db()
    assert photo.image.name == missing_name


@pytest.mark.django_db
def test_collision_warns_and_skips(media_root: Path):
    """Если новое имя уже занято на storage — warning, БД не трогается."""
    raw_legacy = f"ac-models/photos/{CYRILLIC_NAME}"
    legacy_saved = _save_raw_file(raw_legacy)
    # Записываем «оккупанта» с тем именем, в которое slugify хотел бы переименовать.
    expected_new = "ac-models/photos/snimok_test.png"
    _save_raw_file(expected_new, content=b"OCCUPIED")

    photo = ACModelPhoto.objects.create(model=ACModelFactory(), order=0)
    ACModelPhoto.objects.filter(pk=photo.pk).update(image=legacy_saved)

    out = StringIO()
    call_command("rename_legacy_filenames", "--execute", stdout=out)

    output = out.getvalue()
    assert "collision" in output.lower()

    photo.refresh_from_db()
    assert photo.image.name == legacy_saved
    assert default_storage.exists(legacy_saved)
    assert default_storage.exists(expected_new)
