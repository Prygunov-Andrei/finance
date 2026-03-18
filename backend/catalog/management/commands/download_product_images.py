"""
Management command: скачать внешние картинки товаров на локальный сервер.
Сохраняет в MinIO (product-media bucket) и обновляет JSONField images.
"""
import os
import time
import hashlib
import requests
from urllib.parse import urlparse

from django.core.management.base import BaseCommand
from django.conf import settings

from catalog.models import Product


class Command(BaseCommand):
    help = 'Download external product images to local media storage'

    def add_arguments(self, parser):
        parser.add_argument('--batch-size', type=int, default=100)
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--timeout', type=int, default=10,
                            help='HTTP timeout per image in seconds')

    def handle(self, *args, **options):
        batch_size = options['batch_size']
        dry_run = options['dry_run']
        timeout = options['timeout']

        media_root = settings.MEDIA_ROOT
        images_dir = os.path.join(media_root, 'product_images')
        os.makedirs(images_dir, exist_ok=True)

        products = Product.objects.exclude(
            images=[]
        ).exclude(
            images__isnull=True
        )
        total = products.count()
        self.stdout.write(f'Products with images: {total}')

        # Count how many already have local URLs
        already_local = 0
        need_download = 0
        for p in products.iterator():
            if p.images and any(url.startswith('http') for url in p.images):
                need_download += 1
            else:
                already_local += 1

        self.stdout.write(f'Already local: {already_local}')
        self.stdout.write(f'Need download: {need_download}')

        if dry_run:
            self.stdout.write('DRY RUN — exiting')
            return

        session = requests.Session()
        session.headers.update({
            'User-Agent': 'Mozilla/5.0 (finans-assistant image downloader)',
        })

        downloaded = 0
        failed = 0
        skipped = 0
        processed_products = 0
        total_images = 0
        start_time = time.time()

        for product in products.iterator(chunk_size=batch_size):
            if not product.images:
                continue

            new_images = []
            changed = False

            for url in product.images:
                total_images += 1

                if not url.startswith('http'):
                    new_images.append(url)
                    skipped += 1
                    continue

                try:
                    parsed = urlparse(url)
                    ext = os.path.splitext(parsed.path)[1] or '.jpg'
                    url_hash = hashlib.md5(url.encode()).hexdigest()[:12]
                    filename = f'{product.id}_{url_hash}{ext}'
                    filepath = os.path.join(images_dir, filename)
                    relative_path = f'/media/product_images/{filename}'

                    if os.path.exists(filepath):
                        new_images.append(relative_path)
                        skipped += 1
                        changed = True
                        continue

                    resp = session.get(url, timeout=timeout)
                    resp.raise_for_status()

                    with open(filepath, 'wb') as f:
                        f.write(resp.content)

                    new_images.append(relative_path)
                    downloaded += 1
                    changed = True

                except Exception as e:
                    self.stderr.write(f'FAIL {product.id} {url}: {e}')
                    new_images.append(url)  # keep original URL on failure
                    failed += 1

            if changed:
                product.images = new_images
                product.save(update_fields=['images'])

            processed_products += 1

            if processed_products % 100 == 0:
                elapsed = time.time() - start_time
                rate = downloaded / elapsed if elapsed > 0 else 0
                self.stdout.write(
                    f'[{processed_products}/{need_download}] '
                    f'downloaded={downloaded} skipped={skipped} '
                    f'failed={failed} rate={rate:.1f} img/s'
                )

        elapsed = time.time() - start_time
        self.stdout.write(self.style.SUCCESS(
            f'\nDONE in {elapsed:.0f}s: '
            f'downloaded={downloaded} skipped={skipped} '
            f'failed={failed} total_images={total_images}'
        ))
