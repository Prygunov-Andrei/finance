from django.urls import path

from .views import FileInitView, FileFinalizeView, FileDownloadURLView


urlpatterns = [
    path('v1/files/init/', FileInitView.as_view(), name='kanban-file-init'),
    path('v1/files/finalize/', FileFinalizeView.as_view(), name='kanban-file-finalize'),
    path('v1/files/<uuid:file_id>/download_url/', FileDownloadURLView.as_view(), name='kanban-file-download-url'),
]

