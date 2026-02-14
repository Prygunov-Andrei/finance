from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import FileObject
from .serializers import FileInitSerializer, FileFinalizeSerializer, FileObjectSerializer
from . import s3
from django.conf import settings


def _object_key_for_sha256(sha256: str) -> str:
    prefix = sha256[:2]
    return f'sha256/{prefix}/{sha256}'


class FileInitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = FileInitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        sha256 = data['sha256'].lower()
        bucket = settings.KANBAN_S3_BUCKET_NAME

        existing = FileObject.objects.filter(sha256=sha256, status=FileObject.Status.READY).first()
        if existing:
            return Response({
                'already_exists': True,
                'file': FileObjectSerializer(existing).data,
            })

        obj_key = _object_key_for_sha256(sha256)

        file_obj, created = FileObject.objects.get_or_create(
            sha256=sha256,
            defaults={
                'size_bytes': data['size_bytes'],
                'mime_type': data.get('mime_type', ''),
                'original_filename': data.get('original_filename', ''),
                'bucket': bucket,
                'object_key': obj_key,
                'status': FileObject.Status.UPLOADING,
                'created_by_user_id': getattr(request.user, 'user_id', None),
                'created_by_username': getattr(request.user, 'username', '') or '',
            }
        )

        # Если запись уже была, но не готова — переиспользуем.
        upload_url = s3.presign_put(bucket=file_obj.bucket, key=file_obj.object_key, content_type=file_obj.mime_type)

        return Response({
            'already_exists': False,
            'created': created,
            'file': FileObjectSerializer(file_obj).data,
            'upload_url': upload_url,
        }, status=status.HTTP_201_CREATED)


class FileFinalizeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = FileFinalizeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        file_id = serializer.validated_data['file_id']

        try:
            file_obj = FileObject.objects.get(id=file_id)
        except FileObject.DoesNotExist:
            return Response({'error': 'file not found'}, status=status.HTTP_404_NOT_FOUND)

        # ACL: владелец или сервис.
        if not getattr(request.user, 'is_service', False):
            if file_obj.created_by_user_id is not None and getattr(request.user, 'user_id', None) != file_obj.created_by_user_id:
                return Response({'error': 'forbidden'}, status=status.HTTP_403_FORBIDDEN)

        # Проверяем, что объект существует.
        try:
            meta = s3.head_object(bucket=file_obj.bucket, key=file_obj.object_key)
        except Exception:
            return Response({'error': 'object not found in storage'}, status=status.HTTP_400_BAD_REQUEST)

        content_length = int(meta.get('ContentLength') or 0)
        if content_length and file_obj.size_bytes and content_length != int(file_obj.size_bytes):
            return Response(
                {'error': 'size mismatch', 'expected': file_obj.size_bytes, 'actual': content_length},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file_obj.status = FileObject.Status.READY
        file_obj.save(update_fields=['status', 'updated_at'])

        return Response(FileObjectSerializer(file_obj).data)


class FileDownloadURLView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, file_id):
        try:
            file_obj = FileObject.objects.get(id=file_id, status=FileObject.Status.READY)
        except FileObject.DoesNotExist:
            return Response({'error': 'file not found'}, status=status.HTTP_404_NOT_FOUND)

        if not getattr(request.user, 'is_service', False):
            if file_obj.created_by_user_id is not None and getattr(request.user, 'user_id', None) != file_obj.created_by_user_id:
                return Response({'error': 'forbidden'}, status=status.HTTP_403_FORBIDDEN)

        url = s3.presign_get(bucket=file_obj.bucket, key=file_obj.object_key)
        return Response({'download_url': url})

