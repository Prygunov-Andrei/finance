from django.conf import settings


def _get_s3_client():
    import boto3
    return boto3.client(
        's3',
        endpoint_url=settings.KANBAN_S3_ENDPOINT_URL,
        aws_access_key_id=settings.KANBAN_S3_ACCESS_KEY,
        aws_secret_access_key=settings.KANBAN_S3_SECRET_KEY,
        region_name=settings.KANBAN_S3_REGION,
    )


def presign_put(bucket: str, key: str, content_type: str, expires_in: int = 600) -> str:
    client = _get_s3_client()
    return client.generate_presigned_url(
        ClientMethod='put_object',
        Params={'Bucket': bucket, 'Key': key, 'ContentType': content_type or 'application/octet-stream'},
        ExpiresIn=expires_in,
    )


def presign_get(bucket: str, key: str, expires_in: int = 600) -> str:
    client = _get_s3_client()
    return client.generate_presigned_url(
        ClientMethod='get_object',
        Params={'Bucket': bucket, 'Key': key},
        ExpiresIn=expires_in,
    )


def head_object(bucket: str, key: str) -> dict:
    client = _get_s3_client()
    return client.head_object(Bucket=bucket, Key=key)

