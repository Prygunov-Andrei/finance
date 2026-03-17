"""
Сериализаторы публичного API портала смет.
"""
from rest_framework import serializers

from .models import EstimateRequest, EstimateRequestFile, CallbackRequest


# --- OTP ---

class SendOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ConfirmOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=6, min_length=6)


# --- Estimate Request ---

class CreateEstimateRequestSerializer(serializers.Serializer):
    verification_token = serializers.CharField()
    project_name = serializers.CharField(max_length=255)
    company_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    contact_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    phone = serializers.CharField(max_length=50, required=False, allow_blank=True, default='')
    project_description = serializers.CharField(required=False, allow_blank=True, default='')
    # Honeypot
    company_website = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_company_website(self, value):
        from .security import validate_honeypot
        validate_honeypot(value)
        return value


class EstimateRequestStatusSerializer(serializers.ModelSerializer):
    progress_percent = serializers.IntegerField(read_only=True)

    class Meta:
        model = EstimateRequest
        fields = [
            'status', 'progress_percent',
            'total_files', 'processed_files',
            'total_spec_items', 'matched_exact',
            'matched_analog', 'unmatched',
            'error_message', 'project_name',
            'created_at', 'expires_at',
        ]


class EstimateRequestDetailSerializer(serializers.ModelSerializer):
    progress_percent = serializers.IntegerField(read_only=True)
    files = serializers.SerializerMethodField()

    class Meta:
        model = EstimateRequest
        fields = [
            'access_token', 'email', 'project_name', 'company_name',
            'contact_name', 'phone', 'status', 'progress_percent',
            'total_files', 'processed_files',
            'total_spec_items', 'matched_exact',
            'matched_analog', 'unmatched',
            'error_message', 'created_at', 'expires_at',
            'files',
        ]

    def get_files(self, obj):
        return list(
            obj.files.values('id', 'original_filename', 'file_type', 'parse_status', 'file_size')
        )


# --- Callback ---

class CallbackRequestSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=50)
    preferred_time = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    comment = serializers.CharField(required=False, allow_blank=True, default='')
