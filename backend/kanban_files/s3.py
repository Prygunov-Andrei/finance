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


def _to_public_url(internal_url: str) -> str:
    public_base = getattr(settings, 'KANBAN_S3_PUBLIC_URL', None)
    if not public_base:
        return internal_url
    internal_base = settings.KANBAN_S3_ENDPOINT_URL
    if internal_base and internal_url.startswith(internal_base):
        return internal_url.replace(internal_base, public_base, 1)
    return internal_url


def presign_put(bucket: str, key: str, content_type: str, expires_in: int = 600) -> str:
    client = _get_s3_client()
    url = client.generate_presigned_url(
        ClientMethod='put_object',
        Params={'Bucket': bucket, 'Key': key, 'ContentType': content_type or 'application/octet-stream'},
        ExpiresIn=expires_in,
    )
    return _to_public_url(url)


def presign_get(bucket: str, key: str, expires_in: int = 600) -> str:
    client = _get_s3_client()
    url = client.generate_presigned_url(
        ClientMethod='get_object',
        Params={'Bucket': bucket, 'Key': key},
        ExpiresIn=expires_in,
    )
    return _to_public_url(url)


def head_object(bucket: str, key: str) -> dict:
    client = _get_s3_client()
    return client.head_object(Bucket=bucket, Key=key)

