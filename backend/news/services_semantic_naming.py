"""Wave 13: семантические имена картинок новостей через LLM (Gemini).

Используется management-командой ``semantic_rename_images``. Логика разбита на
чистые функции (build_context, parse_slug, replace_in_html), чтобы удобно
тестировать без real Gemini.

После Wave 11 файлы автоматически транслитерируются Wave 11
(``snimok_ehkrana_2026-02-12.png``). Эта Wave 13 переименовывает их в более
SEO-friendly slug'и на основе сюжета (``novyi-kompressor-danfoss.png``).
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Iterable, Optional
from urllib.parse import unquote

from .llm_client import NewsLLMClient
from .models import MediaUpload, NewsMedia, NewsPost


# ---------------------------------------------------------------------------
# Регулярные выражения и константы
# ---------------------------------------------------------------------------

# Поля NewsPost, в которых ищем inline <img>.
HTML_FIELDS_POST = ("body", "lede", "rating_explanation")

# Поля NewsDuplicateGroup, синхронизируемые при rename.
HTML_FIELDS_DUP_GROUP = ("merged_body",)

URL_PREFIXES = ("/media/", "/hvac-media/")

IMG_TAG_RE = re.compile(r"<img\b[^>]*>", re.IGNORECASE)
ATTR_SRC_RE = re.compile(r'src\s*=\s*["\']([^"\']+)["\']', re.IGNORECASE)
ATTR_ALT_RE = re.compile(r'alt\s*=\s*["\']([^"\']*)["\']', re.IGNORECASE)

# Slug, который мы готовы принять от LLM: 5-80 ASCII-символов из [a-z0-9-].
SLUG_RE = re.compile(r"^[a-z0-9-]{5,80}$")

# Эвристика «basename выглядит auto-generated» (значит достоин переименования).
# Wave 11 транслитерация → snimok_*, ehkran_* и др.
_NON_SEMANTIC_PATTERNS = [
    re.compile(r"^snimok[-_]", re.IGNORECASE),
    re.compile(r"^screenshot[-_]?", re.IGNORECASE),
    re.compile(r"^screen[-_]", re.IGNORECASE),
    re.compile(r"^ehkran[-_]", re.IGNORECASE),
    re.compile(r"^image[-_]?\d*$", re.IGNORECASE),
    re.compile(r"^img[-_]?\d*$", re.IGNORECASE),
    re.compile(r"^photo[-_]?\d*$", re.IGNORECASE),
    re.compile(r"^picture[-_]?\d*$", re.IGNORECASE),
    re.compile(r"^untitled", re.IGNORECASE),
    re.compile(r"^file[-_]?\d*$", re.IGNORECASE),
    re.compile(r"^media[-_]?\d*$", re.IGNORECASE),
    re.compile(r"^upload", re.IGNORECASE),
    re.compile(r"^\d+$"),                           # чистые цифры
    re.compile(r"^[a-f0-9]{16,}$", re.IGNORECASE),  # хэш-имена
    re.compile(r"^foto", re.IGNORECASE),            # русское «фото»
    re.compile(r"^kartinka", re.IGNORECASE),        # русское «картинка»
    re.compile(r"^izobrazhenie", re.IGNORECASE),    # русское «изображение»
]


# ---------------------------------------------------------------------------
# Dataclass для одной картинки
# ---------------------------------------------------------------------------

@dataclass
class ImageRef:
    """Описывает одну уникальную картинку, найденную в посте.

    Один файл (storage_name) может встречаться:
    - inline в одном или нескольких HTML-полях;
    - быть привязан к NewsMedia/MediaUpload (FK или по совпадению пути);
    - дублироваться в merged_body группы дубликатов.

    Сюда мы агрегируем все ссылки и используем при rename для одновременного
    обновления storage + файлов БД + HTML.
    """

    storage_name: str
    alt: str = ""
    file_field_owners: list = field(default_factory=list)  # NewsMedia / MediaUpload


# ---------------------------------------------------------------------------
# URL-утилиты
# ---------------------------------------------------------------------------

def url_to_storage_name(url: str) -> Optional[str]:
    """Превращает URL картинки в относительный storage path.

    Примеры:
        '/media/news/uploads/2026/02/snimok_X.png' → 'news/uploads/2026/02/snimok_X.png'
        'https://hvac-info.com/media/news/media/foo.jpg' → 'news/media/foo.jpg'
        '/static/img/logo.svg' → None (вне media)

    URL-percent-encoding (`%D0%XX`) декодируется.
    """
    if not url:
        return None
    # Разделяем protocol+host от пути.
    m = re.match(r"^(?:https?://[^/]+)?(/[^?#]+)", url)
    if not m:
        return None
    path = unquote(m.group(1))
    for prefix in URL_PREFIXES:
        if path.startswith(prefix):
            return path[len(prefix):]
    return None


def is_auto_generated_basename(basename: str) -> bool:
    """True если файл выглядит как auto-generated (snimok_*, image-1, hash и т.п.)."""
    base, _ext = os.path.splitext(basename)
    if not base:
        return False
    return any(p.search(base) for p in _NON_SEMANTIC_PATTERNS)


# ---------------------------------------------------------------------------
# Извлечение картинок из HTML
# ---------------------------------------------------------------------------

def _extract_imgs_from_html(html: str) -> list[tuple[str, str]]:
    """Возвращает список (src, alt) для всех <img> в HTML."""
    out = []
    for m in IMG_TAG_RE.finditer(html or ""):
        tag = m.group(0)
        src_m = ATTR_SRC_RE.search(tag)
        if not src_m:
            continue
        alt_m = ATTR_ALT_RE.search(tag)
        out.append((src_m.group(1), alt_m.group(1) if alt_m else ""))
    return out


def collect_post_images(post: NewsPost) -> list[ImageRef]:
    """Собирает все уникальные картинки данного поста — inline + связанные FK."""
    refs: dict[str, ImageRef] = {}

    # 1. Inline <img> в HTML-полях (и поста, и группы дубликатов).
    html_sources: list[str] = [getattr(post, f, "") or "" for f in HTML_FIELDS_POST]
    if post.duplicate_group_id:
        for f in HTML_FIELDS_DUP_GROUP:
            html_sources.append(getattr(post.duplicate_group, f, "") or "")

    for html in html_sources:
        for src, alt in _extract_imgs_from_html(html):
            sname = url_to_storage_name(src)
            if not sname:
                continue
            ref = refs.get(sname)
            if not ref:
                ref = ImageRef(storage_name=sname, alt=alt)
                refs[sname] = ref
            elif alt and not ref.alt:
                ref.alt = alt

    # 2. NewsMedia (FK к посту) — могут быть не упомянуты в body.
    for media in post.media.all():
        if not media.file or not media.file.name:
            continue
        sname = media.file.name
        ref = refs.get(sname)
        if not ref:
            ref = ImageRef(storage_name=sname)
            refs[sname] = ref
        if media not in ref.file_field_owners:
            ref.file_field_owners.append(media)

    # 3. MediaUpload не имеет FK на NewsPost — ищем по storage_name всё, что
    #    физически совпадает с уже найденными inline-ссылками.
    for sname in list(refs.keys()):
        for upload in MediaUpload.objects.filter(file=sname):
            if upload not in refs[sname].file_field_owners:
                refs[sname].file_field_owners.append(upload)
        # NewsMedia может встречаться по storage_name из «другого» поста —
        # такое редко, но если да, тоже добавим, чтобы их FileField обновился.
        for nm in NewsMedia.objects.filter(file=sname):
            if nm not in refs[sname].file_field_owners:
                refs[sname].file_field_owners.append(nm)

    return list(refs.values())


# ---------------------------------------------------------------------------
# Контекст и prompt для LLM
# ---------------------------------------------------------------------------

PROMPT_TEMPLATE = """Сгенерируй короткий SEO-friendly slug для имени файла картинки в новости.

Заголовок новости: {title}
Alt-текст картинки: {alt}
Текст вокруг картинки: {context}

Требования к ответу:
- 3-6 слов латиницей через дефис (snake_case или kebab-case — оба ок)
- Только нижний регистр и цифры, без расширения файла
- Если бренд/продукт упомянут — включи его в slug
- Транслитерация русских названий через ГОСТ (Данфосс → danfoss, Хабаровск → habarovsk)
- Длина итогового slug — от 5 до 80 символов

Ответь ТОЛЬКО slug'ом, одной строкой, без пояснений и кавычек.

Пример:
  Заголовок: "Новый компрессор Danfoss для домашних кондиционеров"
  Alt: "ротационный компрессор"
  Текст: "...компания Danfoss представила новый ротационный компрессор..."
  Slug: novyi-kompressor-danfoss-rotational

Slug:"""


def build_context(post: NewsPost, ref: ImageRef, window: int = 250) -> str:
    """Извлекает текст 200-300 символов вокруг inline `<img src=...sname...>`."""
    body = post.body or ""
    sname = ref.storage_name
    basename = os.path.basename(sname)
    if basename:
        # Ищем basename — он одинаков и в /media/news/X/foo.png, и в percent-encoded форме.
        m = re.search(re.escape(basename), body)
        if m:
            start = max(0, m.start() - window)
            end = min(len(body), m.end() + window)
            chunk = body[start:end]
        else:
            chunk = ((post.lede or "") + "\n" + body)[:window * 2]
    else:
        chunk = ((post.lede or "") + "\n" + body)[:window * 2]
    # Strip HTML-тегов и nbsp.
    chunk = re.sub(r"<[^>]+>", " ", chunk)
    chunk = chunk.replace("\xa0", " ")
    chunk = re.sub(r"\s+", " ", chunk).strip()
    return chunk[: window * 2]


def build_prompt(post: NewsPost, ref: ImageRef) -> str:
    return PROMPT_TEMPLATE.format(
        title=(post.title or "")[:200],
        alt=ref.alt[:200] if ref.alt else "(нет)",
        context=build_context(post, ref),
    )


# ---------------------------------------------------------------------------
# LLM call + парсинг ответа
# ---------------------------------------------------------------------------

def parse_slug(raw: Optional[str]) -> Optional[str]:
    """Чистит ответ LLM до корректного slug или возвращает None."""
    if not raw:
        return None
    stripped = raw.strip()
    if not stripped:
        return None
    s = stripped.splitlines()[0].strip()
    s = s.strip("\"'`")
    s = s.lower()
    # Транслитерируем нелатиницу на всякий случай (LLM иногда даёт кириллицу).
    s = re.sub(r"[ \s]+", "-", s)
    s = s.replace("_", "-")
    # Любая последовательность не-[a-z0-9-] символов становится одним дефисом
    # (так пунктуация и пробелы внутри slug превращаются в разделители).
    s = re.sub(r"[^a-z0-9-]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    if SLUG_RE.match(s):
        return s
    return None


def make_gemini_client(model: str = "gemini-2.0-flash-exp", timeout: int = 20) -> NewsLLMClient:
    """Тонкая обёртка: NewsLLMClient заточенный под Gemini, без fallback."""
    return NewsLLMClient(
        primary_provider="gemini",
        fallback_chain=[],
        temperature=0.2,
        timeout=timeout,
        gemini_model=model,
    )


def make_llm_client(provider: str = "gemini", model: Optional[str] = None,
                    timeout: int = 20) -> NewsLLMClient:
    """Универсальный конструктор: gemini / grok / anthropic / openai.

    Используется management командой; основной провайдер по дефолту gemini
    (выбор PO для Wave 13). Возможность переключения на grok оставлена,
    чтобы делать dry-run пока GEMINI_API_KEY ещё не добавлен на проде.
    """
    kwargs = {
        "primary_provider": provider,
        "fallback_chain": [],
        "temperature": 0.2,
        "timeout": timeout,
    }
    if model:
        kwargs[f"{provider}_model"] = model
    return NewsLLMClient(**kwargs)


def generate_slug(post: NewsPost, ref: ImageRef, client: NewsLLMClient) -> Optional[str]:
    """Возвращает корректный slug или None при ошибке/невалидном ответе."""
    prompt = build_prompt(post, ref)
    raw = client.query_raw(prompt)
    return parse_slug(raw)


# ---------------------------------------------------------------------------
# Замена URL'ов в HTML
# ---------------------------------------------------------------------------

def replace_basename_in_html(html: str, old_basename: str, new_basename: str) -> tuple[str, int]:
    """Меняет basename в src/href атрибутах и CSS url() — НЕ в текстовом контенте.

    Идемпотентно: если old_basename == new_basename — сразу возвращает (html, 0).
    """
    if not html or not old_basename or old_basename == new_basename:
        return html, 0

    count = 0
    safe_old = re.escape(old_basename)

    attr_pat = re.compile(
        r'(?P<attr>(?:src|href)\s*=\s*)(?P<quote>["\'])(?P<url>[^"\']*'
        + safe_old
        + r')(?P=quote)',
        re.IGNORECASE,
    )
    css_pat = re.compile(
        r'(?P<prefix>url\()(?P<url>[^()]*' + safe_old + r')(?P<suffix>\))',
        re.IGNORECASE,
    )

    def _sub_attr(m: re.Match) -> str:
        nonlocal count
        url = m.group("url")
        new_url = url[: -len(old_basename)] + new_basename
        count += 1
        return f'{m.group("attr")}{m.group("quote")}{new_url}{m.group("quote")}'

    def _sub_css(m: re.Match) -> str:
        nonlocal count
        url = m.group("url")
        new_url = url[: -len(old_basename)] + new_basename
        count += 1
        return f'{m.group("prefix")}{new_url}{m.group("suffix")}'

    html = attr_pat.sub(_sub_attr, html)
    html = css_pat.sub(_sub_css, html)
    return html, count


# ---------------------------------------------------------------------------
# Планирование нового пути с учётом коллизий
# ---------------------------------------------------------------------------

def plan_new_storage_name(
    old_storage_name: str,
    slug: str,
    storage,
    extra_taken: Iterable[str] = (),
) -> str:
    """Конструирует новый storage path: ``<dirname>/<slug><ext>``.

    При коллизии добавляет суффикс ``-2``, ``-3`` ... до первого свободного.

    ``extra_taken`` — путям, которые ещё не существуют на диске, но будут в этом
    же run-е (мы запланировали их раньше). Передаётся snapshot in-memory.
    """
    dirname = os.path.dirname(old_storage_name)
    ext = os.path.splitext(old_storage_name)[1].lower() or ".png"

    def candidate(suffix: str = "") -> str:
        base = slug + suffix
        return f"{dirname}/{base}{ext}" if dirname else f"{base}{ext}"

    extra_set = set(extra_taken)
    suffix = ""
    n = 1
    while True:
        path = candidate(suffix)
        if path == old_storage_name:
            return path
        if not storage.exists(path) and path not in extra_set:
            return path
        n += 1
        suffix = f"-{n}"
        if n > 99:
            # Очень крайний edge case — fallback с file id.
            raise RuntimeError(f"Не могу подобрать имя для slug={slug!r} после 99 попыток")
